// Internal reminders runner (spec §7.7 backlog): supplement-intake and workout
// nudges via Telegram. Called on a schedule by a GitHub Actions cron, guarded
// by a shared secret. Idempotent per (user, thing, local day) via Notification
// rows so overlapping polls never double-notify.
//
//   POST /internal/reminders/run   (header x-reminders-secret)

import type { FastifyPluginAsync } from 'fastify';
import { prisma } from '@jet/db';
import { env } from '../env.js';
import { notifyUser } from '../notify.js';
import { readPrefs } from './notifications.js';

const WINDOW_MIN = 20; // match a scheduled time within the last N minutes
const WORKOUT_HOUR = 19; // evening workout nudge (client-local)

interface LocalTime {
  minutes: number; // minutes since local midnight
  dateKey: string; // YYYY-MM-DD in the client's timezone
}

function localTime(tz: string, now: Date): LocalTime {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz || 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(now);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
    const hour = Number(get('hour')) % 24;
    const minute = Number(get('minute'));
    return { minutes: hour * 60 + minute, dateKey: `${get('year')}-${get('month')}-${get('day')}` };
  } catch {
    const minutes = now.getUTCHours() * 60 + now.getUTCMinutes();
    return { minutes, dateKey: now.toISOString().slice(0, 10) };
  }
}

function parseHM(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

// Fire once per key: create a Notification row (with body for the in-app
// center), skip if one already exists. Passes record:false so notifyUser does
// not create a second row.
async function once(userId: string, type: string, key: string, text: string): Promise<boolean> {
  const existing = await prisma.notification.count({
    where: { userId, type, payload: { path: ['key'], equals: key } },
  });
  if (existing > 0) return false;
  await prisma.notification.create({
    data: { userId, type, payload: { key, body: text }, sentAt: new Date() },
  });
  await notifyUser(userId, text, { record: false });
  return true;
}

export const reminderRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/internal/reminders/run', async (request, reply) => {
    if (!env.remindersSecret) {
      return reply.code(503).send({ error: 'unavailable', reason: 'reminders_disabled' });
    }
    const provided =
      (request.headers['x-reminders-secret'] as string | undefined) ??
      (request.query as { secret?: string })?.secret;
    if (provided !== env.remindersSecret) {
      return reply.code(401).send({ error: 'unauthorized' });
    }

    const now = new Date();
    let supplementsSent = 0;
    let workoutsSent = 0;

    // ── Supplement reminders ─────────────────────────────────────
    const supps = await prisma.supplementLog.findMany({ where: { remindersOn: true } });
    const tzCache = new Map<string, string>();
    const prefCache = new Map<string, { workout: boolean; supplements: boolean }>();
    async function ctxOf(clientId: string): Promise<{ tz: string; prefs: { workout: boolean; supplements: boolean } }> {
      if (!tzCache.has(clientId) || !prefCache.has(clientId)) {
        const u = await prisma.user.findUnique({
          where: { id: clientId },
          select: { timezone: true, notifyPrefs: true },
        });
        tzCache.set(clientId, u?.timezone || 'UTC');
        prefCache.set(clientId, readPrefs(u?.notifyPrefs));
      }
      return { tz: tzCache.get(clientId)!, prefs: prefCache.get(clientId)! };
    }

    for (const s of supps) {
      const times = (s.schedule as { times?: string[] } | null)?.times;
      if (!Array.isArray(times) || times.length === 0) continue;
      const { tz, prefs } = await ctxOf(s.clientId);
      if (!prefs.supplements) continue;
      const { minutes, dateKey } = localTime(tz, now);
      for (const raw of times) {
        const sched = parseHM(String(raw));
        if (sched == null) continue;
        // fired if the scheduled minute falls in (now - WINDOW, now]
        if (sched <= minutes && sched > minutes - WINDOW_MIN) {
          const key = `${s.id}:${raw}:${dateKey}`;
          const dose = s.dose ? ` (${s.dose})` : '';
          const ok = await once(
            s.clientId,
            'supplement_reminder',
            key,
            `💊 Напоминание: прими «${s.name}»${dose}. Отметь приём в приложении.`,
          );
          if (ok) supplementsSent += 1;
        }
      }
    }

    // ── Evening workout nudge ────────────────────────────────────
    const activeLinks = await prisma.coachClient.findMany({
      where: { status: 'active' },
      select: { clientId: true },
    });
    const clientIds = [...new Set(activeLinks.map((l) => l.clientId))];
    for (const clientId of clientIds) {
      const hasAssignment = await prisma.assignment.count({ where: { clientId, active: true } });
      if (!hasAssignment) continue;
      const { tz, prefs } = await ctxOf(clientId);
      if (!prefs.workout) continue;
      const { minutes, dateKey } = localTime(tz, now);
      const target = WORKOUT_HOUR * 60;
      if (!(target <= minutes && target > minutes - WINDOW_MIN)) continue;
      // Already trained today (client-local)?
      const dayStart = new Date(`${dateKey}T00:00:00.000Z`);
      const trained = await prisma.workoutLog.count({
        where: { clientId, date: { gte: dayStart } },
      });
      if (trained > 0) continue;
      const ok = await once(
        clientId,
        'workout_reminder',
        `workout:${dateKey}`,
        '🏋️ Не забудь про тренировку сегодня — открой приложение и вперёд. Погнали! 💪',
      );
      if (ok) workoutsSent += 1;
    }

    return { ok: true, supplementsSent, workoutsSent };
  });
};
