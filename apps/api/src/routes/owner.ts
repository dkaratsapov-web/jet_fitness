// Platform owner admin panel & moderation (spec §2, Phase 3).
//
//   GET  /owner/stats                 — platform-wide totals
//   GET  /owner/coaches               — all coaches with metrics
//   GET  /owner/clients               — all clients
//   POST /owner/users/:id/suspend     — suspend / unsuspend a user (moderation)

import type { FastifyPluginAsync } from 'fastify';
import { prisma } from '@jet/db';
import { requireOwner } from '../auth/guards.js';
import { notifyUser } from '../notify.js';
import { env } from '../env.js';
import { fatSecretDiagnostics } from '../nutrition/fatsecret.js';

const nameOfUser = (u: { firstName: string | null; username: string | null }) =>
  u.firstName || (u.username ? `@${u.username}` : 'Пользователь');

export const ownerRoutes: FastifyPluginAsync = async (fastify) => {
  // ── Integrations diagnostics (FatSecret) ────────────────────────
  fastify.get('/owner/diagnostics', { preHandler: fastify.requireAuth }, async (request, reply) => {
    if (!(await requireOwner(request, reply))) return;
    return { fatsecret: await fatSecretDiagnostics() };
  });

  // ── Platform stats ──────────────────────────────────────────────
  fastify.get('/owner/stats', { preHandler: fastify.requireAuth }, async (request, reply) => {
    if (!(await requireOwner(request, reply))) return;
    const [users, coaches, clients, links, activeSubs, paid, workouts, suspended] =
      await Promise.all([
        prisma.user.count(),
        prisma.coachProfile.count(),
        prisma.clientProfile.count(),
        prisma.coachClient.count({ where: { status: 'active' } }),
        prisma.subscription.count({ where: { status: 'active' } }),
        prisma.payment.findMany({ where: { status: 'paid' }, select: { amount: true } }),
        prisma.workoutLog.count(),
        prisma.user.count({ where: { suspended: true } }),
      ]);
    const gmv = Math.round(paid.reduce((n, p) => n + p.amount, 0) / 100);
    return {
      users,
      coaches,
      clients,
      activeRelationships: links,
      activeSubscriptions: activeSubs,
      gmv,
      workoutsLogged: workouts,
      suspended,
    };
  });

  // ── All coaches with metrics ────────────────────────────────────
  fastify.get('/owner/coaches', { preHandler: fastify.requireAuth }, async (request, reply) => {
    if (!(await requireOwner(request, reply))) return;
    const profiles = await prisma.coachProfile.findMany({
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { id: true, firstName: true, username: true, suspended: true, createdAt: true } } },
    });
    const ids = profiles.map((p) => p.user.id);
    const [clientCounts, payments] = await Promise.all([
      prisma.coachClient.groupBy({ by: ['coachId'], _count: true, where: { coachId: { in: ids } } }),
      prisma.payment.groupBy({
        by: ['coachId'],
        _sum: { amount: true },
        where: { coachId: { in: ids }, status: 'paid' },
      }),
    ]);
    const clientsBy = new Map(clientCounts.map((c) => [c.coachId, c._count]));
    const revBy = new Map(payments.map((p) => [p.coachId, p._sum.amount ?? 0]));
    return profiles.map((p) => ({
      id: p.user.id,
      name: nameOfUser(p.user),
      suspended: p.user.suspended,
      joinedAt: p.user.createdAt,
      clients: clientsBy.get(p.user.id) ?? 0,
      revenue: Math.round((revBy.get(p.user.id) ?? 0) / 100),
    }));
  });

  // ── All clients ─────────────────────────────────────────────────
  fastify.get('/owner/clients', { preHandler: fastify.requireAuth }, async (request, reply) => {
    if (!(await requireOwner(request, reply))) return;
    const profiles = await prisma.clientProfile.findMany({
      orderBy: { createdAt: 'desc' },
      take: 300,
      include: { user: { select: { id: true, firstName: true, username: true, suspended: true, createdAt: true } } },
    });
    const ids = profiles.map((p) => p.user.id);
    const coachCounts = await prisma.coachClient.groupBy({
      by: ['clientId'],
      _count: true,
      where: { clientId: { in: ids } },
    });
    const coachesBy = new Map(coachCounts.map((c) => [c.clientId, c._count]));
    return profiles.map((p) => ({
      id: p.user.id,
      name: nameOfUser(p.user),
      suspended: p.user.suspended,
      joinedAt: p.user.createdAt,
      goal: p.goal,
      coaches: coachesBy.get(p.user.id) ?? 0,
    }));
  });

  // ── Moderation: suspend / unsuspend ─────────────────────────────
  fastify.post<{ Params: { id: string }; Body: { suspended?: boolean } }>(
    '/owner/users/:id/suspend',
    { preHandler: fastify.requireAuth },
    async (request, reply) => {
      if (!(await requireOwner(request, reply))) return;
      const suspended = Boolean(request.body?.suspended);
      const user = await prisma.user.findUnique({
        where: { id: request.params.id },
        select: { id: true, telegramId: true },
      });
      if (!user) {
        reply.code(404).send({ error: 'not_found' });
        return;
      }
      // Never suspend an owner account.
      if (env.ownerTelegramIds.includes(user.telegramId.toString())) {
        reply.code(400).send({ error: 'bad_request', reason: 'cannot_suspend_owner' });
        return;
      }
      await prisma.user.update({ where: { id: user.id }, data: { suspended } });
      await notifyUser(
        user.id,
        suspended
          ? '⛔️ Ваш доступ к платформе приостановлен администратором.'
          : '✅ Ваш доступ к платформе восстановлен.',
      );
      return { ok: true, suspended };
    },
  );
};
