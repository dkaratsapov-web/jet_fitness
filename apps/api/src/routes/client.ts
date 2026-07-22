// Client routes (Phase 1).
//   POST /client/register  — current user becomes a client (self sign-up).
//   GET  /client/program   — the client's active assigned program.
//   POST /client/workouts  — log a completed workout for one program day.
//   GET  /client/workouts  — recent workout history.

import { randomBytes } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import { prisma, type ProgressPhotoType, type Sex } from '@jet/db';
import { summarizeWorkout, type WorkoutWithSets } from './workoutSummary.js';
import { notifyClientsCoaches } from '../notify.js';
import { presign, isStorageConfigured, videoViewUrl } from '../storage.js';

const PHOTO_TYPES: ProgressPhotoType[] = ['front', 'side', 'back'];
const PHOTO_EXTS = new Set(['jpg', 'jpeg', 'png', 'webp', 'heic']);
const VIDEO_EXTS = new Set(['mp4', 'mov', 'webm', 'm4v']);
const SEXES: Sex[] = ['male', 'female', 'other'];
const ACTIVITY_FACTORS: Record<string, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  high: 1.725,
  athlete: 1.9,
};
const ACTIVITY_LEVELS = new Set(Object.keys(ACTIVITY_FACTORS));
const GOAL_TYPES = new Set(['lose', 'maintain', 'gain']);

function ageFromBirth(birthDate: Date | null): number {
  if (!birthDate) return 30;
  const now = new Date();
  let a = now.getFullYear() - birthDate.getFullYear();
  const m = now.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birthDate.getDate())) a--;
  return a >= 14 && a < 100 ? a : 30;
}

// Mifflin-St Jeor BMR × activity, adjusted for the goal → daily kcal + macros.
function computeTarget(p: {
  sex: Sex | null;
  heightCm: number | null;
  weightKg: number | null;
  birthDate: Date | null;
  activityLevel: string | null;
  goalType: string | null;
}): { kcal: number; protein: number; fat: number; carbs: number } | null {
  if (!p.heightCm || !p.weightKg) return null;
  const age = ageFromBirth(p.birthDate);
  const s = p.sex === 'male' ? 5 : p.sex === 'female' ? -161 : -78;
  const bmr = 10 * p.weightKg + 6.25 * p.heightCm - 5 * age + s;
  const af = ACTIVITY_FACTORS[p.activityLevel ?? 'light'] ?? 1.375;
  let kcal = bmr * af;
  if (p.goalType === 'lose') kcal *= 0.82;
  else if (p.goalType === 'gain') kcal *= 1.12;
  kcal = Math.max(1200, Math.round(kcal / 10) * 10);
  const protein = Math.round(p.weightKg * (p.goalType === 'lose' ? 2.0 : 1.8));
  const fat = Math.round((kcal * 0.27) / 9);
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
  return { kcal, protein, fat, carbs };
}

// Solo = no coach relationship at all.
async function isSolo(clientId: string): Promise<boolean> {
  const link = await prisma.coachClient.findFirst({ where: { clientId }, select: { id: true } });
  return !link;
}

// Recompute & store the auto nutrition target for a solo client (never
// overwrites a coach-set target).
async function refreshAutoTarget(userId: string): Promise<void> {
  if (!(await isSolo(userId))) return;
  const p = await prisma.clientProfile.findUnique({ where: { userId } });
  if (!p) return;
  const latest = await prisma.nutritionTarget.findFirst({
    where: { clientId: userId },
    orderBy: { activeFrom: 'desc' },
  });
  if (latest && latest.source !== 'auto') return; // coach owns the target
  const t = computeTarget(p);
  if (!t) return;
  if (latest && latest.kcal === t.kcal && latest.protein === t.protein && latest.fat === t.fat && latest.carbs === t.carbs) {
    return; // unchanged
  }
  await prisma.nutritionTarget.create({ data: { clientId: userId, ...t, source: 'auto' } });
}

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

  // Client profile (onboarding questionnaire): goal / sex / height / birth date.
  fastify.get('/client/profile', { preHandler: fastify.requireAuth }, async (request) => {
    const auth = request.auth!;
    const [p, solo, target] = await Promise.all([
      prisma.clientProfile.findUnique({ where: { userId: auth.userId } }),
      isSolo(auth.userId),
      prisma.nutritionTarget.findFirst({ where: { clientId: auth.userId }, orderBy: { activeFrom: 'desc' } }),
    ]);
    return {
      goal: p?.goal ?? null,
      sex: p?.sex ?? null,
      heightCm: p?.heightCm ?? null,
      weightKg: p?.weightKg ?? null,
      birthDate: p?.birthDate ?? null,
      goalType: p?.goalType ?? null,
      activityLevel: p?.activityLevel ?? null,
      solo,
      targetSource: target?.source ?? null,
      // "Filled" once the essentials (goal + sex + height) are set.
      filled: Boolean(p?.goal && p?.sex && p?.heightCm),
    };
  });

  fastify.patch<{
    Body: {
      goal?: string;
      sex?: string;
      heightCm?: number;
      weightKg?: number;
      birthDate?: string;
      goalType?: string;
      activityLevel?: string;
    };
  }>('/client/profile', { preHandler: fastify.requireAuth }, async (request, reply) => {
    const auth = request.auth!;
    const b = request.body ?? {};
    const sex = b.sex && SEXES.includes(b.sex as Sex) ? (b.sex as Sex) : undefined;
    if (b.sex && !sex) {
      reply.code(400).send({ error: 'bad_request', reason: 'invalid_sex' });
      return;
    }
    const goalType = b.goalType && GOAL_TYPES.has(b.goalType) ? b.goalType : undefined;
    const activityLevel =
      b.activityLevel && ACTIVITY_LEVELS.has(b.activityLevel) ? b.activityLevel : undefined;
    const weightKg = typeof b.weightKg === 'number' && b.weightKg > 0 && b.weightKg < 500 ? b.weightKg : undefined;

    await prisma.clientProfile.upsert({
      where: { userId: auth.userId },
      update: {
        goal: b.goal?.trim() || undefined,
        sex,
        heightCm: b.heightCm ?? undefined,
        weightKg,
        birthDate: b.birthDate ? new Date(b.birthDate) : undefined,
        goalType,
        activityLevel,
      },
      create: {
        userId: auth.userId,
        goal: b.goal?.trim() || null,
        sex,
        heightCm: b.heightCm ?? null,
        weightKg: weightKg ?? null,
        birthDate: b.birthDate ? new Date(b.birthDate) : null,
        goalType: goalType ?? null,
        activityLevel: activityLevel ?? null,
      },
    });

    // Record a weight measurement so dynamics populate from day one.
    if (weightKg != null) {
      const last = await prisma.progressEntry.findFirst({
        where: { clientId: auth.userId },
        orderBy: { date: 'desc' },
        select: { weightKg: true },
      });
      if (!last || last.weightKg !== weightKg) {
        await prisma.progressEntry.create({ data: { clientId: auth.userId, date: new Date(), weightKg } });
      }
    }

    await refreshAutoTarget(auth.userId);
    return { ok: true };
  });

  // ── Body / health summary ("как ты сейчас") ─────────────────────
  fastify.get('/client/body-summary', { preHandler: fastify.requireAuth }, async (request) => {
    const clientId = request.auth!.userId;
    const now = Date.now();
    const d7 = new Date(now - 7 * 86400000);
    const d30 = new Date(now - 30 * 86400000);

    const [profile, weights, target, meals, workouts7, wearable] = await Promise.all([
      prisma.clientProfile.findUnique({ where: { userId: clientId } }),
      prisma.progressEntry.findMany({
        where: { clientId, weightKg: { not: null } },
        orderBy: { date: 'desc' },
        take: 60,
        select: { date: true, weightKg: true },
      }),
      prisma.nutritionTarget.findFirst({ where: { clientId }, orderBy: { activeFrom: 'desc' } }),
      prisma.mealLog.findMany({
        where: { clientId, date: { gte: d7 } },
        select: { date: true, kcal: true, protein: true },
      }),
      prisma.workoutLog.count({ where: { clientId, date: { gte: d7 } } }),
      prisma.dailyMetric.findFirst({ where: { clientId }, orderBy: { date: 'desc' } }),
    ]);

    const weight = weights[0]?.weightKg ?? profile?.weightKg ?? null;
    // Weight ~30 days ago: the oldest measurement within the last 30 days.
    const old30 = [...weights].reverse().find((w) => w.date >= d30);
    const weightDelta30 =
      weight != null && old30?.weightKg != null && old30.weightKg !== weight
        ? +(weight - old30.weightKg).toFixed(1)
        : null;

    const height = profile?.heightCm ?? null;
    let bmi: number | null = null;
    let bmiCategory: string | null = null;
    if (weight && height) {
      bmi = +(weight / Math.pow(height / 100, 2)).toFixed(1);
      bmiCategory =
        bmi < 18.5 ? 'недовес' : bmi < 25 ? 'норма' : bmi < 30 ? 'избыток' : 'ожирение';
    }

    // 7-day nutrition averages over logged days.
    const byDay = new Map<string, { kcal: number; protein: number }>();
    for (const m of meals) {
      const k = m.date.toISOString().slice(0, 10);
      const cur = byDay.get(k) ?? { kcal: 0, protein: 0 };
      cur.kcal += m.kcal;
      cur.protein += m.protein;
      byDay.set(k, cur);
    }
    const loggedDays7 = byDay.size;
    const kcalAvg7 = loggedDays7
      ? Math.round([...byDay.values()].reduce((n, d) => n + d.kcal, 0) / loggedDays7)
      : null;
    const proteinAvg7 = loggedDays7
      ? Math.round([...byDay.values()].reduce((n, d) => n + d.protein, 0) / loggedDays7)
      : null;
    const proteinNeed = weight ? Math.round(weight * 1.8) : null;

    // Olivia's short readout.
    const bits: string[] = [];
    if (weightDelta30 != null) {
      const dir = weightDelta30 < 0 ? 'снизился' : 'вырос';
      bits.push(`вес ${dir} на ${Math.abs(weightDelta30)} кг за месяц`);
    }
    if (target && kcalAvg7 != null) {
      const ratio = kcalAvg7 / target.kcal;
      bits.push(ratio > 1.1 ? 'по калориям перебор' : ratio < 0.85 ? 'по калориям недобор' : 'калории в норме');
    }
    bits.push(workouts7 >= 3 ? `${workouts7} тренировки за неделю — отлично` : workouts7 > 0 ? `${workouts7} тренировки за неделю` : 'на этой неделе тренировок не было');
    const summary = bits.length
      ? bits.join(', ').replace(/^./, (c) => c.toUpperCase()) + '.'
      : 'Заполни профиль и веди дневник — и я соберу твою сводку.';

    return {
      bmi,
      bmiCategory,
      weight,
      weightDelta30,
      goalType: profile?.goalType ?? null,
      kcalAvg7,
      kcalTarget: target?.kcal ?? null,
      loggedDays7,
      proteinAvg7,
      proteinNeed,
      workouts7,
      wearable: wearable
        ? {
            date: wearable.date.toISOString().slice(0, 10),
            steps: wearable.steps,
            restingPulse: wearable.restingPulse,
            sleepMin: wearable.sleepMin,
            activeKcal: wearable.activeKcal,
          }
        : null,
      summary,
    };
  });

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
                      exercise: {
                        select: {
                          name: true,
                          muscleGroup: true,
                          videoUrl: true,
                          technique: true,
                          recommendations: true,
                          precautions: true,
                        },
                      },
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
              videoUrl: videoViewUrl(pe.exercise.videoUrl),
              technique: pe.exercise.technique,
              recommendations: pe.exercise.recommendations,
              precautions: pe.exercise.precautions,
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

  // Delete one of the client's own measurements.
  fastify.delete<{ Params: { id: string } }>(
    '/client/progress/:id',
    { preHandler: fastify.requireAuth },
    async (request, reply) => {
      const auth = request.auth!;
      const entry = await prisma.progressEntry.findUnique({
        where: { id: request.params.id },
        select: { clientId: true },
      });
      if (!entry || entry.clientId !== auth.userId) {
        reply.code(404).send({ error: 'not_found' });
        return;
      }
      await prisma.progressEntry.delete({ where: { id: request.params.id } });
      return { ok: true };
    },
  );

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

  // Delete one of the client's own progress photos.
  fastify.delete<{ Params: { id: string } }>(
    '/client/progress-photos/:id',
    { preHandler: fastify.requireAuth },
    async (request, reply) => {
      const auth = request.auth!;
      const photo = await prisma.progressPhoto.findUnique({
        where: { id: request.params.id },
        select: { clientId: true },
      });
      if (!photo || photo.clientId !== auth.userId) {
        reply.code(404).send({ error: 'not_found' });
        return;
      }
      await prisma.progressPhoto.delete({ where: { id: request.params.id } });
      return { ok: true };
    },
  );

  fastify.get('/client/progress-photos', { preHandler: fastify.requireAuth }, async (request) => {
    const auth = request.auth!;
    return listProgressPhotos(auth.userId);
  });

  // ── Technique videos (client uploads, coach comments) ───────────
  fastify.post<{ Body: { ext?: string } }>(
    '/client/form-videos/presign',
    { preHandler: fastify.requireAuth },
    async (request, reply) => {
      if (!isStorageConfigured()) {
        reply.code(503).send({ error: 'unavailable', reason: 'storage_not_configured' });
        return;
      }
      const auth = request.auth!;
      const ext = (request.body?.ext ?? 'mp4').toLowerCase().replace(/[^a-z0-9]/g, '');
      if (!VIDEO_EXTS.has(ext)) {
        reply.code(400).send({ error: 'bad_request', reason: 'invalid_ext' });
        return;
      }
      const fileKey = `technique/${auth.userId}/${Date.now()}-${randomBytes(6).toString('hex')}.${ext}`;
      const uploadUrl = presign('PUT', fileKey, 1800);
      return { uploadUrl, fileKey };
    },
  );

  fastify.post<{ Body: { fileKey?: string; exerciseId?: string } }>(
    '/client/form-videos',
    { preHandler: fastify.requireAuth },
    async (request, reply) => {
      const auth = request.auth!;
      const fileKey = request.body?.fileKey;
      if (!fileKey || !fileKey.startsWith(`technique/${auth.userId}/`)) {
        reply.code(400).send({ error: 'bad_request', reason: 'invalid_video' });
        return;
      }
      const video = await prisma.formVideo.create({
        data: {
          clientId: auth.userId,
          videoUrl: fileKey,
          exerciseId: request.body?.exerciseId || null,
        },
        select: { id: true },
      });
      await notifyClientsCoaches(auth.userId, '🎥 Клиент загрузил видео техники на разбор.');
      return { ok: true, id: video.id };
    },
  );

  fastify.get('/client/form-videos', { preHandler: fastify.requireAuth }, async (request) => {
    const auth = request.auth!;
    return listFormVideos(auth.userId);
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

/** Shared: a client's technique videos with view URLs + coach comments. */
export async function listFormVideos(clientId: string) {
  const videos = await prisma.formVideo.findMany({
    where: { clientId },
    orderBy: { createdAt: 'desc' },
    take: 40,
    include: {
      exercise: { select: { name: true } },
      comments: { orderBy: { createdAt: 'asc' }, select: { id: true, body: true, createdAt: true } },
    },
  });
  const canView = isStorageConfigured();
  return videos.map((v) => ({
    id: v.id,
    createdAt: v.createdAt,
    exerciseName: v.exercise?.name ?? null,
    viewUrl: canView ? presign('GET', v.videoUrl, 3600) : null,
    comments: v.comments,
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
