// Messaging routes: direct coach ↔ client chat plus contextual comments on a
// program or a nutrition day. Both sides share one thread per (coach, client).
//
//   Client side:
//     GET  /client/messages            — full thread with the client's coach
//     POST /client/messages            — send a message / comment to the coach
//     GET  /client/messages/unread     — unread count (for a badge)
//
//   Coach side:
//     GET  /coach/clients/:id/messages         — thread with one client
//     POST /coach/clients/:id/messages         — send a message / comment
//     GET  /coach/messages/unread              — unread counts per client

import type { FastifyPluginAsync } from 'fastify';
import { prisma } from '@jet/db';
import { requireCoach } from '../auth/guards.js';
import { notifyUser } from '../notify.js';

interface MessageInput {
  body: string;
  contextType?: string | null;
  contextId?: string | null;
  contextLabel?: string | null;
}

const CONTEXT_TYPES = new Set(['program', 'nutrition']);

// Resolve the coach a client talks to: prefer an active link, else most recent.
async function resolveCoachId(clientId: string): Promise<string | null> {
  const active = await prisma.coachClient.findFirst({
    where: { clientId, status: 'active' },
    orderBy: { createdAt: 'desc' },
    select: { coachId: true },
  });
  if (active) return active.coachId;
  const any = await prisma.coachClient.findFirst({
    where: { clientId },
    orderBy: { createdAt: 'desc' },
    select: { coachId: true },
  });
  return any?.coachId ?? null;
}

function normalizeContext(b: MessageInput) {
  const type = b.contextType && CONTEXT_TYPES.has(b.contextType) ? b.contextType : null;
  return {
    contextType: type,
    contextId: type ? b.contextId?.toString().slice(0, 128) || null : null,
    contextLabel: type ? b.contextLabel?.toString().slice(0, 200) || null : null,
  };
}

function serialize(m: {
  id: string;
  senderId: string;
  coachId: string;
  body: string;
  contextType: string | null;
  contextLabel: string | null;
  createdAt: Date;
  readAt: Date | null;
}, viewerId: string) {
  return {
    id: m.id,
    body: m.body,
    mine: m.senderId === viewerId,
    fromCoach: m.senderId === m.coachId,
    contextType: m.contextType,
    contextLabel: m.contextLabel,
    createdAt: m.createdAt,
    readAt: m.readAt,
  };
}

export const messageRoutes: FastifyPluginAsync = async (fastify) => {
  // ── Client side ─────────────────────────────────────────────────
  fastify.get('/client/messages', { preHandler: fastify.requireAuth }, async (request) => {
    const auth = request.auth!;
    const coachId = await resolveCoachId(auth.userId);
    if (!coachId) return { coach: null, messages: [] };

    const messages = await prisma.message.findMany({
      where: { coachId, clientId: auth.userId },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
    // Mark the coach's messages as read.
    await prisma.message.updateMany({
      where: { coachId, clientId: auth.userId, senderId: coachId, readAt: null },
      data: { readAt: new Date() },
    });
    const coach = await prisma.user.findUnique({
      where: { id: coachId },
      select: { firstName: true, username: true },
    });
    return {
      coach: { name: coach?.firstName || (coach?.username ? `@${coach.username}` : 'Тренер') },
      messages: messages.map((m) => serialize(m, auth.userId)),
    };
  });

  fastify.post<{ Body: MessageInput }>(
    '/client/messages',
    { preHandler: fastify.requireAuth },
    async (request, reply) => {
      const auth = request.auth!;
      const text = request.body?.body?.trim();
      if (!text) {
        reply.code(400).send({ error: 'bad_request', reason: 'body_required' });
        return;
      }
      const coachId = await resolveCoachId(auth.userId);
      if (!coachId) {
        reply.code(409).send({ error: 'conflict', reason: 'no_coach' });
        return;
      }
      const ctx = normalizeContext(request.body);
      const msg = await prisma.message.create({
        data: {
          coachId,
          clientId: auth.userId,
          senderId: auth.userId,
          body: text.slice(0, 4000),
          ...ctx,
        },
      });
      const label = ctx.contextLabel ? ` (${ctx.contextLabel})` : '';
      await notifyUser(coachId, `💬 Сообщение от клиента${label}. Откройте приложение, чтобы ответить.`, { type: 'chat' });
      return serialize(msg, auth.userId);
    },
  );

  fastify.get('/client/messages/unread', { preHandler: fastify.requireAuth }, async (request) => {
    const auth = request.auth!;
    const count = await prisma.message.count({
      where: { clientId: auth.userId, senderId: { not: auth.userId }, readAt: null },
    });
    return { count };
  });

  // ── Coach side ──────────────────────────────────────────────────
  async function assertLink(coachId: string, clientId: string): Promise<boolean> {
    const link = await prisma.coachClient.findUnique({
      where: { coachId_clientId: { coachId, clientId } },
      select: { id: true },
    });
    return Boolean(link);
  }

  fastify.get<{ Params: { id: string } }>(
    '/coach/clients/:id/messages',
    { preHandler: fastify.requireAuth },
    async (request, reply) => {
      if (!(await requireCoach(request, reply))) return;
      const auth = request.auth!;
      const clientId = request.params.id;
      if (!(await assertLink(auth.userId, clientId))) {
        reply.code(404).send({ error: 'not_found' });
        return;
      }
      const messages = await prisma.message.findMany({
        where: { coachId: auth.userId, clientId },
        orderBy: { createdAt: 'asc' },
        take: 200,
      });
      await prisma.message.updateMany({
        where: { coachId: auth.userId, clientId, senderId: clientId, readAt: null },
        data: { readAt: new Date() },
      });
      return { messages: messages.map((m) => serialize(m, auth.userId)) };
    },
  );

  fastify.post<{ Params: { id: string }; Body: MessageInput }>(
    '/coach/clients/:id/messages',
    { preHandler: fastify.requireAuth },
    async (request, reply) => {
      if (!(await requireCoach(request, reply))) return;
      const auth = request.auth!;
      const clientId = request.params.id;
      const text = request.body?.body?.trim();
      if (!text) {
        reply.code(400).send({ error: 'bad_request', reason: 'body_required' });
        return;
      }
      if (!(await assertLink(auth.userId, clientId))) {
        reply.code(404).send({ error: 'not_found' });
        return;
      }
      const ctx = normalizeContext(request.body);
      const msg = await prisma.message.create({
        data: {
          coachId: auth.userId,
          clientId,
          senderId: auth.userId,
          body: text.slice(0, 4000),
          ...ctx,
        },
      });
      const label = ctx.contextLabel ? ` (${ctx.contextLabel})` : '';
      await notifyUser(clientId, `💬 Сообщение от тренера${label}. Загляните в приложение.`, { type: 'chat' });
      return serialize(msg, auth.userId);
    },
  );

  // Unread counts grouped by client, for the coach's client list badges.
  fastify.get('/coach/messages/unread', { preHandler: fastify.requireAuth }, async (request, reply) => {
    if (!(await requireCoach(request, reply))) return;
    const auth = request.auth!;
    const grouped = await prisma.message.groupBy({
      by: ['clientId'],
      where: { coachId: auth.userId, senderId: { not: auth.userId }, readAt: null },
      _count: { _all: true },
    });
    const byClient: Record<string, number> = {};
    let total = 0;
    for (const g of grouped) {
      byClient[g.clientId] = g._count._all;
      total += g._count._all;
    }
    return { total, byClient };
  });
};
