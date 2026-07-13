// Program builder & assignment routes (spec §7.2, §7.3) — Phase 1.
//
//   GET  /coach/exercises            — exercise library (global + coach's own)
//   POST /coach/exercises            — create a custom exercise
//   GET  /coach/programs             — list the coach's programs (with counts)
//   POST /coach/programs             — create a program with days & exercises
//   GET  /coach/programs/:id         — full program (days + exercises)
//   DELETE /coach/programs/:id       — delete a program
//   POST /coach/programs/:id/assign  — hand a program to one of the coach's clients

import type { FastifyPluginAsync } from 'fastify';
import { prisma } from '@jet/db';
import { requireCoach } from '../auth/guards.js';
import { notifyUser } from '../notify.js';

// A small starter library so a new coach can build a program immediately.
// Seeded lazily (once) when no global exercises exist yet.
const STARTER_EXERCISES: Array<{ name: string; muscleGroup: string }> = [
  { name: 'Приседания со штангой', muscleGroup: 'Ноги' },
  { name: 'Жим лёжа', muscleGroup: 'Грудь' },
  { name: 'Становая тяга', muscleGroup: 'Спина' },
  { name: 'Жим стоя (армейский)', muscleGroup: 'Плечи' },
  { name: 'Подтягивания', muscleGroup: 'Спина' },
  { name: 'Тяга штанги в наклоне', muscleGroup: 'Спина' },
  { name: 'Выпады с гантелями', muscleGroup: 'Ноги' },
  { name: 'Жим гантелей сидя', muscleGroup: 'Плечи' },
  { name: 'Подъём на бицепс', muscleGroup: 'Руки' },
  { name: 'Разгибания на трицепс', muscleGroup: 'Руки' },
  { name: 'Румынская тяга', muscleGroup: 'Ноги' },
  { name: 'Планка', muscleGroup: 'Кор' },
  { name: 'Скручивания', muscleGroup: 'Кор' },
  { name: 'Жим ногами', muscleGroup: 'Ноги' },
  { name: 'Гиперэкстензия', muscleGroup: 'Спина' },
];

async function ensureStarterLibrary(): Promise<void> {
  const globalCount = await prisma.exercise.count({ where: { ownerCoachId: null } });
  if (globalCount > 0) return;
  await prisma.exercise.createMany({
    data: STARTER_EXERCISES.map((e) => ({ ...e, ownerCoachId: null })),
  });
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
      select: { id: true, name: true, muscleGroup: true, videoUrl: true, ownerCoachId: true },
    });
    return exercises.map((e) => ({ ...e, custom: e.ownerCoachId === auth.userId }));
  });

  fastify.post<{ Body: { name: string; muscleGroup?: string; videoUrl?: string; instructions?: string } }>(
    '/coach/exercises',
    { preHandler: fastify.requireAuth },
    async (request, reply) => {
      if (!(await requireCoach(request, reply))) return;
      const auth = request.auth!;
      const { name, muscleGroup, videoUrl, instructions } = request.body ?? {};
      if (!name || !name.trim()) {
        reply.code(400).send({ error: 'bad_request', reason: 'name_required' });
        return;
      }
      const exercise = await prisma.exercise.create({
        data: {
          name: name.trim(),
          muscleGroup: muscleGroup?.trim() || null,
          videoUrl: videoUrl?.trim() || null,
          instructions: instructions?.trim() || null,
          ownerCoachId: auth.userId,
        },
        select: { id: true, name: true, muscleGroup: true, videoUrl: true },
      });
      return { ...exercise, custom: true };
    },
  );

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
