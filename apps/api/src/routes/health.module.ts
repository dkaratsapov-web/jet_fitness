// Health module (spec §7.6/§7.7/§10) — Phase 3. SENSITIVE.
//
// Gated behind HEALTH_MODULE_ENABLED + a configured encryption key + explicit,
// revocable client consent. Lab values and scanned-form keys are encrypted at
// rest. Data is client-owned: full export and hard-delete are provided. A
// client's coach gets read-only access to labs only while consent stands.
//
//   Status/consent:
//     GET    /client/health/status          — { moduleEnabled, consentGiven }
//     POST   /client/health/consent         — grant consent
//     DELETE /client/health/consent         — revoke consent (keeps data)
//   Lab results:
//     POST   /client/health/labs            — add a result (value encrypted)
//     GET    /client/health/labs            — list (decrypted, newest first)
//     GET    /client/health/labs/:marker    — one marker's history (for charts)
//     DELETE /client/health/labs/:id
//   Supplements (neutral journal — no dosing advice):
//     POST   /client/health/supplements     — add
//     GET    /client/health/supplements     — list with today's intakes
//     POST   /client/health/supplements/:id/intake — mark taken
//     DELETE /client/health/supplements/:id
//   Portability:
//     GET    /client/health/export          — all health data (decrypted)
//     DELETE /client/health                 — hard-delete all + revoke consent
//   Coach (read-only, requires client consent):
//     GET    /coach/clients/:id/health/labs

import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { prisma, type SupplementCreator } from '@jet/db';
import { env } from '../env.js';
import { requireCoach } from '../auth/guards.js';
import { encrypt, decrypt, isEncryptionConfigured } from '../health/crypto.js';

/** Module must be enabled AND have a working key. */
function moduleAvailable(): boolean {
  return env.healthModuleEnabled && isEncryptionConfigured();
}

/** Gate: module available + the calling client has active consent. */
async function requireConsent(request: FastifyRequest, reply: FastifyReply): Promise<boolean> {
  if (!moduleAvailable()) {
    reply.code(404).send({ error: 'not_found', reason: 'health_module_disabled' });
    return false;
  }
  const profile = await prisma.clientProfile.findUnique({
    where: { userId: request.auth!.userId },
    select: { healthConsentAt: true },
  });
  if (!profile?.healthConsentAt) {
    reply.code(403).send({ error: 'forbidden', reason: 'no_health_consent' });
    return false;
  }
  return true;
}

async function markerHistory(clientId: string, marker: string) {
  const rows = await prisma.labResult.findMany({
    where: { clientId, marker },
    orderBy: { date: 'asc' },
  });
  return rows.map((r) => ({
    id: r.id,
    date: r.date,
    value: Number(decrypt(r.valueEnc)),
    unit: r.unit,
    refLow: r.refLow,
    refHigh: r.refHigh,
  }));
}

export const healthModuleRoutes: FastifyPluginAsync = async (fastify) => {
  // ── Status & consent ────────────────────────────────────────────
  fastify.get('/client/health/status', { preHandler: fastify.requireAuth }, async (request) => {
    if (!moduleAvailable()) return { moduleEnabled: false, consentGiven: false };
    const profile = await prisma.clientProfile.findUnique({
      where: { userId: request.auth!.userId },
      select: { healthConsentAt: true },
    });
    return { moduleEnabled: true, consentGiven: Boolean(profile?.healthConsentAt) };
  });

  fastify.post('/client/health/consent', { preHandler: fastify.requireAuth }, async (request, reply) => {
    if (!moduleAvailable()) {
      reply.code(404).send({ error: 'not_found', reason: 'health_module_disabled' });
      return;
    }
    await prisma.clientProfile.upsert({
      where: { userId: request.auth!.userId },
      update: { healthConsentAt: new Date() },
      create: { userId: request.auth!.userId, healthConsentAt: new Date() },
    });
    return { ok: true };
  });

  fastify.delete('/client/health/consent', { preHandler: fastify.requireAuth }, async (request) => {
    await prisma.clientProfile.updateMany({
      where: { userId: request.auth!.userId },
      data: { healthConsentAt: null },
    });
    return { ok: true };
  });

  // ── Lab results ─────────────────────────────────────────────────
  fastify.post<{
    Body: { date?: string; marker?: string; value?: number; unit?: string; refLow?: number; refHigh?: number };
  }>('/client/health/labs', { preHandler: fastify.requireAuth }, async (request, reply) => {
    if (!(await requireConsent(request, reply))) return;
    const b = request.body ?? {};
    if (!b.marker?.trim() || b.value == null || !Number.isFinite(Number(b.value))) {
      reply.code(400).send({ error: 'bad_request', reason: 'marker_and_value_required' });
      return;
    }
    const row = await prisma.labResult.create({
      data: {
        clientId: request.auth!.userId,
        date: b.date ? new Date(b.date) : new Date(),
        marker: b.marker.trim(),
        valueEnc: encrypt(String(Number(b.value))),
        unit: b.unit?.trim() || null,
        refLow: b.refLow ?? null,
        refHigh: b.refHigh ?? null,
      },
      select: { id: true },
    });
    return { ok: true, id: row.id };
  });

  fastify.get('/client/health/labs', { preHandler: fastify.requireAuth }, async (request, reply) => {
    if (!(await requireConsent(request, reply))) return;
    const rows = await prisma.labResult.findMany({
      where: { clientId: request.auth!.userId },
      orderBy: { date: 'desc' },
      take: 200,
    });
    return rows.map((r) => ({
      id: r.id,
      date: r.date,
      marker: r.marker,
      value: Number(decrypt(r.valueEnc)),
      unit: r.unit,
      refLow: r.refLow,
      refHigh: r.refHigh,
    }));
  });

  fastify.get<{ Params: { marker: string } }>(
    '/client/health/labs/:marker',
    { preHandler: fastify.requireAuth },
    async (request, reply) => {
      if (!(await requireConsent(request, reply))) return;
      return markerHistory(request.auth!.userId, request.params.marker);
    },
  );

  fastify.delete<{ Params: { id: string } }>(
    '/client/health/labs/:id',
    { preHandler: fastify.requireAuth },
    async (request, reply) => {
      if (!(await requireConsent(request, reply))) return;
      const row = await prisma.labResult.findUnique({
        where: { id: request.params.id },
        select: { clientId: true },
      });
      if (!row || row.clientId !== request.auth!.userId) {
        reply.code(404).send({ error: 'not_found' });
        return;
      }
      await prisma.labResult.delete({ where: { id: request.params.id } });
      return { ok: true };
    },
  );

  // ── Supplements (neutral journal) ───────────────────────────────
  fastify.post<{ Body: { name?: string; dose?: string; schedule?: unknown; remindersOn?: boolean } }>(
    '/client/health/supplements',
    { preHandler: fastify.requireAuth },
    async (request, reply) => {
      if (!(await requireConsent(request, reply))) return;
      const b = request.body ?? {};
      if (!b.name?.trim()) {
        reply.code(400).send({ error: 'bad_request', reason: 'name_required' });
        return;
      }
      const row = await prisma.supplementLog.create({
        data: {
          clientId: request.auth!.userId,
          name: b.name.trim(),
          dose: b.dose?.trim() || null,
          schedule: (b.schedule as object) ?? undefined,
          createdBy: 'self' as SupplementCreator,
          remindersOn: Boolean(b.remindersOn),
        },
        select: { id: true },
      });
      return { ok: true, id: row.id };
    },
  );

  fastify.get('/client/health/supplements', { preHandler: fastify.requireAuth }, async (request, reply) => {
    if (!(await requireConsent(request, reply))) return;
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const rows = await prisma.supplementLog.findMany({
      where: { clientId: request.auth!.userId },
      orderBy: { createdAt: 'desc' },
      include: { intakes: { where: { takenAt: { gte: dayStart } }, select: { id: true, takenAt: true } } },
    });
    return rows.map((s) => ({
      id: s.id,
      name: s.name,
      dose: s.dose,
      schedule: s.schedule,
      remindersOn: s.remindersOn,
      takenToday: s.intakes.length,
    }));
  });

  fastify.post<{ Params: { id: string } }>(
    '/client/health/supplements/:id/intake',
    { preHandler: fastify.requireAuth },
    async (request, reply) => {
      if (!(await requireConsent(request, reply))) return;
      const log = await prisma.supplementLog.findUnique({
        where: { id: request.params.id },
        select: { clientId: true },
      });
      if (!log || log.clientId !== request.auth!.userId) {
        reply.code(404).send({ error: 'not_found' });
        return;
      }
      await prisma.supplementIntake.create({ data: { supplementLogId: request.params.id } });
      return { ok: true };
    },
  );

  fastify.delete<{ Params: { id: string } }>(
    '/client/health/supplements/:id',
    { preHandler: fastify.requireAuth },
    async (request, reply) => {
      if (!(await requireConsent(request, reply))) return;
      const log = await prisma.supplementLog.findUnique({
        where: { id: request.params.id },
        select: { clientId: true },
      });
      if (!log || log.clientId !== request.auth!.userId) {
        reply.code(404).send({ error: 'not_found' });
        return;
      }
      await prisma.supplementLog.delete({ where: { id: request.params.id } });
      return { ok: true };
    },
  );

  // ── Portability: export & hard-delete ───────────────────────────
  fastify.get('/client/health/export', { preHandler: fastify.requireAuth }, async (request, reply) => {
    if (!(await requireConsent(request, reply))) return;
    const clientId = request.auth!.userId;
    const [labs, supplements] = await Promise.all([
      prisma.labResult.findMany({ where: { clientId }, orderBy: { date: 'asc' } }),
      prisma.supplementLog.findMany({ where: { clientId }, include: { intakes: true } }),
    ]);
    return {
      exportedAt: new Date().toISOString(),
      labResults: labs.map((r) => ({
        date: r.date,
        marker: r.marker,
        value: Number(decrypt(r.valueEnc)),
        unit: r.unit,
        refLow: r.refLow,
        refHigh: r.refHigh,
      })),
      supplements: supplements.map((s) => ({
        name: s.name,
        dose: s.dose,
        schedule: s.schedule,
        intakes: s.intakes.map((i) => i.takenAt),
      })),
    };
  });

  fastify.delete('/client/health', { preHandler: fastify.requireAuth }, async (request) => {
    const clientId = request.auth!.userId;
    await prisma.$transaction([
      prisma.labResult.deleteMany({ where: { clientId } }),
      prisma.supplementLog.deleteMany({ where: { clientId } }),
      prisma.clientProfile.updateMany({ where: { userId: clientId }, data: { healthConsentAt: null } }),
    ]);
    return { ok: true };
  });

  // ── Coach: read-only labs (only while client consent stands) ─────
  fastify.get<{ Params: { id: string } }>(
    '/coach/clients/:id/health/labs',
    { preHandler: fastify.requireAuth },
    async (request, reply) => {
      if (!moduleAvailable()) {
        reply.code(404).send({ error: 'not_found', reason: 'health_module_disabled' });
        return;
      }
      if (!(await requireCoach(request, reply))) return;
      const clientId = request.params.id;
      const link = await prisma.coachClient.findUnique({
        where: { coachId_clientId: { coachId: request.auth!.userId, clientId } },
        select: { id: true },
      });
      if (!link) {
        reply.code(404).send({ error: 'not_found' });
        return;
      }
      const profile = await prisma.clientProfile.findUnique({
        where: { userId: clientId },
        select: { healthConsentAt: true },
      });
      if (!profile?.healthConsentAt) {
        reply.code(403).send({ error: 'forbidden', reason: 'client_no_consent' });
        return;
      }
      const rows = await prisma.labResult.findMany({
        where: { clientId },
        orderBy: { date: 'desc' },
        take: 200,
      });
      return rows.map((r) => ({
        id: r.id,
        date: r.date,
        marker: r.marker,
        value: Number(decrypt(r.valueEnc)),
        unit: r.unit,
        refLow: r.refLow,
        refHigh: r.refHigh,
      }));
    },
  );
};
