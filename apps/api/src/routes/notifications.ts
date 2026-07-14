// In-app notifications center (both roles).
//   GET  /notifications              — recent notifications for the current user
//   GET  /notifications/unread-count — badge count
//   POST /notifications/read         — mark all (or one) read
//   GET  /notifications/prefs        — notification switches
//   PUT  /notifications/prefs        — update switches
//
// Rows are written by notify.ts (recordNotification) and the reminders runner.
// Preferences gate the cron reminders (workout / supplements); the center still
// lists everything that was delivered.

import type { FastifyPluginAsync } from 'fastify';
import { prisma } from '@jet/db';

export interface NotifyPrefs {
  workout: boolean;
  supplements: boolean;
}

export function readPrefs(raw: unknown): NotifyPrefs {
  const p = (raw ?? {}) as Partial<NotifyPrefs>;
  return {
    workout: p.workout !== false,
    supplements: p.supplements !== false,
  };
}

function bodyOf(payload: unknown): string {
  if (payload && typeof payload === 'object' && typeof (payload as { body?: unknown }).body === 'string') {
    return (payload as { body: string }).body;
  }
  return '';
}

export const notificationRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Querystring: { limit?: string } }>(
    '/notifications',
    { preHandler: fastify.requireAuth },
    async (request) => {
      const auth = request.auth!;
      const limit = Math.min(100, Math.max(1, Number(request.query.limit) || 40));
      const rows = await prisma.notification.findMany({
        where: { userId: auth.userId },
        orderBy: { createdAt: 'desc' },
        take: limit,
      });
      return rows
        .filter((r) => bodyOf(r.payload)) // hide internal dedup-only rows without a body
        .map((r) => ({
          id: r.id,
          type: r.type,
          body: bodyOf(r.payload),
          createdAt: r.createdAt.toISOString(),
          read: r.readAt != null,
        }));
    },
  );

  fastify.get(
    '/notifications/unread-count',
    { preHandler: fastify.requireAuth },
    async (request) => {
      const auth = request.auth!;
      const count = await prisma.notification.count({
        where: { userId: auth.userId, readAt: null },
      });
      return { count };
    },
  );

  fastify.post<{ Body: { id?: string } }>(
    '/notifications/read',
    { preHandler: fastify.requireAuth },
    async (request) => {
      const auth = request.auth!;
      const id = request.body?.id;
      if (id) {
        await prisma.notification.updateMany({
          where: { id, userId: auth.userId, readAt: null },
          data: { readAt: new Date() },
        });
      } else {
        await prisma.notification.updateMany({
          where: { userId: auth.userId, readAt: null },
          data: { readAt: new Date() },
        });
      }
      return { ok: true };
    },
  );

  fastify.get('/notifications/prefs', { preHandler: fastify.requireAuth }, async (request) => {
    const auth = request.auth!;
    const u = await prisma.user.findUnique({
      where: { id: auth.userId },
      select: { notifyPrefs: true },
    });
    return readPrefs(u?.notifyPrefs);
  });

  fastify.put<{ Body: Partial<NotifyPrefs> }>(
    '/notifications/prefs',
    { preHandler: fastify.requireAuth },
    async (request) => {
      const auth = request.auth!;
      const current = await prisma.user.findUnique({
        where: { id: auth.userId },
        select: { notifyPrefs: true },
      });
      const merged = { ...readPrefs(current?.notifyPrefs), ...(request.body ?? {}) };
      const next = readPrefs(merged);
      await prisma.user.update({ where: { id: auth.userId }, data: { notifyPrefs: next as object } });
      return next;
    },
  );
};
