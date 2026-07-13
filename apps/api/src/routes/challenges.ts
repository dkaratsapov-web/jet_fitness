// Challenges & leaderboards (spec §7.5, Phase 2).
//
//   Coach:
//     POST   /coach/challenges                       — create + add participants
//     GET    /coach/challenges                       — list with leaderboards
//     POST   /coach/challenges/:id/participants      — add a client
//     DELETE /coach/challenges/:id/participants/:cid — remove a client
//     POST   /coach/challenges/:id/score             — set a manual score
//     DELETE /coach/challenges/:id                   — delete
//   Client:
//     GET    /client/challenges                      — my challenges + rank
//
// Scores auto-compute on read for 'workouts' (logged workouts in the window)
// and 'weight' (kg lost in the window); 'steps'/'custom' are set manually.

import type { FastifyPluginAsync } from 'fastify';
import { prisma, type ChallengeType } from '@jet/db';
import { requireCoach } from '../auth/guards.js';
import { notifyUser } from '../notify.js';

const TYPES: ChallengeType[] = ['steps', 'workouts', 'weight', 'custom'];

interface ChallengeRow {
  id: string;
  name: string;
  type: ChallengeType;
  startDate: Date;
  endDate: Date;
  participants: { clientId: string; score: number }[];
}

// Auto-compute scores for a challenge (workouts/weight); returns clientId→score.
async function computeScores(ch: ChallengeRow): Promise<Map<string, number>> {
  const scores = new Map<string, number>();
  if (ch.type === 'workouts') {
    for (const p of ch.participants) {
      const count = await prisma.workoutLog.count({
        where: {
          clientId: p.clientId,
          completedAt: { not: null, gte: ch.startDate, lte: ch.endDate },
        },
      });
      scores.set(p.clientId, count);
    }
  } else if (ch.type === 'weight') {
    for (const p of ch.participants) {
      const entries = await prisma.progressEntry.findMany({
        where: { clientId: p.clientId, weightKg: { not: null }, date: { gte: ch.startDate, lte: ch.endDate } },
        orderBy: { date: 'asc' },
        select: { weightKg: true },
      });
      if (entries.length >= 2) {
        const lost = (entries[0].weightKg ?? 0) - (entries[entries.length - 1].weightKg ?? 0);
        scores.set(p.clientId, Math.round(lost * 10) / 10); // kg lost (can be negative)
      } else {
        scores.set(p.clientId, 0);
      }
    }
  }
  return scores;
}

// Persist auto scores, then build a ranked leaderboard with participant names.
async function leaderboard(ch: ChallengeRow) {
  if (ch.type === 'workouts' || ch.type === 'weight') {
    const scores = await computeScores(ch);
    await Promise.all(
      ch.participants.map((p) => {
        const s = scores.get(p.clientId) ?? 0;
        if (s !== p.score) {
          return prisma.challengeParticipant
            .update({ where: { challengeId_clientId: { challengeId: ch.id, clientId: p.clientId } }, data: { score: s } })
            .then(() => undefined);
        }
        return Promise.resolve();
      }),
    );
    ch.participants.forEach((p) => (p.score = scores.get(p.clientId) ?? p.score));
  }

  const ids = ch.participants.map((p) => p.clientId);
  const users = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, firstName: true, username: true },
  });
  const nameOf = new Map(
    users.map((u) => [u.id, u.firstName || (u.username ? `@${u.username}` : 'Клиент')]),
  );
  return [...ch.participants]
    .sort((a, b) => b.score - a.score)
    .map((p, i) => ({
      rank: i + 1,
      clientId: p.clientId,
      name: nameOf.get(p.clientId) ?? 'Клиент',
      score: p.score,
    }));
}

const UNIT: Record<ChallengeType, string> = {
  workouts: 'трен.',
  weight: 'кг',
  steps: 'шаг.',
  custom: 'очк.',
};

export const challengeRoutes: FastifyPluginAsync = async (fastify) => {
  // ── Coach: create ───────────────────────────────────────────────
  fastify.post<{
    Body: { name?: string; type?: string; startDate?: string; endDate?: string; clientIds?: string[] };
  }>('/coach/challenges', { preHandler: fastify.requireAuth }, async (request, reply) => {
    if (!(await requireCoach(request, reply))) return;
    const auth = request.auth!;
    const b = request.body ?? {};
    const type = (b.type ?? 'workouts') as ChallengeType;
    if (!b.name?.trim() || !TYPES.includes(type) || !b.startDate || !b.endDate) {
      reply.code(400).send({ error: 'bad_request', reason: 'invalid_challenge' });
      return;
    }
    // Only the coach's own clients may be added.
    const clientIds = [...new Set(b.clientIds ?? [])];
    const links = await prisma.coachClient.findMany({
      where: { coachId: auth.userId, clientId: { in: clientIds } },
      select: { clientId: true },
    });
    const allowed = new Set(links.map((l) => l.clientId));

    const challenge = await prisma.challenge.create({
      data: {
        coachId: auth.userId,
        name: b.name.trim(),
        type,
        startDate: new Date(b.startDate),
        endDate: new Date(b.endDate),
        participants: {
          create: [...allowed].map((clientId) => ({ clientId })),
        },
      },
      select: { id: true },
    });
    await Promise.all(
      [...allowed].map((clientId) =>
        notifyUser(clientId, `🏆 Вас добавили в челлендж «${b.name!.trim()}». Удачи!`),
      ),
    );
    return { ok: true, id: challenge.id };
  });

  // ── Coach: list with leaderboards ───────────────────────────────
  fastify.get('/coach/challenges', { preHandler: fastify.requireAuth }, async (request, reply) => {
    if (!(await requireCoach(request, reply))) return;
    const auth = request.auth!;
    const challenges = await prisma.challenge.findMany({
      where: { coachId: auth.userId },
      orderBy: { createdAt: 'desc' },
      include: { participants: { select: { clientId: true, score: true } } },
    });
    return Promise.all(
      challenges.map(async (ch) => ({
        id: ch.id,
        name: ch.name,
        type: ch.type,
        unit: UNIT[ch.type],
        startDate: ch.startDate,
        endDate: ch.endDate,
        manualScore: ch.type === 'steps' || ch.type === 'custom',
        leaderboard: await leaderboard(ch as ChallengeRow),
      })),
    );
  });

  // ── Coach: participants ─────────────────────────────────────────
  fastify.post<{ Params: { id: string }; Body: { clientId?: string } }>(
    '/coach/challenges/:id/participants',
    { preHandler: fastify.requireAuth },
    async (request, reply) => {
      if (!(await requireCoach(request, reply))) return;
      const auth = request.auth!;
      const clientId = request.body?.clientId;
      const ch = await prisma.challenge.findFirst({
        where: { id: request.params.id, coachId: auth.userId },
        select: { id: true },
      });
      if (!ch || !clientId) {
        reply.code(404).send({ error: 'not_found' });
        return;
      }
      const link = await prisma.coachClient.findUnique({
        where: { coachId_clientId: { coachId: auth.userId, clientId } },
        select: { id: true },
      });
      if (!link) {
        reply.code(403).send({ error: 'forbidden', reason: 'not_your_client' });
        return;
      }
      await prisma.challengeParticipant.upsert({
        where: { challengeId_clientId: { challengeId: ch.id, clientId } },
        update: {},
        create: { challengeId: ch.id, clientId },
      });
      return { ok: true };
    },
  );

  fastify.delete<{ Params: { id: string; cid: string } }>(
    '/coach/challenges/:id/participants/:cid',
    { preHandler: fastify.requireAuth },
    async (request, reply) => {
      if (!(await requireCoach(request, reply))) return;
      const auth = request.auth!;
      const ch = await prisma.challenge.findFirst({
        where: { id: request.params.id, coachId: auth.userId },
        select: { id: true },
      });
      if (!ch) {
        reply.code(404).send({ error: 'not_found' });
        return;
      }
      await prisma.challengeParticipant
        .delete({ where: { challengeId_clientId: { challengeId: ch.id, clientId: request.params.cid } } })
        .catch(() => undefined);
      return { ok: true };
    },
  );

  // ── Coach: manual score (steps/custom) ──────────────────────────
  fastify.post<{ Params: { id: string }; Body: { clientId?: string; score?: number } }>(
    '/coach/challenges/:id/score',
    { preHandler: fastify.requireAuth },
    async (request, reply) => {
      if (!(await requireCoach(request, reply))) return;
      const auth = request.auth!;
      const { clientId, score } = request.body ?? {};
      const ch = await prisma.challenge.findFirst({
        where: { id: request.params.id, coachId: auth.userId },
        select: { id: true },
      });
      if (!ch || !clientId || score == null) {
        reply.code(400).send({ error: 'bad_request' });
        return;
      }
      await prisma.challengeParticipant.update({
        where: { challengeId_clientId: { challengeId: ch.id, clientId } },
        data: { score: Number(score) },
      });
      return { ok: true };
    },
  );

  fastify.delete<{ Params: { id: string } }>(
    '/coach/challenges/:id',
    { preHandler: fastify.requireAuth },
    async (request, reply) => {
      if (!(await requireCoach(request, reply))) return;
      const auth = request.auth!;
      const ch = await prisma.challenge.findFirst({
        where: { id: request.params.id, coachId: auth.userId },
        select: { id: true },
      });
      if (!ch) {
        reply.code(404).send({ error: 'not_found' });
        return;
      }
      await prisma.challenge.delete({ where: { id: ch.id } });
      return { ok: true };
    },
  );

  // ── Client: my challenges + rank ────────────────────────────────
  fastify.get('/client/challenges', { preHandler: fastify.requireAuth }, async (request) => {
    const auth = request.auth!;
    const parts = await prisma.challengeParticipant.findMany({
      where: { clientId: auth.userId },
      include: { challenge: { include: { participants: { select: { clientId: true, score: true } } } } },
    });
    return Promise.all(
      parts.map(async (p) => {
        const ch = p.challenge;
        const board = await leaderboard(ch as ChallengeRow);
        const me = board.find((r) => r.clientId === auth.userId);
        return {
          id: ch.id,
          name: ch.name,
          type: ch.type,
          unit: UNIT[ch.type],
          startDate: ch.startDate,
          endDate: ch.endDate,
          myRank: me?.rank ?? null,
          myScore: me?.score ?? 0,
          total: board.length,
          leaderboard: board.slice(0, 10),
        };
      }),
    );
  });
};
