// Fastify auth plugin (spec §6). Registers a `requireAuth` preHandler that:
//   1. reads the raw Telegram initData from the request,
//   2. validates its signature + freshness (never trusting body-supplied ids),
//   3. upserts the User by telegram_id,
//   4. attaches { user, roles, telegram } to the request.
//
// initData is read from either:
//   - Authorization: tma <initData>        (Telegram Mini Apps convention)
//   - X-Telegram-Init-Data: <initData>     (fallback header)

import fp from 'fastify-plugin';
import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '@jet/db';
import {
  validateInitData,
  type InitDataError,
  type ValidatedInitData,
  type AppRole,
} from '@jet/shared';
import { env } from '../env.js';

export interface AuthContext {
  userId: string;
  telegramId: bigint;
  roles: AppRole[];
  isCoach: boolean;
  isClient: boolean;
  initData: ValidatedInitData;
}

declare module 'fastify' {
  interface FastifyRequest {
    auth?: AuthContext;
  }
  interface FastifyInstance {
    requireAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

function extractInitData(request: FastifyRequest): string | null {
  const auth = request.headers['authorization'];
  if (typeof auth === 'string' && auth.startsWith('tma ')) {
    return auth.slice(4).trim();
  }
  const header = request.headers['x-telegram-init-data'];
  if (typeof header === 'string' && header.length > 0) {
    return header;
  }
  return null;
}

const errorStatus: Record<InitDataError, number> = {
  missing: 401,
  malformed: 400,
  missing_hash: 400,
  bad_signature: 401,
  expired: 401,
  missing_user: 400,
};

/**
 * Resolve (or create) the User for a validated initData payload, then compute
 * the roles this account currently holds.
 */
export async function resolveAuthContext(
  data: ValidatedInitData,
): Promise<AuthContext> {
  const telegramId = BigInt(data.user.id);

  const user = await prisma.user.upsert({
    where: { telegramId },
    update: {
      username: data.user.username ?? undefined,
      firstName: data.user.first_name ?? undefined,
    },
    create: {
      telegramId,
      username: data.user.username ?? null,
      firstName: data.user.first_name ?? null,
    },
    include: { coachProfile: true, clientProfile: true },
  });

  // Owner bootstrap: promote configured Telegram IDs to coach on first login.
  let hasCoachProfile = Boolean(user.coachProfile);
  if (!hasCoachProfile && env.ownerTelegramIds.includes(telegramId.toString())) {
    await prisma.coachProfile.create({ data: { userId: user.id } });
    hasCoachProfile = true;
  }

  // A user is a "client" if they have a client profile OR any coach relationship.
  const clientRelations = await prisma.coachClient.count({
    where: { clientId: user.id },
  });

  const isCoach = hasCoachProfile;
  const isClient = Boolean(user.clientProfile) || clientRelations > 0;

  const roles: AppRole[] = [];
  if (isCoach) roles.push('coach');
  if (isClient) roles.push('client');

  return {
    userId: user.id,
    telegramId: user.telegramId,
    roles,
    isCoach,
    isClient,
    initData: data,
  };
}

const authPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorate(
    'requireAuth',
    async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
      const raw = extractInitData(request);
      if (!raw) {
        reply.code(401).send({ error: 'unauthorized', reason: 'missing_init_data' });
        return;
      }

      const result = validateInitData(raw, {
        botToken: env.botToken,
        ttlSeconds: env.initDataTtlSeconds,
      });

      if (!result.ok) {
        reply
          .code(errorStatus[result.error])
          .send({ error: 'unauthorized', reason: result.error });
        return;
      }

      request.auth = await resolveAuthContext(result.data);
    },
  );
};

export default fp(authPlugin, { name: 'auth' });
