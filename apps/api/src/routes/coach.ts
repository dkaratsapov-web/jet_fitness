// Coach routes (spec §7.1, §8) — Phase 1: registration, client invitations,
// client list.
//
//   POST /coach/register        — current user becomes a coach
//   POST /coach/invites         — create a one-time invite deep-link
//   GET  /coach/clients         — the coach's clients with status
//   GET  /coach/clients/:id     — one client's card
//   GET  /coach/dashboard       — basic counts

import { randomBytes } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import { prisma } from '@jet/db';
import { env } from '../env.js';
import { requireCoach } from '../auth/guards.js';

const INVITE_TTL_DAYS = 7;

export const coachRoutes: FastifyPluginAsync = async (fastify) => {
  // Become a coach (idempotent).
  fastify.post(
    '/coach/register',
    { preHandler: fastify.requireAuth },
    async (request) => {
      const auth = request.auth!;
      await prisma.coachProfile.upsert({
        where: { userId: auth.userId },
        update: {},
        create: { userId: auth.userId },
      });
      return { ok: true, isCoach: true };
    },
  );

  // Create a one-time invite deep-link for a client.
  fastify.post(
    '/coach/invites',
    { preHandler: fastify.requireAuth },
    async (request, reply) => {
      if (!(await requireCoach(request, reply))) return;
      const auth = request.auth!;

      const token = randomBytes(16).toString('base64url');
      const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
      await prisma.coachInvite.create({
        data: { token, coachId: auth.userId, expiresAt },
      });

      const deepLink = env.botUsername
        ? `https://t.me/${env.botUsername}?start=invite_${token}`
        : null;
      return { token, deepLink, expiresAt };
    },
  );

  // List the coach's clients.
  fastify.get(
    '/coach/clients',
    { preHandler: fastify.requireAuth },
    async (request, reply) => {
      if (!(await requireCoach(request, reply))) return;
      const auth = request.auth!;

      const links = await prisma.coachClient.findMany({
        where: { coachId: auth.userId },
        orderBy: { createdAt: 'desc' },
        include: {
          client: {
            select: {
              id: true,
              firstName: true,
              username: true,
              clientProfile: { select: { goal: true, status: true } },
            },
          },
        },
      });

      return links.map((l) => ({
        id: l.client.id,
        firstName: l.client.firstName,
        username: l.client.username,
        status: l.status,
        startedAt: l.startedAt,
        goal: l.client.clientProfile?.goal ?? null,
      }));
    },
  );

  // One client's card (must belong to this coach).
  fastify.get<{ Params: { id: string } }>(
    '/coach/clients/:id',
    { preHandler: fastify.requireAuth },
    async (request, reply) => {
      if (!(await requireCoach(request, reply))) return;
      const auth = request.auth!;
      const link = await prisma.coachClient.findUnique({
        where: { coachId_clientId: { coachId: auth.userId, clientId: request.params.id } },
        include: {
          client: {
            select: {
              id: true,
              firstName: true,
              username: true,
              clientProfile: true,
            },
          },
        },
      });
      if (!link) {
        reply.code(404).send({ error: 'not_found' });
        return;
      }
      return {
        id: link.client.id,
        firstName: link.client.firstName,
        username: link.client.username,
        status: link.status,
        startedAt: link.startedAt,
        profile: link.client.clientProfile,
      };
    },
  );

  // Basic dashboard counts.
  fastify.get(
    '/coach/dashboard',
    { preHandler: fastify.requireAuth },
    async (request, reply) => {
      if (!(await requireCoach(request, reply))) return;
      const auth = request.auth!;
      const [total, active, pendingInvites] = await Promise.all([
        prisma.coachClient.count({ where: { coachId: auth.userId } }),
        prisma.coachClient.count({ where: { coachId: auth.userId, status: 'active' } }),
        prisma.coachInvite.count({
          where: { coachId: auth.userId, usedAt: null, expiresAt: { gt: new Date() } },
        }),
      ]);
      return { totalClients: total, activeClients: active, pendingInvites };
    },
  );
};
