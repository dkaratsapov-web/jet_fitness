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
import { summarizeWorkout, type WorkoutWithSets } from './workoutSummary.js';
import { listProgress, listCheckins, listProgressPhotos, listFormVideos } from './client.js';
import { notifyUser } from '../notify.js';

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

  // Recent workouts logged by one of the coach's clients.
  fastify.get<{ Params: { id: string } }>(
    '/coach/clients/:id/workouts',
    { preHandler: fastify.requireAuth },
    async (request, reply) => {
      if (!(await requireCoach(request, reply))) return;
      const auth = request.auth!;
      const link = await prisma.coachClient.findUnique({
        where: { coachId_clientId: { coachId: auth.userId, clientId: request.params.id } },
        select: { id: true },
      });
      if (!link) {
        reply.code(404).send({ error: 'not_found' });
        return;
      }
      const workouts = await prisma.workoutLog.findMany({
        where: { clientId: request.params.id },
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

  // A client's progress entries (weight, body-fat, measurements).
  fastify.get<{ Params: { id: string } }>(
    '/coach/clients/:id/progress',
    { preHandler: fastify.requireAuth },
    async (request, reply) => {
      if (!(await requireCoach(request, reply))) return;
      const auth = request.auth!;
      const link = await prisma.coachClient.findUnique({
        where: { coachId_clientId: { coachId: auth.userId, clientId: request.params.id } },
        select: { id: true },
      });
      if (!link) {
        reply.code(404).send({ error: 'not_found' });
        return;
      }
      return listProgress(request.params.id);
    },
  );

  // A client's progress photos (short-lived view URLs).
  fastify.get<{ Params: { id: string } }>(
    '/coach/clients/:id/progress-photos',
    { preHandler: fastify.requireAuth },
    async (request, reply) => {
      if (!(await requireCoach(request, reply))) return;
      const auth = request.auth!;
      const link = await prisma.coachClient.findUnique({
        where: { coachId_clientId: { coachId: auth.userId, clientId: request.params.id } },
        select: { id: true },
      });
      if (!link) {
        reply.code(404).send({ error: 'not_found' });
        return;
      }
      return listProgressPhotos(request.params.id);
    },
  );

  // A client's technique videos (with view URLs + comments).
  fastify.get<{ Params: { id: string } }>(
    '/coach/clients/:id/form-videos',
    { preHandler: fastify.requireAuth },
    async (request, reply) => {
      if (!(await requireCoach(request, reply))) return;
      const auth = request.auth!;
      const link = await prisma.coachClient.findUnique({
        where: { coachId_clientId: { coachId: auth.userId, clientId: request.params.id } },
        select: { id: true },
      });
      if (!link) {
        reply.code(404).send({ error: 'not_found' });
        return;
      }
      return listFormVideos(request.params.id);
    },
  );

  // Comment on a client's technique video (must be the client's coach).
  fastify.post<{ Params: { id: string }; Body: { body: string } }>(
    '/coach/form-videos/:id/comments',
    { preHandler: fastify.requireAuth },
    async (request, reply) => {
      if (!(await requireCoach(request, reply))) return;
      const auth = request.auth!;
      const text = request.body?.body?.trim();
      if (!text) {
        reply.code(400).send({ error: 'bad_request', reason: 'body_required' });
        return;
      }
      const video = await prisma.formVideo.findUnique({
        where: { id: request.params.id },
        select: { clientId: true },
      });
      if (!video) {
        reply.code(404).send({ error: 'not_found' });
        return;
      }
      const link = await prisma.coachClient.findUnique({
        where: { coachId_clientId: { coachId: auth.userId, clientId: video.clientId } },
        select: { id: true },
      });
      if (!link) {
        reply.code(403).send({ error: 'forbidden', reason: 'not_your_client' });
        return;
      }
      await prisma.formVideoComment.create({
        data: { formVideoId: request.params.id, coachId: auth.userId, body: text },
      });
      await notifyUser(video.clientId, '🎥 Тренер прокомментировал ваше видео техники.');
      return { ok: true };
    },
  );

  // A client's check-ins.
  fastify.get<{ Params: { id: string } }>(
    '/coach/clients/:id/checkins',
    { preHandler: fastify.requireAuth },
    async (request, reply) => {
      if (!(await requireCoach(request, reply))) return;
      const auth = request.auth!;
      const link = await prisma.coachClient.findUnique({
        where: { coachId_clientId: { coachId: auth.userId, clientId: request.params.id } },
        select: { id: true },
      });
      if (!link) {
        reply.code(404).send({ error: 'not_found' });
        return;
      }
      return listCheckins(request.params.id);
    },
  );

  // Reply to a client's check-in (must be the client's coach).
  fastify.post<{ Params: { id: string }; Body: { reply: string } }>(
    '/coach/checkins/:id/reply',
    { preHandler: fastify.requireAuth },
    async (request, reply) => {
      if (!(await requireCoach(request, reply))) return;
      const auth = request.auth!;
      const text = request.body?.reply?.trim();
      if (!text) {
        reply.code(400).send({ error: 'bad_request', reason: 'reply_required' });
        return;
      }
      const checkin = await prisma.checkIn.findUnique({
        where: { id: request.params.id },
        select: { clientId: true },
      });
      if (!checkin) {
        reply.code(404).send({ error: 'not_found' });
        return;
      }
      const link = await prisma.coachClient.findUnique({
        where: { coachId_clientId: { coachId: auth.userId, clientId: checkin.clientId } },
        select: { id: true },
      });
      if (!link) {
        reply.code(403).send({ error: 'forbidden', reason: 'not_your_client' });
        return;
      }
      await prisma.checkIn.update({
        where: { id: request.params.id },
        data: { coachReply: text, coachRepliedAt: new Date() },
      });
      await notifyUser(checkin.clientId, '💬 Тренер ответил на ваш check-in. Загляните в приложение.');
      return { ok: true };
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
