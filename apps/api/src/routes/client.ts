// Client routes (Phase 1).
//   POST /client/register — current user becomes a client (self sign-up,
//                           without an invite; a coach can be linked later).
//   GET  /client/program  — the client's active assigned program (days+exercises).

import type { FastifyPluginAsync } from 'fastify';
import { prisma } from '@jet/db';

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
};
