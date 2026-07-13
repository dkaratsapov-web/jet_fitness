// Client routes (Phase 1).
//   POST /client/register — current user becomes a client (self sign-up,
//                           without an invite; a coach can be linked later).

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
};
