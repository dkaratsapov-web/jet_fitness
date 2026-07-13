// Program builder & assignment routes (spec §7.2, §7.3) — Phase 1.
//
//   GET  /coach/exercises            — exercise library (global + coach's own)
//   POST /coach/exercises            — create a custom exercise
//   GET  /coach/programs             — list the coach's programs (with counts)
//   POST /coach/programs             — create a program with days & exercises
//   GET  /coach/programs/:id         — full program (days + exercises)
//   DELETE /coach/programs/:id       — delete a program
//   POST /coach/programs/:id/assign  — hand a program to one of the coach's clients

import { randomBytes } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import { prisma } from '@jet/db';
import { requireCoach } from '../auth/guards.js';
import { notifyUser } from '../notify.js';
import { presign, isStorageConfigured, videoViewUrl } from '../storage.js';
import { EXERCISE_LIBRARY } from '../data/exerciseLibrary.js';

const VIDEO_EXTS = new Set(['mp4', 'mov', 'webm', 'm4v']);

// Sync the global exercise library (spec §7.2): create missing entries and
// update existing ones with technique / recommendations / precautions. Runs
// lazily; a version marker (first item having `technique`) short-circuits it.
// Approved demo videos hosted on our own storage, keyed by exercise name.
// Applied on every library sync (even after the initial seed) so a newly
// approved clip attaches to an already-seeded exercise.
const VIDEO_OVERRIDES: Record<string, string> = {
  'Подъём на бицепс':
    'https://storage.yandexcloud.net/jet-fitness-app/exercises/biceps-curl.mp4',
};

async function applyVideoOverrides(): Promise<void> {
  for (const [name, videoUrl] of Object.entries(VIDEO_OVERRIDES)) {
    await prisma.exercise.updateMany({
      where: { ownerCoachId: null, name, NOT: { videoUrl } },
      data: { videoUrl },
    });
  }
}

async function ensureStarterLibrary(): Promise<void> {
  await applyVideoOverrides();
  const first = EXERCISE_LIBRARY[0];
  const marker = await prisma.exercise.findFirst({
    where: { ownerCoachId: null, name: first.name },
    select: { technique: true },
  });
  if (marker?.technique) return; // already synced

  for (const e of EXERCISE_LIBRARY) {
    const existing = await prisma.exercise.findFirst({
      where: { ownerCoachId: null, name: e.name },
      select: { id: true },
    });
    const data = {
      name: e.name,
      muscleGroup: e.muscleGroup,
      technique: e.technique,
      recommendations: e.recommendations,
      precautions: e.precautions,
      videoUrl: e.videoUrl ?? null,
    };
    if (existing) {
      await prisma.exercise.update({ where: { id: existing.id }, data });
    } else {
      await prisma.exercise.create({ data: { ...data, ownerCoachId: null } });
    }
  }
}

interface ProgramExerciseInput {
  exerciseId: string;
  order?: number;
  sets?: number | null;
  reps?: string | null;
  weight?: string | null;
  restSec?: number | null;
  tempo?: string | null;
  notes?: string | null;
}

interface ProgramDayInput {
  title?: string | null;
  order?: number;
  exercises: ProgramExerciseInput[];
}

interface ProgramInput {
  name: string;
  description?: string | null;
  isTemplate?: boolean;
  days: ProgramDayInput[];
}

export const programRoutes: FastifyPluginAsync = async (fastify) => {
  // ── Exercise library ────────────────────────────────────────────
  fastify.get('/coach/exercises', { preHandler: fastify.requireAuth }, async (request, reply) => {
    if (!(await requireCoach(request, reply))) return;
    const auth = request.auth!;
    await ensureStarterLibrary();
    const exercises = await prisma.exercise.findMany({
      where: { OR: [{ ownerCoachId: null }, { ownerCoachId: auth.userId }] },
      orderBy: [{ muscleGroup: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        muscleGroup: true,
        videoUrl: true,
        technique: true,
        recommendations: true,
        precautions: true,
        ownerCoachId: true,
      },
    });
    return exercises.map((e) => ({
      ...e,
      videoUrl: videoViewUrl(e.videoUrl),
      hasVideo: Boolean(e.videoUrl),
      custom: e.ownerCoachId === auth.userId,
    }));
  });

  // ── Attach a demonstration video to an exercise ─────────────────
  // Two ways: upload a file to Object Storage (presign → confirm) or set an
  // external link (e.g. YouTube). A coach may enrich their own exercises and
  // the shared global library.
  async function canEditExercise(exerciseId: string, coachId: string): Promise<boolean> {
    const ex = await prisma.exercise.findUnique({
      where: { id: exerciseId },
      select: { ownerCoachId: true },
    });
    if (!ex) return false;
    return ex.ownerCoachId === null || ex.ownerCoachId === coachId;
  }

  fastify.post<{ Params: { id: string }; Body: { ext?: string } }>(
    '/coach/exercises/:id/video/presign',
    { preHandler: fastify.requireAuth },
    async (request, reply) => {
      if (!(await requireCoach(request, reply))) return;
      const auth = request.auth!;
      if (!isStorageConfigured()) {
        reply.code(503).send({ error: 'unavailable', reason: 'storage_not_configured' });
        return;
      }
      if (!(await canEditExercise(request.params.id, auth.userId))) {
        reply.code(404).send({ error: 'not_found' });
        return;
      }
      const ext = (request.body?.ext ?? 'mp4').toLowerCase().replace(/[^a-z0-9]/g, '');
      if (!VIDEO_EXTS.has(ext)) {
        reply.code(400).send({ error: 'bad_request', reason: 'invalid_ext' });
        return;
      }
      const fileKey = `exercises/${request.params.id}/${Date.now()}-${randomBytes(6).toString('hex')}.${ext}`;
      const uploadUrl = presign('PUT', fileKey, 1800);
      return { uploadUrl, fileKey };
    },
  );

  fastify.post<{ Params: { id: string }; Body: { fileKey?: string; videoUrl?: string } }>(
    '/coach/exercises/:id/video',
    { preHandler: fastify.requireAuth },
    async (request, reply) => {
      if (!(await requireCoach(request, reply))) return;
      const auth = request.auth!;
      if (!(await canEditExercise(request.params.id, auth.userId))) {
        reply.code(404).send({ error: 'not_found' });
        return;
      }
      // Prefer an uploaded object key; otherwise accept a validated external URL.
      const fileKey = request.body?.fileKey?.trim();
      const link = request.body?.videoUrl?.trim();
      let value: string | null = null;
      if (fileKey && fileKey.startsWith(`exercises/${request.params.id}/`)) {
        value = fileKey;
      } else if (link && /^https?:\/\/\S+$/i.test(link)) {
        value = link;
      } else {
        reply.code(400).send({ error: 'bad_request', reason: 'invalid_video' });
        return;
      }
      await prisma.exercise.update({ where: { id: request.params.id }, data: { videoUrl: value } });
      return { ok: true, videoUrl: videoViewUrl(value) };
    },
  );

  fastify.post<{
    Body: {
      name: string;
      muscleGroup?: string;
      videoUrl?: string;
      technique?: string;
      recommendations?: string;
      precautions?: string;
    };
  }>('/coach/exercises', { preHandler: fastify.requireAuth }, async (request, reply) => {
    if (!(await requireCoach(request, reply))) return;
    const auth = request.auth!;
    const b = request.body ?? ({} as Record<string, string>);
    if (!b.name || !b.name.trim()) {
      reply.code(400).send({ error: 'bad_request', reason: 'name_required' });
      return;
    }
    const exercise = await prisma.exercise.create({
      data: {
        name: b.name.trim(),
        muscleGroup: b.muscleGroup?.trim() || null,
        videoUrl: b.videoUrl?.trim() || null,
        technique: b.technique?.trim() || null,
        recommendations: b.recommendations?.trim() || null,
        precautions: b.precautions?.trim() || null,
        ownerCoachId: auth.userId,
      },
      select: {
        id: true,
        name: true,
        muscleGroup: true,
        videoUrl: true,
        technique: true,
        recommendations: true,
        precautions: true,
      },
    });
    return { ...exercise, custom: true };
  });

  // ── Programs ────────────────────────────────────────────────────
  fastify.get('/coach/programs', { preHandler: fastify.requireAuth }, async (request, reply) => {
    if (!(await requireCoach(request, reply))) return;
    const auth = request.auth!;
    const programs = await prisma.program.findMany({
      where: { coachId: auth.userId },
      orderBy: { updatedAt: 'desc' },
      include: {
        _count: { select: { days: true, assignments: true } },
      },
    });
    return programs.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      isTemplate: p.isTemplate,
      dayCount: p._count.days,
      assignmentCount: p._count.assignments,
      updatedAt: p.updatedAt,
    }));
  });

  fastify.post<{ Body: ProgramInput }>(
    '/coach/programs',
    { preHandler: fastify.requireAuth },
    async (request, reply) => {
      if (!(await requireCoach(request, reply))) return;
      const auth = request.auth!;
      const body = request.body;
      if (!body?.name || !body.name.trim()) {
        reply.code(400).send({ error: 'bad_request', reason: 'name_required' });
        return;
      }

      const program = await prisma.program.create({
        data: {
          coachId: auth.userId,
          name: body.name.trim(),
          description: body.description?.trim() || null,
          isTemplate: body.isTemplate ?? false,
          days: {
            create: (body.days ?? []).map((day, di) => ({
              order: day.order ?? di,
              title: day.title?.trim() || null,
              exercises: {
                create: (day.exercises ?? []).map((ex, ei) => ({
                  exerciseId: ex.exerciseId,
                  order: ex.order ?? ei,
                  sets: ex.sets ?? null,
                  reps: ex.reps?.trim() || null,
                  weight: ex.weight?.trim() || null,
                  restSec: ex.restSec ?? null,
                  tempo: ex.tempo?.trim() || null,
                  notes: ex.notes?.trim() || null,
                })),
              },
            })),
          },
        },
        select: { id: true },
      });
      return { id: program.id, ok: true };
    },
  );

  fastify.get<{ Params: { id: string } }>(
    '/coach/programs/:id',
    { preHandler: fastify.requireAuth },
    async (request, reply) => {
      if (!(await requireCoach(request, reply))) return;
      const auth = request.auth!;
      const program = await prisma.program.findFirst({
        where: { id: request.params.id, coachId: auth.userId },
        include: {
          days: {
            orderBy: { order: 'asc' },
            include: {
              exercises: {
                orderBy: { order: 'asc' },
                include: { exercise: { select: { id: true, name: true, muscleGroup: true } } },
              },
            },
          },
        },
      });
      if (!program) {
        reply.code(404).send({ error: 'not_found' });
        return;
      }
      return {
        id: program.id,
        name: program.name,
        description: program.description,
        isTemplate: program.isTemplate,
        days: program.days.map((d) => ({
          id: d.id,
          order: d.order,
          title: d.title,
          exercises: d.exercises.map((pe) => ({
            id: pe.id,
            exerciseId: pe.exerciseId,
            name: pe.exercise.name,
            muscleGroup: pe.exercise.muscleGroup,
            order: pe.order,
            sets: pe.sets,
            reps: pe.reps,
            weight: pe.weight,
            restSec: pe.restSec,
            tempo: pe.tempo,
            notes: pe.notes,
          })),
        })),
      };
    },
  );

  fastify.delete<{ Params: { id: string } }>(
    '/coach/programs/:id',
    { preHandler: fastify.requireAuth },
    async (request, reply) => {
      if (!(await requireCoach(request, reply))) return;
      const auth = request.auth!;
      const program = await prisma.program.findFirst({
        where: { id: request.params.id, coachId: auth.userId },
        select: { id: true },
      });
      if (!program) {
        reply.code(404).send({ error: 'not_found' });
        return;
      }
      // Days & their exercises cascade; assignments do not, so block if any exist.
      const assignmentCount = await prisma.assignment.count({ where: { programId: program.id } });
      if (assignmentCount > 0) {
        reply.code(409).send({ error: 'conflict', reason: 'program_assigned' });
        return;
      }
      await prisma.program.delete({ where: { id: program.id } });
      return { ok: true };
    },
  );

  // ── Assign a program to a client ────────────────────────────────
  fastify.post<{ Params: { id: string }; Body: { clientId: string } }>(
    '/coach/programs/:id/assign',
    { preHandler: fastify.requireAuth },
    async (request, reply) => {
      if (!(await requireCoach(request, reply))) return;
      const auth = request.auth!;
      const clientId = request.body?.clientId;
      if (!clientId) {
        reply.code(400).send({ error: 'bad_request', reason: 'client_required' });
        return;
      }

      // Program must belong to this coach.
      const program = await prisma.program.findFirst({
        where: { id: request.params.id, coachId: auth.userId },
        select: { id: true, name: true },
      });
      if (!program) {
        reply.code(404).send({ error: 'not_found', reason: 'program_not_found' });
        return;
      }
      // Client must be linked to this coach.
      const link = await prisma.coachClient.findUnique({
        where: { coachId_clientId: { coachId: auth.userId, clientId } },
        select: { id: true },
      });
      if (!link) {
        reply.code(404).send({ error: 'not_found', reason: 'client_not_found' });
        return;
      }

      // One active program per client: deactivate any prior active assignment.
      const assignment = await prisma.$transaction(async (tx) => {
        await tx.assignment.updateMany({
          where: { clientId, active: true },
          data: { active: false },
        });
        return tx.assignment.create({
          data: { programId: program.id, clientId, active: true },
          select: { id: true, startDate: true },
        });
      });

      await notifyUser(
        clientId,
        `🏋️ Тренер выдал вам новую программу «${program.name}». Откройте приложение, чтобы начать.`,
      );
      return { ok: true, assignmentId: assignment.id, startDate: assignment.startDate };
    },
  );
};
