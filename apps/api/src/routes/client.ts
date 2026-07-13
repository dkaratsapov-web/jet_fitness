// Client routes (Phase 1).
//   POST /client/register  — current user becomes a client (self sign-up).
//   GET  /client/program   — the client's active assigned program.
//   POST /client/workouts  — log a completed workout for one program day.
//   GET  /client/workouts  — recent workout history.

import type { FastifyPluginAsync } from 'fastify';
import { prisma } from '@jet/db';
import { summarizeWorkout, type WorkoutWithSets } from './workoutSummary.js';

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
};
