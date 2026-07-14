// Client-logged activity & self-built workouts.
//   Client:
//     POST   /client/activity        — log an activity (cardio or strength)
//     GET    /client/activity?days=  — recent activity, newest first
//     DELETE /client/activity/:id    — remove an entry
//
// A "strength" activity may carry an `exercises` array ([{name, sets, reps,
// weight}]) so a client can build their own workout from the library. Cardio
// activities carry duration / distance / calories. Everything here is the
// client's own data — no coach assignment involved.

import type { FastifyPluginAsync } from 'fastify';
import { prisma, type ActivityType } from '@jet/db';

const ACTIVITY_TYPES: ActivityType[] = [
  'strength',
  'cardio',
  'run',
  'walk',
  'cycle',
  'swim',
  'other',
];

interface ExerciseEntry {
  name: string;
  sets?: number;
  reps?: string;
  weight?: string;
}

function sanitizeExercises(input: unknown): ExerciseEntry[] | undefined {
  if (!Array.isArray(input)) return undefined;
  const out: ExerciseEntry[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const name = typeof r.name === 'string' ? r.name.trim() : '';
    if (!name) continue;
    out.push({
      name: name.slice(0, 120),
      sets: r.sets != null && Number.isFinite(Number(r.sets)) ? Number(r.sets) : undefined,
      reps: typeof r.reps === 'string' ? r.reps.slice(0, 40) : undefined,
      weight: typeof r.weight === 'string' ? r.weight.slice(0, 40) : undefined,
    });
    if (out.length >= 40) break;
  }
  return out.length ? out : undefined;
}

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export const activityRoutes: FastifyPluginAsync = async (fastify) => {
  // ── Log an activity ─────────────────────────────────────────────
  fastify.post<{
    Body: {
      type?: string;
      title?: string;
      date?: string;
      durationMin?: number;
      distanceKm?: number;
      calories?: number;
      notes?: string;
      exercises?: unknown;
    };
  }>('/client/activity', { preHandler: fastify.requireAuth }, async (request, reply) => {
    const auth = request.auth!;
    const b = request.body ?? {};

    const type = ACTIVITY_TYPES.includes(b.type as ActivityType)
      ? (b.type as ActivityType)
      : 'strength';
    const exercises = sanitizeExercises(b.exercises);
    const title = (b.title ?? '').trim() || defaultTitle(type);

    if (type === 'strength' && !exercises && !(b.title ?? '').trim()) {
      reply.code(400).send({ error: 'bad_request', reason: 'empty_workout' });
      return;
    }

    // Noon UTC keeps the entry inside its calendar day; today by default.
    const date = /^\d{4}-\d{2}-\d{2}$/.test(b.date ?? '')
      ? new Date(`${b.date}T12:00:00.000Z`)
      : new Date();

    const row = await prisma.activityLog.create({
      data: {
        clientId: auth.userId,
        date,
        type,
        title: title.slice(0, 120),
        durationMin: b.durationMin != null ? num(b.durationMin) : null,
        distanceKm: b.distanceKm != null ? num(b.distanceKm) : null,
        calories: b.calories != null ? (num(b.calories) ?? null) : null,
        notes: typeof b.notes === 'string' ? b.notes.slice(0, 500) || null : null,
        exercises: exercises ? (exercises as object) : undefined,
      },
    });
    return { ok: true, id: row.id };
  });

  // ── Recent activity ─────────────────────────────────────────────
  fastify.get<{ Querystring: { days?: string } }>(
    '/client/activity',
    { preHandler: fastify.requireAuth },
    async (request) => {
      const auth = request.auth!;
      const days = Math.min(365, Math.max(1, Number(request.query.days) || 60));
      const since = new Date(Date.now() - days * 86400000);
      const rows = await prisma.activityLog.findMany({
        where: { clientId: auth.userId, date: { gte: since } },
        orderBy: { date: 'desc' },
      });
      return rows.map((r) => ({
        id: r.id,
        date: r.date.toISOString(),
        type: r.type,
        title: r.title,
        durationMin: r.durationMin,
        distanceKm: r.distanceKm,
        calories: r.calories,
        notes: r.notes,
        exercises: (r.exercises as ExerciseEntry[] | null) ?? null,
      }));
    },
  );

  // ── Delete an entry ─────────────────────────────────────────────
  fastify.delete<{ Params: { id: string } }>(
    '/client/activity/:id',
    { preHandler: fastify.requireAuth },
    async (request, reply) => {
      const auth = request.auth!;
      const row = await prisma.activityLog.findUnique({
        where: { id: request.params.id },
        select: { clientId: true },
      });
      if (!row || row.clientId !== auth.userId) {
        reply.code(404).send({ error: 'not_found' });
        return;
      }
      await prisma.activityLog.delete({ where: { id: request.params.id } });
      return { ok: true };
    },
  );
};

function defaultTitle(type: ActivityType): string {
  const map: Record<ActivityType, string> = {
    strength: 'Своя тренировка',
    cardio: 'Кардио',
    run: 'Бег',
    walk: 'Ходьба',
    cycle: 'Велосипед',
    swim: 'Плавание',
    other: 'Активность',
  };
  return map[type];
}
