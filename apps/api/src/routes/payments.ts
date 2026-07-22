// Payments & subscriptions (spec §11) — Phase 1, internal tracking.
//
// This is manual/internal accounting: a coach records subscriptions and
// received payments; the platform commission is computed from PLATFORM_FEE_PERCENT.
// A real payment-provider integration (ЮKassa / Telegram Payments / …) plugs in
// later behind the same Payment.provider / providerRef fields.
//
//   Coach:
//     POST /coach/clients/:id/subscriptions  — create a subscription
//     GET  /coach/subscriptions              — list with client + paid totals
//     POST /coach/subscriptions/:id/payments — record a received payment
//     POST /coach/subscriptions/:id/cancel   — cancel a subscription
//     GET  /coach/revenue                    — revenue + commission summary
//   Owner:
//     GET  /owner/revenue                    — platform-wide GMV & commission

import type { FastifyPluginAsync } from 'fastify';
import { prisma } from '@jet/db';
import { env } from '../env.js';
import { requireCoach, requireOwner } from '../auth/guards.js';
import { notifyUser } from '../notify.js';

const CURRENCY = 'RUB';

// Amounts cross the API in major units (₽); the DB stores minor units (kopecks).
const toMinor = (major: number) => Math.round(major * 100);
const toMajor = (minor: number) => Math.round(minor) / 100;
const feePercent = () => (Number.isFinite(env.platformFeePercent) ? env.platformFeePercent : 10);
const commissionOf = (minor: number) => Math.round((minor * feePercent()) / 100);

// Russian plural for "тренировка": 1 → тренировка, 2–4 → тренировки, else тренировок.
function workoutWord(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'тренировка';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'тренировки';
  return 'тренировок';
}

export const paymentRoutes: FastifyPluginAsync = async (fastify) => {
  // ── Create a subscription for a client ──────────────────────────
  fastify.post<{
    Params: { id: string };
    Body: { planName: string; amount: number; periodDays: number; workouts?: number };
  }>('/coach/clients/:id/subscriptions', { preHandler: fastify.requireAuth }, async (request, reply) => {
    if (!(await requireCoach(request, reply))) return;
    const auth = request.auth!;
    const { planName, amount, periodDays, workouts } = request.body ?? ({} as never);
    if (!planName?.trim() || !amount || amount <= 0 || !periodDays || periodDays <= 0) {
      reply.code(400).send({ error: 'bad_request', reason: 'invalid_subscription' });
      return;
    }
    const workoutsCount =
      workouts != null && Number.isFinite(Number(workouts)) && Number(workouts) > 0
        ? Math.round(Number(workouts))
        : null;
    const link = await prisma.coachClient.findUnique({
      where: { coachId_clientId: { coachId: auth.userId, clientId: request.params.id } },
      select: { id: true },
    });
    if (!link) {
      reply.code(404).send({ error: 'not_found', reason: 'client_not_found' });
      return;
    }
    const currentPeriodEnd = new Date(Date.now() + periodDays * 24 * 60 * 60 * 1000);
    const sub = await prisma.subscription.create({
      data: {
        coachId: auth.userId,
        clientId: request.params.id,
        planName: planName.trim(),
        amount: toMinor(amount),
        currency: CURRENCY,
        periodDays,
        workouts: workoutsCount,
        status: 'active',
        currentPeriodEnd,
      },
      select: { id: true },
    });
    const workoutsNote = workoutsCount ? `, ${workoutsCount} ${workoutWord(workoutsCount)}` : '';
    await notifyUser(
      request.params.id,
      `💳 Тренер оформил подписку «${planName.trim()}» — ${amount} ₽ на ${periodDays} дн.${workoutsNote}`,
      { type: 'payment' },
    );
    return { ok: true, id: sub.id };
  });

  // ── List the coach's subscriptions ──────────────────────────────
  fastify.get('/coach/subscriptions', { preHandler: fastify.requireAuth }, async (request, reply) => {
    if (!(await requireCoach(request, reply))) return;
    const auth = request.auth!;
    const subs = await prisma.subscription.findMany({
      where: { coachId: auth.userId },
      orderBy: { createdAt: 'desc' },
      include: {
        payments: { where: { status: 'paid' }, select: { amount: true } },
      },
    });
    // Client names in one query.
    const clientIds = [...new Set(subs.map((s) => s.clientId))];
    const clients = await prisma.user.findMany({
      where: { id: { in: clientIds } },
      select: { id: true, firstName: true, username: true },
    });
    const nameOf = new Map(clients.map((c) => [c.id, c.firstName || (c.username ? `@${c.username}` : 'Клиент')]));

    return subs.map((s) => ({
      id: s.id,
      clientId: s.clientId,
      clientName: nameOf.get(s.clientId) ?? 'Клиент',
      planName: s.planName,
      amount: toMajor(s.amount),
      periodDays: s.periodDays,
      workouts: s.workouts,
      sessionsUsed: s.sessionsUsed,
      status: s.status,
      currentPeriodEnd: s.currentPeriodEnd,
      paidTotal: toMajor(s.payments.reduce((n, p) => n + p.amount, 0)),
      paymentsCount: s.payments.length,
    }));
  });

  // ── Mark trainings from the block as attended (± delta) ─────────
  fastify.post<{ Params: { id: string }; Body: { delta?: number } }>(
    '/coach/subscriptions/:id/sessions',
    { preHandler: fastify.requireAuth },
    async (request, reply) => {
      if (!(await requireCoach(request, reply))) return;
      const auth = request.auth!;
      const sub = await prisma.subscription.findFirst({
        where: { id: request.params.id, coachId: auth.userId },
      });
      if (!sub) {
        reply.code(404).send({ error: 'not_found' });
        return;
      }
      const delta = Math.trunc(Number(request.body?.delta ?? 1)) || 0;
      const cap = sub.workouts ?? 9999;
      const next = Math.max(0, Math.min(cap, sub.sessionsUsed + delta));
      await prisma.subscription.update({
        where: { id: sub.id },
        data: { sessionsUsed: next },
      });
      // Nudge the client only when a session is added (not on corrections).
      if (delta > 0 && sub.workouts) {
        await notifyUser(
          sub.clientId,
          `✅ Тренер отметил тренировку — ${next} из ${sub.workouts} по блоку «${sub.planName}»`,
          { type: 'payment' },
        );
      }
      return { ok: true, sessionsUsed: next };
    },
  );

  // ── Record a received payment against a subscription ────────────
  fastify.post<{ Params: { id: string }; Body: { amount?: number; renew?: boolean } }>(
    '/coach/subscriptions/:id/payments',
    { preHandler: fastify.requireAuth },
    async (request, reply) => {
      if (!(await requireCoach(request, reply))) return;
      const auth = request.auth!;
      const sub = await prisma.subscription.findFirst({
        where: { id: request.params.id, coachId: auth.userId },
      });
      if (!sub) {
        reply.code(404).send({ error: 'not_found' });
        return;
      }
      const amountMinor = request.body?.amount ? toMinor(request.body.amount) : sub.amount;
      // Installments: a part-payment (renew=false) just records money and keeps
      // the block active, without pushing the period end forward each time.
      // A period renewal (renew=true, the default) extends the validity window.
      const renew = request.body?.renew !== false;

      const base = sub.currentPeriodEnd && sub.currentPeriodEnd > new Date()
        ? sub.currentPeriodEnd
        : new Date();
      const nextEnd = renew
        ? new Date(base.getTime() + sub.periodDays * 24 * 60 * 60 * 1000)
        : sub.currentPeriodEnd;

      await prisma.$transaction([
        prisma.payment.create({
          data: {
            subscriptionId: sub.id,
            coachId: auth.userId,
            clientId: sub.clientId,
            amount: amountMinor,
            currency: sub.currency,
            status: 'paid',
            provider: 'manual',
            paidAt: new Date(),
          },
        }),
        prisma.subscription.update({
          where: { id: sub.id },
          data: { status: 'active', currentPeriodEnd: nextEnd },
        }),
      ]);
      return {
        ok: true,
        amount: toMajor(amountMinor),
        commission: toMajor(commissionOf(amountMinor)),
        currentPeriodEnd: nextEnd,
      };
    },
  );

  // ── Cancel a subscription ───────────────────────────────────────
  fastify.post<{ Params: { id: string } }>(
    '/coach/subscriptions/:id/cancel',
    { preHandler: fastify.requireAuth },
    async (request, reply) => {
      if (!(await requireCoach(request, reply))) return;
      const auth = request.auth!;
      const sub = await prisma.subscription.findFirst({
        where: { id: request.params.id, coachId: auth.userId },
        select: { id: true },
      });
      if (!sub) {
        reply.code(404).send({ error: 'not_found' });
        return;
      }
      await prisma.subscription.update({ where: { id: sub.id }, data: { status: 'canceled' } });
      return { ok: true };
    },
  );

  // ── Coach revenue summary ───────────────────────────────────────
  fastify.get('/coach/revenue', { preHandler: fastify.requireAuth }, async (request, reply) => {
    if (!(await requireCoach(request, reply))) return;
    const auth = request.auth!;
    const payments = await prisma.payment.findMany({
      where: { coachId: auth.userId, status: 'paid' },
      select: { amount: true, paidAt: true },
    });
    const summary = summarize(payments);
    return { ...summary, feePercent: feePercent() };
  });

  // ── Owner: platform-wide revenue & commission ───────────────────
  fastify.get('/owner/revenue', { preHandler: fastify.requireAuth }, async (request, reply) => {
    if (!(await requireOwner(request, reply))) return;
    const payments = await prisma.payment.findMany({
      where: { status: 'paid' },
      select: { amount: true, paidAt: true, coachId: true },
    });
    const summary = summarize(payments);

    // Per-coach breakdown.
    const byCoach = new Map<string, number>();
    for (const p of payments) byCoach.set(p.coachId, (byCoach.get(p.coachId) ?? 0) + p.amount);
    const coaches = await prisma.user.findMany({
      where: { id: { in: [...byCoach.keys()] } },
      select: { id: true, firstName: true, username: true },
    });
    const nameOf = new Map(
      coaches.map((c) => [c.id, c.firstName || (c.username ? `@${c.username}` : 'Тренер')]),
    );
    const perCoach = [...byCoach.entries()]
      .map(([coachId, minor]) => ({
        coachId,
        coachName: nameOf.get(coachId) ?? 'Тренер',
        gross: toMajor(minor),
        commission: toMajor(commissionOf(minor)),
      }))
      .sort((a, b) => b.gross - a.gross);

    return {
      ...summary,
      feePercent: feePercent(),
      coachesCount: byCoach.size,
      perCoach,
    };
  });
};

function summarize(payments: Array<{ amount: number; paidAt: Date | null }>) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  let grossMinor = 0;
  let monthMinor = 0;
  for (const p of payments) {
    grossMinor += p.amount;
    if (p.paidAt && p.paidAt >= monthStart) monthMinor += p.amount;
  }
  const commissionMinor = commissionOf(grossMinor);
  return {
    gross: toMajor(grossMinor),
    thisMonth: toMajor(monthMinor),
    commission: toMajor(commissionMinor),
    net: toMajor(grossMinor - commissionMinor),
    paymentsCount: payments.length,
  };
}
