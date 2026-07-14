// Auth routes (spec §8).
//   POST /auth/session — validate initData, upsert user, bind invite if present,
//                        return profile + roles.
//   GET  /me           — current user + roles.

import type { FastifyPluginAsync } from 'fastify';
import { prisma } from '@jet/db';
import { parseStartParam, type SessionResponse, type AppRole } from '@jet/shared';
import { env } from '../env.js';
import { notifyUser } from '../notify.js';

interface Roles {
  roles: AppRole[];
  isOwner: boolean;
  isCoach: boolean;
  isClient: boolean;
}

function toSessionResponse(
  roles: Roles,
  user: {
    id: string;
    telegramId: bigint;
    username: string | null;
    firstName: string | null;
    timezone: string;
  },
): SessionResponse {
  return {
    user: {
      id: user.id,
      telegramId: user.telegramId.toString(),
      username: user.username,
      firstName: user.firstName,
      timezone: user.timezone,
    },
    roles: roles.roles,
    isOwner: roles.isOwner,
    isCoach: roles.isCoach,
    isClient: roles.isClient,
  };
}

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /auth/session
  fastify.post(
    '/auth/session',
    { preHandler: fastify.requireAuth },
    async (request, reply): Promise<SessionResponse> => {
      const auth = request.auth!;

      // If launched via an invite deep-link, bind this user to the coach.
      const start = parseStartParam(auth.initData.startParam);
      if (start?.kind === 'invite') {
        await bindInvite(auth.userId, start.token, fastify.log);
      }

      // Re-read the user (invite binding may have created a client relationship).
      const refreshed = await resolveUserAndRoles(auth.userId);
      reply.header('cache-control', 'no-store');
      return toSessionResponse(refreshed.roles, refreshed.user);
    },
  );

  // GET /me
  fastify.get(
    '/me',
    { preHandler: fastify.requireAuth },
    async (request): Promise<SessionResponse> => {
      const auth = request.auth!;
      const { user, roles } = await resolveUserAndRoles(auth.userId);
      return toSessionResponse(roles, user);
    },
  );
};

/** Consume a one-time invite token and create the coach<->client relationship. */
async function bindInvite(
  clientId: string,
  token: string,
  log: { warn: (msg: string) => void },
): Promise<void> {
  const invite = await prisma.coachInvite.findUnique({ where: { token } });
  if (!invite) {
    log.warn(`invite token not found: ${token}`);
    return;
  }
  if (invite.usedAt) {
    log.warn(`invite token already used: ${token}`);
    return;
  }
  if (invite.expiresAt < new Date()) {
    log.warn(`invite token expired: ${token}`);
    return;
  }
  if (invite.coachId === clientId) {
    log.warn('user cannot accept their own invite');
    return;
  }

  await prisma.$transaction([
    prisma.coachInvite.update({
      where: { id: invite.id },
      data: { usedAt: new Date(), usedById: clientId },
    }),
    prisma.coachClient.upsert({
      where: { coachId_clientId: { coachId: invite.coachId, clientId } },
      update: { status: 'active', startedAt: new Date() },
      create: {
        coachId: invite.coachId,
        clientId,
        status: 'active',
        startedAt: new Date(),
      },
    }),
    prisma.clientProfile.upsert({
      where: { userId: clientId },
      update: {},
      create: { userId: clientId },
    }),
  ]);

  // Notify the coach that a new client joined via their invite.
  const client = await prisma.user.findUnique({
    where: { id: clientId },
    select: { firstName: true, username: true },
  });
  const who = client?.firstName || (client?.username ? `@${client.username}` : 'Новый клиент');
  await notifyUser(invite.coachId, `🎉 ${who} присоединился(ась) к вам по приглашению.`, { type: 'client_joined' });
}

async function resolveUserAndRoles(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: { coachProfile: true, clientProfile: true },
  });
  const clientRelations = await prisma.coachClient.count({
    where: { clientId: userId },
  });
  const isOwner = env.ownerTelegramIds.includes(user.telegramId.toString());
  const isCoach = Boolean(user.coachProfile);
  const isClient = Boolean(user.clientProfile) || clientRelations > 0;
  const roles: AppRole[] = [];
  if (isOwner) roles.push('owner');
  if (isCoach) roles.push('coach');
  if (isClient) roles.push('client');
  return {
    user,
    roles: { roles, isOwner, isCoach, isClient } satisfies Roles,
  };
}
