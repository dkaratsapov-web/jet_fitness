// Client routes (Phase 1).
//   POST /client/register  — current user becomes a client (self sign-up).
//   GET  /client/program   — the client's active assigned program.
//   POST /client/workouts  — log a completed workout for one program day.
//   GET  /client/workouts  — recent workout history.

import { randomBytes } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import { prisma, type ProgressPhotoType } from '@jet/db';
import { summarizeWorkout, type WorkoutWithSets } from './workoutSummary.js';
import { notifyClientsCoaches } from '../notify.js';
import { presign, isStorageConfigured } from '../storage.js';

const PHOTO_TYPES: ProgressPhotoType[] = ['front', 'side', 'back'];
const PHOTO_EXTS = new Set(['jpg', 'jpeg', 'png', 'webp', 'heic']);

interface SetInput {
  programExerciseId: string;
  setNumber: number;
  actualReps?: number | null;
  actualWeight?: number | null;
  rpe?: number | null;
}

export const clientRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    '/client/register',
    { preHandler: fastify.requireAuth },
    async (request) => {
      const auth = request.auth!;
      await prisma.clientProfile.upsert({
        where: { userId: auth.userId },
        update: {},
        create: { userId: auth.userId },
      });
      return { ok: true, isClient: true };
    },
  );

  // Current client's active program (the one their coach handed them).
  fastify.get(
    '/client/program',
    { preHandler: fastify.requireAuth },
    async (request) => {
      const auth = request.auth!;
      const assignment = await prisma.assignment.findFirst({
        where: { clientId: auth.userId, active: true },
        orderBy: { createdAt: 'desc' },
        include: {
          program: {
            include: {
              days: {
                orderBy: { order: 'asc' },
                include: {
                  exercises: {
                    orderBy: { order: 'asc' },
                    include: {
                      exercise: { select: { name: true, muscleGroup: true, videoUrl: true } },
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!assignment) return { program: null };

      const { program } = assignment;
      return {
        program: {
          id: program.id,
          name: program.name,
          description: program.description,
          startDate: assignment.startDate,
          days: program.days.map((d) => ({
            id: d.id,
            order: d.order,
            title: d.title,
            exercises: d.exercises.map((pe) => ({
              id: pe.id,
              name: pe.exercise.name,
              muscleGroup: pe.exercise.muscleGroup,
              videoUrl: pe.exercise.videoUrl,
              sets: pe.sets,
              reps: pe.reps,
              weight: pe.weight,
              restSec: pe.restSec,
              tempo: pe.tempo,
              notes: pe.notes,
            })),
          })),
        },
      };
    },
  );

  // Log a completed workout for one day of the client's active program.
  fastify.post<{ Body: { programDayId: string; sets: SetInput[] } }>(
    '/client/workouts',
    { preHandler: fastify.requireAuth },
    async (request, reply) => {
      const auth = request.auth!;
      const { programDayId, sets } = request.body ?? { programDayId: '', sets: [] };
      if (!programDayId) {
        reply.code(400).send({ error: 'bad_request', reason: 'day_required' });
        return;
      }

      // Resolve the client's active assignment.
      const assignment = await prisma.assignment.findFirst({
        where: { clientId: auth.userId, active: true },
        orderBy: { createdAt: 'desc' },
        select: { id: true, programId: true },
      });
      if (!assignment) {
        reply.code(400).send({ error: 'bad_request', reason: 'no_active_program' });
        return;
      }

      // The day must belong to the assigned program; collect its exercise ids.
      const day = await prisma.programDay.findFirst({
        where: { id: programDayId, programId: assignment.programId },
        include: { exercises: { select: { id: true } } },
      });
      if (!day) {
        reply.code(404).send({ error: 'not_found', reason: 'day_not_found' });
        return;
      }
      const validExerciseIds = new Set(day.exercises.map((e) => e.id));
      const cleanSets = (sets ?? []).filter(
        (s) => s.programExerciseId && validExerciseIds.has(s.programExerciseId),
      );

      const workout = await prisma.workoutLog.create({
        data: {
          clientId: auth.userId,
          assignmentId: assignment.id,
          date: new Date(),
          completedAt: new Date(),
          setLogs: {
            create: cleanSets.map((s) => ({
              programExerciseId: s.programExerciseId,
              setNumber: s.setNumber,
              actualReps: s.actualReps ?? null,
              actualWeight: s.actualWeight ?? null,
              rpe: s.rpe ?? null,
            })),
          },
        },
        select: { id: true, date: true },
      });
      return { ok: true, workoutId: workout.id, date: workout.date };
    },
  );

  // Recent workout history for the current client.
  fastify.get(
    '/client/workouts',
    { preHandler: fastify.requireAuth },
    async (request) => {
      const auth = request.auth!;
      const workouts = await prisma.workoutLog.findMany({
        where: { clientId: auth.userId },
        orderBy: { date: 'desc' },
        take: 30,
        include: {
          setLogs: {
            include: {
              programExercise: {
                include: { programDay: { select: { title: true, order: true } } },
              },
            },
          },
        },
      });
      return workouts.map((w) => summarizeWorkout(w as WorkoutWithSets));
    },
  );

  // ── Progress: weight, body-fat, body measurements ───────────────
  fastify.post<{
    Body: {
      date?: string;
      weightKg?: number | null;
      bodyFatPct?: number | null;
      measurements?: Record<string, number> | null;
    };
  }>('/client/progress', { preHandler: fastify.requireAuth }, async (request, reply) => {
    const auth = request.auth!;
    const { date, weightKg, bodyFatPct, measurements } = request.body ?? {};
    const hasAny =
      weightKg != null ||
      bodyFatPct != null ||
      (measurements && Object.keys(measurements).length > 0);
    if (!hasAny) {
      reply.code(400).send({ error: 'bad_request', reason: 'empty_entry' });
      return;
    }
    const entry = await prisma.progressEntry.create({
      data: {
        clientId: auth.userId,
        date: date ? new Date(date) : new Date(),
        weightKg: weightKg ?? null,
        bodyFatPct: bodyFatPct ?? null,
        measurements: measurements ?? undefined,
      },
      select: { id: true },
    });
    return { ok: true, id: entry.id };
  });

  fastify.get('/client/progress', { preHandler: fastify.requireAuth }, async (request) => {
    const auth = request.auth!;
    return listProgress(auth.userId);
  });

  // ── Progress photos (Object Storage, presigned upload) ──────────
  // 1) ask for an upload URL, 2) PUT the file straight to storage,
  // 3) confirm to persist the object key.
  fastify.post<{ Body: { type?: string; ext?: string } }>(
    '/client/progress-photos/presign',
    { preHandler: fastify.requireAuth },
    async (request, reply) => {
      if (!isStorageConfigured()) {
        reply.code(503).send({ error: 'unavailable', reason: 'storage_not_configured' });
        return;
      }
      const auth = request.auth!;
      const type = (request.body?.type ?? 'front') as ProgressPhotoType;
      if (!PHOTO_TYPES.includes(type)) {
        reply.code(400).send({ error: 'bad_request', reason: 'invalid_type' });
        return;
      }
      const ext = (request.body?.ext ?? 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
      if (!PHOTO_EXTS.has(ext)) {
        reply.code(400).send({ error: 'bad_request', reason: 'invalid_ext' });
        return;
      }
      const fileKey = `progress/${auth.userId}/${Date.now()}-${randomBytes(6).toString('hex')}.${ext}`;
      const uploadUrl = presign('PUT', fileKey, 900);
      return { uploadUrl, fileKey };
    },
  );

  fastify.post<{ Body: { type?: string; fileKey?: string } }>(
    '/client/progress-photos',
    { preHandler: fastify.requireAuth },
    async (request, reply) => {
      const auth = request.auth!;
      const type = (request.body?.type ?? 'front') as ProgressPhotoType;
      const fileKey = request.body?.fileKey;
      if (!fileKey || !PHOTO_TYPES.includes(type)) {
        reply.code(400).send({ error: 'bad_request', reason: 'invalid_photo' });
        return;
      }
      // Guard against cross-user keys.
      if (!fileKey.startsWith(`progress/${auth.userId}/`)) {
        reply.code(403).send({ error: 'forbidden', reason: 'key_mismatch' });
        return;
      }
      const photo = await prisma.progressPhoto.create({
        data: { clientId: auth.userId, date: new Date(), type, fileKey },
        select: { id: true },
      });
      return { ok: true, id: photo.id };
    },
  );

  fastify.get('/client/progress-photos', { preHandler: fastify.requireAuth }, async (request) => {
    const auth = request.auth!;
    return listProgressPhotos(auth.userId);
  });

  // ── Check-ins: periodic self-report to the coach ────────────────
  fastify.post<{
    Body: {
      weightKg?: number | null;
      sleepQuality?: number | null;
      energy?: number | null;
      adherencePct?: number | null;
      mood?: number | null;
      comment?: string | null;
    };
  }>('/client/checkins', { preHandler: fastify.requireAuth }, async (request, reply) => {
    const auth = request.auth!;
    const b = request.body ?? {};
    const clamp = (v: number | null | undefined, lo: number, hi: number) =>
      v == null ? null : Math.min(hi, Math.max(lo, Math.round(v)));
    const hasAny =
      b.weightKg != null ||
      b.sleepQuality != null ||
      b.energy != null ||
      b.adherencePct != null ||
      b.mood != null ||
      (b.comment && b.comment.trim().length > 0);
    if (!hasAny) {
      reply.code(400).send({ error: 'bad_request', reason: 'empty_checkin' });
      return;
    }
    const checkin = await prisma.checkIn.create({
      data: {
        clientId: auth.userId,
        weightKg: b.weightKg ?? null,
        sleepQuality: clamp(b.sleepQuality, 1, 5),
        energy: clamp(b.energy, 1, 5),
        adherencePct: clamp(b.adherencePct, 0, 100),
        mood: clamp(b.mood, 1, 5),
        notes: b.comment?.trim() || null,
      },
      select: { id: true },
    });

    const me = await prisma.user.findUnique({
      where: { id: auth.userId },
      select: { firstName: true, username: true },
    });
    const who = me?.firstName || (me?.username ? `@${me.username}` : 'Клиент');
    await notifyClientsCoaches(auth.userId, `📝 ${who} отправил(а) новый check-in.`);
    return { ok: true, id: checkin.id };
  });

  fastify.get('/client/checkins', { preHandler: fastify.requireAuth }, async (request) => {
    const auth = request.auth!;
    return listCheckins(auth.userId);
  });
};

/** Shared: a client's check-ins, newest first. */
export async function listCheckins(clientId: string) {
  const rows = await prisma.checkIn.findMany({
    where: { clientId },
    orderBy: { date: 'desc' },
    take: 30,
  });
  return rows.map((c) => ({
    id: c.id,
    date: c.date,
    weightKg: c.weightKg,
    sleepQuality: c.sleepQuality,
    energy: c.energy,
    adherencePct: c.adherencePct,
    mood: c.mood,
    comment: c.notes,
    coachReply: c.coachReply,
    coachRepliedAt: c.coachRepliedAt,
  }));
}

/** Shared: a client's progress photos with short-lived view URLs, newest first. */
export async function listProgressPhotos(clientId: string) {
  const photos = await prisma.progressPhoto.findMany({
    where: { clientId },
    orderBy: { date: 'desc' },
    take: 60,
  });
  const canView = isStorageConfigured();
  return photos.map((p) => ({
    id: p.id,
    date: p.date,
    type: p.type,
    viewUrl: canView ? presign('GET', p.fileKey, 3600) : null,
  }));
}

/** Shared: a client's progress entries, newest first. */
export async function listProgress(clientId: string) {
  const entries = await prisma.progressEntry.findMany({
    where: { clientId },
    orderBy: { date: 'desc' },
    take: 60,
  });
  return entries.map((e) => ({
    id: e.id,
    date: e.date,
    weightKg: e.weightKg,
    bodyFatPct: e.bodyFatPct,
    measurements: (e.measurements as Record<string, number> | null) ?? null,
  }));
}
