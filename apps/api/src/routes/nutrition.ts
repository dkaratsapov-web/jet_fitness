// Nutrition module (spec §7.4, Phase 2): calorie & macro tracking.
//
//   Client:
//     GET    /client/nutrition/target          — current daily target
//     GET    /client/nutrition/day?date=…       — meals + totals vs target
//     POST   /client/nutrition/meals           — log a meal (computes macros)
//     DELETE /client/nutrition/meals/:id        — remove a logged meal
//     GET    /client/nutrition/foods/search?q=  — search foods (local + OFF)
//     GET    /client/nutrition/foods/barcode/:c — barcode lookup (OFF, cached)
//   Coach:
//     POST   /coach/clients/:id/nutrition-target — set a client's daily target
//     GET    /coach/clients/:id/nutrition/day    — a client's day summary

import type { FastifyPluginAsync } from 'fastify';
import { prisma, type MealType } from '@jet/db';
import { requireCoach } from '../auth/guards.js';
import {
  searchOpenFoodFacts,
  lookupBarcode,
  type Macros,
} from '../nutritionSources.js';
import { searchFatSecret, isFatSecretConfigured } from '../nutrition/fatsecret.js';
import { presign, isStorageConfigured } from '../storage.js';
import { notifyUser } from '../notify.js';
import { randomBytes } from 'node:crypto';

const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

interface PlanItemInput {
  mealType: MealType;
  title: string;
  grams?: number | null;
  kcal?: number | null;
  protein?: number | null;
  fat?: number | null;
  carbs?: number | null;
}

// Serialize a meal plan (+ items) for the API, resolving photo view URLs.
function serializePlan(
  plan: { id: string; date: Date; note: string | null; items: Array<{
    id: string; mealType: MealType; order: number; title: string; grams: number | null;
    kcal: number | null; protein: number | null; fat: number | null; carbs: number | null;
    done: boolean; doneAt: Date | null; photoKey: string | null;
  }> },
) {
  return {
    id: plan.id,
    date: plan.date.toISOString().slice(0, 10),
    note: plan.note,
    items: [...plan.items]
      .sort((a, b) => MEAL_TYPES.indexOf(a.mealType) - MEAL_TYPES.indexOf(b.mealType) || a.order - b.order)
      .map((it) => ({
        id: it.id,
        mealType: it.mealType,
        title: it.title,
        grams: it.grams,
        kcal: it.kcal,
        protein: it.protein,
        fat: it.fat,
        carbs: it.carbs,
        done: it.done,
        photoUrl: it.photoKey && isStorageConfigured() ? presign('GET', it.photoKey, 3600) : null,
      })),
  };
}

// Day bounds [start, end) for a YYYY-MM-DD string (server-local / UTC).
function dayRange(dateStr?: string): { start: Date; end: Date } {
  const base = dateStr ? new Date(`${dateStr}T00:00:00.000Z`) : new Date();
  const start = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate()));
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

async function currentTarget(clientId: string) {
  const t = await prisma.nutritionTarget.findFirst({
    where: { clientId },
    orderBy: { activeFrom: 'desc' },
  });
  return t ? { kcal: t.kcal, protein: t.protein, fat: t.fat, carbs: t.carbs, source: t.source } : null;
}

async function daySummary(clientId: string, dateStr?: string) {
  const { start, end } = dayRange(dateStr);
  const meals = await prisma.mealLog.findMany({
    where: { clientId, date: { gte: start, lt: end } },
    orderBy: { createdAt: 'asc' },
    include: { foodItem: { select: { name: true } } },
  });
  const totals = meals.reduce(
    (acc, m) => ({
      kcal: acc.kcal + m.kcal,
      protein: acc.protein + m.protein,
      fat: acc.fat + m.fat,
      carbs: acc.carbs + m.carbs,
    }),
    { kcal: 0, protein: 0, fat: 0, carbs: 0 },
  );
  const round = (n: number) => Math.round(n);
  return {
    date: start.toISOString().slice(0, 10),
    target: await currentTarget(clientId),
    totals: {
      kcal: round(totals.kcal),
      protein: round(totals.protein),
      fat: round(totals.fat),
      carbs: round(totals.carbs),
    },
    meals: meals.map((m) => ({
      id: m.id,
      mealType: m.mealType,
      name: m.foodItem?.name ?? 'Приём пищи',
      grams: m.grams,
      kcal: round(m.kcal),
      protein: round(m.protein),
      fat: round(m.fat),
      carbs: round(m.carbs),
    })),
  };
}

// Turn nutrition stats into short Russian conclusions the client can act on.
function buildInsights(x: {
  target: { kcal: number; protein: number; fat: number; carbs: number } | null;
  logged: number;
  averages: { kcal: number; protein: number; fat: number; carbs: number };
  adherencePct: number;
  days: Array<{ kcal: number }>;
}): string[] {
  const out: string[] = [];
  if (x.logged < 3) {
    out.push('Мало данных — веди дневник хотя бы 3–4 дня, и появятся выводы.');
    return out;
  }
  if (!x.target) {
    out.push('Задай цель КБЖУ (её ставит тренер) — тогда будет видно, насколько ты в цели.');
  } else {
    if (x.adherencePct >= 70) {
      out.push(`Отлично держишь калораж — ${x.adherencePct}% дней в пределах цели.`);
    } else if (x.adherencePct >= 40) {
      out.push(`Калории скачут — только ${x.adherencePct}% дней в цели. Старайся ровнее.`);
    } else {
      out.push(`Калораж часто мимо цели (${x.adherencePct}% дней в норме).`);
    }
    if (x.target.protein) {
      if (x.averages.protein < x.target.protein * 0.85) {
        out.push(
          `Белка не хватает: в среднем ${x.averages.protein} из ${x.target.protein} г. Добавь белковые продукты.`,
        );
      } else if (x.averages.protein >= x.target.protein * 0.95) {
        out.push(`Белок в норме — в среднем ${x.averages.protein} г в день.`);
      }
    }
  }
  // Trend: first vs second half of the logged range.
  const logged = x.days.filter((d) => d.kcal > 0).map((d) => d.kcal);
  if (logged.length >= 6) {
    const half = Math.floor(logged.length / 2);
    const first = logged.slice(0, half).reduce((s, v) => s + v, 0) / half;
    const second = logged.slice(half).reduce((s, v) => s + v, 0) / (logged.length - half);
    const diff = Math.round(second - first);
    if (Math.abs(diff) >= 150) {
      out.push(
        diff < 0
          ? `Калораж снижается — в среднем на ${Math.abs(diff)} ккал за период.`
          : `Калораж растёт — в среднем на ${diff} ккал за период.`,
      );
    }
  }
  return out;
}

// Food search shared by client and coach: FatSecret → local cache → OFF.
async function searchFoodsInternal(
  q: string,
): Promise<{ foods: Array<{ id: string; name: string; barcode: string | null; per100: Macros }> }> {
  if (q.length < 2) return { foods: [] };
  const MAX_RESULTS = 30;
  const foods: Array<{ id: string; name: string; barcode: string | null; per100: Macros }> = [];
  const seenNames = new Set<string>();
  const pushFood = (f: { id: string; name: string; barcode: string | null; per100: Macros }) => {
    const key = f.name.trim().toLowerCase();
    if (foods.length >= MAX_RESULTS || foods.some((x) => x.id === f.id) || seenNames.has(key)) return;
    seenNames.add(key);
    foods.push(f);
  };

  if (isFatSecretConfigured()) {
    for (const r of await searchFatSecret(q)) {
      if (foods.length >= MAX_RESULTS) break;
      const saved = await prisma.foodItem.upsert({
        where: { source_externalId: { source: 'fatsecret', externalId: r.externalId } },
        update: { name: r.name, per100: r.per100 as object, barcode: r.barcode },
        create: { source: 'fatsecret', externalId: r.externalId, name: r.name, per100: r.per100 as object, barcode: r.barcode },
        select: { id: true, name: true, barcode: true, per100: true },
      });
      pushFood({ ...saved, per100: saved.per100 as unknown as Macros });
    }
  }

  const local = await prisma.foodItem.findMany({
    where: { name: { contains: q, mode: 'insensitive' } },
    take: 25,
    orderBy: { createdAt: 'desc' },
  });
  for (const f of local) pushFood({ ...f, per100: f.per100 as unknown as Macros });

  if (foods.length < MAX_RESULTS) {
    for (const r of await searchOpenFoodFacts(q)) {
      if (foods.length >= MAX_RESULTS) break;
      const saved = await prisma.foodItem.upsert({
        where: { source_externalId: { source: 'openfoodfacts', externalId: r.externalId } },
        update: { name: r.name, per100: r.per100 as object, barcode: r.barcode },
        create: { source: 'openfoodfacts', externalId: r.externalId, name: r.name, per100: r.per100 as object, barcode: r.barcode },
        select: { id: true, name: true, barcode: true, per100: true },
      });
      pushFood({ ...saved, per100: saved.per100 as unknown as Macros });
    }
  }
  return { foods };
}

interface MealInput {
  mealType?: string;
  grams?: number;
  name?: string;
  foodItemId?: string;
  per100?: Partial<Macros>;
  date?: string;
}
type MealResult =
  | { ok: true; id: string; name: string | null }
  | { ok: false; status: number; reason: string };

// Log a meal into a client's diary (used by the client for themselves and by a
// coach on the client's behalf). Resolves macros from a FoodItem or per-100 body.
async function logMealInternal(clientId: string, b: MealInput): Promise<MealResult> {
  const mealType = (b.mealType ?? 'snack') as MealType;
  const grams = Number(b.grams);
  const mealDate = /^\d{4}-\d{2}-\d{2}$/.test(b.date ?? '')
    ? new Date(`${b.date}T12:00:00.000Z`)
    : new Date();
  if (!MEAL_TYPES.includes(mealType) || !grams || grams <= 0) {
    return { ok: false, status: 400, reason: 'invalid_meal' };
  }

  let per100: Macros | null = null;
  let foodItemId = b.foodItemId ?? null;
  let name = b.name?.trim() || null;

  if (foodItemId) {
    const food = await prisma.foodItem.findUnique({ where: { id: foodItemId } });
    if (!food) return { ok: false, status: 404, reason: 'food_not_found' };
    per100 = food.per100 as unknown as Macros;
    name = food.name;
  } else if (b.per100) {
    per100 = {
      kcal: Number(b.per100.kcal) || 0,
      protein: Number(b.per100.protein) || 0,
      fat: Number(b.per100.fat) || 0,
      carbs: Number(b.per100.carbs) || 0,
    };
    if (name) {
      const food = await prisma.foodItem.create({
        data: { source: 'manual', name, per100: per100 as object },
        select: { id: true },
      });
      foodItemId = food.id;
    }
  }
  if (!per100) return { ok: false, status: 400, reason: 'macros_required' };

  const factor = grams / 100;
  const meal = await prisma.mealLog.create({
    data: {
      clientId,
      date: mealDate,
      mealType,
      foodItemId,
      grams,
      kcal: per100.kcal * factor,
      protein: per100.protein * factor,
      fat: per100.fat * factor,
      carbs: per100.carbs * factor,
    },
    select: { id: true },
  });
  return { ok: true, id: meal.id, name };
}

export const nutritionRoutes: FastifyPluginAsync = async (fastify) => {
  // ── Client: target & day summary ────────────────────────────────
  fastify.get('/client/nutrition/target', { preHandler: fastify.requireAuth }, async (request) => {
    return { target: await currentTarget(request.auth!.userId) };
  });

  fastify.get<{ Querystring: { date?: string } }>(
    '/client/nutrition/day',
    { preHandler: fastify.requireAuth },
    async (request) => daySummary(request.auth!.userId, request.query.date),
  );

  // Last 7 days: per-day kcal + averages vs target.
  fastify.get('/client/nutrition/week', { preHandler: fastify.requireAuth }, async (request) => {
    const clientId = request.auth!.userId;
    const target = await currentTarget(clientId);
    const days: Array<{ date: string; kcal: number; protein: number; fat: number; carbs: number }> = [];
    const now = new Date();
    for (let i = 6; i >= 0; i -= 1) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - i * 86400000);
      const { start, end } = dayRange(d.toISOString().slice(0, 10));
      const meals = await prisma.mealLog.findMany({
        where: { clientId, date: { gte: start, lt: end } },
        select: { kcal: true, protein: true, fat: true, carbs: true },
      });
      const sum = meals.reduce(
        (a, m) => ({
          kcal: a.kcal + m.kcal,
          protein: a.protein + m.protein,
          fat: a.fat + m.fat,
          carbs: a.carbs + m.carbs,
        }),
        { kcal: 0, protein: 0, fat: 0, carbs: 0 },
      );
      days.push({
        date: start.toISOString().slice(0, 10),
        kcal: Math.round(sum.kcal),
        protein: Math.round(sum.protein),
        fat: Math.round(sum.fat),
        carbs: Math.round(sum.carbs),
      });
    }
    const logged = days.filter((d) => d.kcal > 0);
    const avg = (key: 'kcal' | 'protein' | 'fat' | 'carbs') =>
      logged.length ? Math.round(logged.reduce((n, d) => n + d[key], 0) / logged.length) : 0;
    return {
      target,
      days,
      averages: { kcal: avg('kcal'), protein: avg('protein'), fat: avg('fat'), carbs: avg('carbs') },
      loggedDays: logged.length,
    };
  });

  // Stats over N days: per-day series, averages, adherence + auto insights.
  fastify.get<{ Querystring: { days?: string } }>(
    '/client/nutrition/stats',
    { preHandler: fastify.requireAuth },
    async (request) => {
      const clientId = request.auth!.userId;
      const target = await currentTarget(clientId);
      const n = Math.min(90, Math.max(7, Number(request.query.days) || 30));
      const now = new Date();
      const days: Array<{ date: string; kcal: number; protein: number; fat: number; carbs: number }> = [];
      for (let i = n - 1; i >= 0; i -= 1) {
        const d = new Date(
          Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - i * 86400000,
        );
        const { start, end } = dayRange(d.toISOString().slice(0, 10));
        const meals = await prisma.mealLog.findMany({
          where: { clientId, date: { gte: start, lt: end } },
          select: { kcal: true, protein: true, fat: true, carbs: true },
        });
        const sum = meals.reduce(
          (a, m) => ({
            kcal: a.kcal + m.kcal,
            protein: a.protein + m.protein,
            fat: a.fat + m.fat,
            carbs: a.carbs + m.carbs,
          }),
          { kcal: 0, protein: 0, fat: 0, carbs: 0 },
        );
        days.push({
          date: start.toISOString().slice(0, 10),
          kcal: Math.round(sum.kcal),
          protein: Math.round(sum.protein),
          fat: Math.round(sum.fat),
          carbs: Math.round(sum.carbs),
        });
      }

      const logged = days.filter((d) => d.kcal > 0);
      const avg = (k: 'kcal' | 'protein' | 'fat' | 'carbs') =>
        logged.length ? Math.round(logged.reduce((s, d) => s + d[k], 0) / logged.length) : 0;
      const averages = { kcal: avg('kcal'), protein: avg('protein'), fat: avg('fat'), carbs: avg('carbs') };

      // Days whose kcal fell within ±10% of the goal.
      let inGoal = 0;
      if (target?.kcal) {
        const lo = target.kcal * 0.9;
        const hi = target.kcal * 1.1;
        inGoal = logged.filter((d) => d.kcal >= lo && d.kcal <= hi).length;
      }
      const adherencePct = logged.length ? Math.round((inGoal / logged.length) * 100) : 0;

      const insights = buildInsights({ target, logged: logged.length, averages, adherencePct, days });
      return { days, averages, loggedDays: logged.length, totalDays: n, adherencePct, insights };
    },
  );

  // ── Client: log a meal ──────────────────────────────────────────
  fastify.post<{
    Body: {
      mealType?: string;
      grams?: number;
      name?: string;
      foodItemId?: string;
      per100?: Partial<Macros>;
      date?: string;
    };
  }>('/client/nutrition/meals', { preHandler: fastify.requireAuth }, async (request, reply) => {
    const res = await logMealInternal(request.auth!.userId, request.body ?? {});
    if (!res.ok) {
      reply.code(res.status).send({ error: 'bad_request', reason: res.reason });
      return;
    }
    return { ok: true, id: res.id, name: res.name };
  });

  // Edit a logged meal: change grams (macros recomputed from the stored
  // per-portion) and/or the meal type.
  fastify.patch<{ Params: { id: string }; Body: { grams?: number; mealType?: string } }>(
    '/client/nutrition/meals/:id',
    { preHandler: fastify.requireAuth },
    async (request, reply) => {
      const auth = request.auth!;
      const meal = await prisma.mealLog.findUnique({ where: { id: request.params.id } });
      if (!meal || meal.clientId !== auth.userId) {
        reply.code(404).send({ error: 'not_found' });
        return;
      }
      const b = request.body ?? {};
      const grams = b.grams != null ? Number(b.grams) : meal.grams;
      const mealType =
        b.mealType && MEAL_TYPES.includes(b.mealType as MealType)
          ? (b.mealType as MealType)
          : meal.mealType;
      if (!grams || grams <= 0 || meal.grams <= 0) {
        reply.code(400).send({ error: 'bad_request', reason: 'invalid_grams' });
        return;
      }
      // Per-100g reconstructed from the originally logged macros.
      const per100 = {
        kcal: (meal.kcal / meal.grams) * 100,
        protein: (meal.protein / meal.grams) * 100,
        fat: (meal.fat / meal.grams) * 100,
        carbs: (meal.carbs / meal.grams) * 100,
      };
      const f = grams / 100;
      await prisma.mealLog.update({
        where: { id: meal.id },
        data: {
          grams,
          mealType,
          kcal: per100.kcal * f,
          protein: per100.protein * f,
          fat: per100.fat * f,
          carbs: per100.carbs * f,
        },
      });
      return { ok: true };
    },
  );

  fastify.delete<{ Params: { id: string } }>(
    '/client/nutrition/meals/:id',
    { preHandler: fastify.requireAuth },
    async (request, reply) => {
      const auth = request.auth!;
      const meal = await prisma.mealLog.findUnique({
        where: { id: request.params.id },
        select: { clientId: true },
      });
      if (!meal || meal.clientId !== auth.userId) {
        reply.code(404).send({ error: 'not_found' });
        return;
      }
      await prisma.mealLog.delete({ where: { id: request.params.id } });
      return { ok: true };
    },
  );

  // ── Client: food search & barcode (local cache + Open Food Facts) ─
  fastify.get<{ Querystring: { q?: string } }>(
    '/client/nutrition/foods/search',
    { preHandler: fastify.requireAuth },
    async (request) => searchFoodsInternal((request.query.q ?? '').trim()),
  );

  fastify.get<{ Params: { code: string } }>(
    '/client/nutrition/foods/barcode/:code',
    { preHandler: fastify.requireAuth },
    async (request, reply) => {
      const code = request.params.code.replace(/[^0-9]/g, '');
      if (!code) {
        reply.code(400).send({ error: 'bad_request', reason: 'invalid_barcode' });
        return;
      }
      // Cached?
      const cached = await prisma.foodItem.findFirst({ where: { barcode: code } });
      if (cached) {
        return { food: { id: cached.id, name: cached.name, barcode: cached.barcode, per100: cached.per100 as unknown as Macros } };
      }
      const hit = await lookupBarcode(code);
      if (!hit) {
        reply.code(404).send({ error: 'not_found', reason: 'barcode_not_found' });
        return;
      }
      const saved = await prisma.foodItem.upsert({
        where: { source_externalId: { source: 'openfoodfacts', externalId: hit.externalId } },
        update: { name: hit.name, per100: hit.per100 as object, barcode: hit.barcode },
        create: {
          source: 'openfoodfacts',
          externalId: hit.externalId,
          name: hit.name,
          per100: hit.per100 as object,
          barcode: hit.barcode,
        },
      });
      return { food: { id: saved.id, name: saved.name, barcode: saved.barcode, per100: saved.per100 as unknown as Macros } };
    },
  );

  // ── Coach: set target & view a client's day ─────────────────────
  fastify.post<{
    Params: { id: string };
    Body: { kcal?: number; protein?: number; fat?: number; carbs?: number };
  }>('/coach/clients/:id/nutrition-target', { preHandler: fastify.requireAuth }, async (request, reply) => {
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
    const b = request.body ?? {};
    const kcal = Math.round(Number(b.kcal));
    if (!kcal || kcal <= 0) {
      reply.code(400).send({ error: 'bad_request', reason: 'kcal_required' });
      return;
    }
    await prisma.nutritionTarget.create({
      data: {
        clientId: request.params.id,
        kcal,
        protein: Math.round(Number(b.protein) || 0),
        fat: Math.round(Number(b.fat) || 0),
        carbs: Math.round(Number(b.carbs) || 0),
      },
    });
    return { ok: true };
  });

  fastify.get<{ Params: { id: string }; Querystring: { date?: string } }>(
    '/coach/clients/:id/nutrition/day',
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
      return daySummary(request.params.id, request.query.date);
    },
  );

  // Coach-side food search (same sources as the client).
  fastify.get<{ Querystring: { q?: string } }>(
    '/coach/nutrition/foods/search',
    { preHandler: fastify.requireAuth },
    async (request, reply) => {
      if (!(await requireCoach(request, reply))) return;
      return searchFoodsInternal((request.query.q ?? '').trim());
    },
  );

  // Coach adds a product/meal to a client's diary.
  fastify.post<{ Params: { id: string }; Body: MealInput }>(
    '/coach/clients/:id/nutrition/meals',
    { preHandler: fastify.requireAuth },
    async (request, reply) => {
      if (!(await requireCoach(request, reply))) return;
      const auth = request.auth!;
      const link = await prisma.coachClient.findUnique({
        where: { coachId_clientId: { coachId: auth.userId, clientId: request.params.id } },
        select: { status: true },
      });
      if (!link) {
        reply.code(404).send({ error: 'not_found' });
        return;
      }
      const res = await logMealInternal(request.params.id, request.body ?? {});
      if (!res.ok) {
        reply.code(res.status).send({ error: 'bad_request', reason: res.reason });
        return;
      }
      return { ok: true, id: res.id, name: res.name };
    },
  );

  // Coach removes a meal from a client's diary.
  fastify.delete<{ Params: { id: string; mealId: string } }>(
    '/coach/clients/:id/nutrition/meals/:mealId',
    { preHandler: fastify.requireAuth },
    async (request, reply) => {
      if (!(await requireCoach(request, reply))) return;
      const auth = request.auth!;
      const link = await prisma.coachClient.findUnique({
        where: { coachId_clientId: { coachId: auth.userId, clientId: request.params.id } },
        select: { status: true },
      });
      if (!link) {
        reply.code(404).send({ error: 'not_found' });
        return;
      }
      const meal = await prisma.mealLog.findUnique({
        where: { id: request.params.mealId },
        select: { clientId: true },
      });
      if (!meal || meal.clientId !== request.params.id) {
        reply.code(404).send({ error: 'not_found', reason: 'meal_not_found' });
        return;
      }
      await prisma.mealLog.delete({ where: { id: request.params.mealId } });
      return { ok: true };
    },
  );

  // ── Meal plan (coach authors, client tracks) ──────────────────────

  async function coachOwnsClient(coachId: string, clientId: string): Promise<boolean> {
    const link = await prisma.coachClient.findUnique({
      where: { coachId_clientId: { coachId, clientId } },
      select: { status: true },
    });
    return Boolean(link);
  }

  // Coach: read a client's plan for a day.
  fastify.get<{ Params: { id: string }; Querystring: { date?: string } }>(
    '/coach/clients/:id/meal-plan',
    { preHandler: fastify.requireAuth },
    async (request, reply) => {
      if (!(await requireCoach(request, reply))) return;
      if (!(await coachOwnsClient(request.auth!.userId, request.params.id))) {
        reply.code(404).send({ error: 'not_found' });
        return;
      }
      const { start } = dayRange(request.query.date);
      const plan = await prisma.mealPlan.findUnique({
        where: { clientId_date: { clientId: request.params.id, date: start } },
        include: { items: true },
      });
      return { plan: plan ? serializePlan(plan) : null };
    },
  );

  // Coach: upsert a client's plan for a day (replaces items, resets tracking).
  fastify.put<{
    Params: { id: string };
    Body: { date?: string; note?: string | null; items?: PlanItemInput[] };
  }>('/coach/clients/:id/meal-plan', { preHandler: fastify.requireAuth }, async (request, reply) => {
    if (!(await requireCoach(request, reply))) return;
    const coachId = request.auth!.userId;
    if (!(await coachOwnsClient(coachId, request.params.id))) {
      reply.code(404).send({ error: 'not_found' });
      return;
    }
    const body = request.body ?? {};
    const items = (body.items ?? []).filter((it) => it?.title?.trim() && MEAL_TYPES.includes(it.mealType));
    const { start } = dayRange(body.date);
    const num = (v: unknown) => (v != null && Number.isFinite(Number(v)) ? Math.round(Number(v)) : null);

    const plan = await prisma.mealPlan.upsert({
      where: { clientId_date: { clientId: request.params.id, date: start } },
      create: { clientId: request.params.id, coachId, date: start, note: body.note?.trim() || null },
      update: { note: body.note?.trim() || null },
      select: { id: true },
    });
    await prisma.mealPlanItem.deleteMany({ where: { planId: plan.id } });
    if (items.length) {
      await prisma.mealPlanItem.createMany({
        data: items.map((it, i) => ({
          planId: plan.id,
          mealType: it.mealType,
          order: i,
          title: it.title.trim(),
          grams: it.grams != null && Number.isFinite(Number(it.grams)) ? Number(it.grams) : null,
          kcal: num(it.kcal),
          protein: num(it.protein),
          fat: num(it.fat),
          carbs: num(it.carbs),
        })),
      });
    }
    await notifyUser(
      request.params.id,
      `🍽 Тренер составил план питания на ${start.toISOString().slice(0, 10)}`,
      { type: 'nutrition' },
    );
    const full = await prisma.mealPlan.findUnique({ where: { id: plan.id }, include: { items: true } });
    return { ok: true, plan: full ? serializePlan(full) : null };
  });

  // Client: read own plan for a day.
  fastify.get<{ Querystring: { date?: string } }>(
    '/client/meal-plan',
    { preHandler: fastify.requireAuth },
    async (request) => {
      const { start } = dayRange(request.query.date);
      const plan = await prisma.mealPlan.findUnique({
        where: { clientId_date: { clientId: request.auth!.userId, date: start } },
        include: { items: true },
      });
      return { plan: plan ? serializePlan(plan) : null };
    },
  );

  // Client owns a plan item?
  async function itemOwnedBy(itemId: string, clientId: string) {
    const item = await prisma.mealPlanItem.findUnique({
      where: { id: itemId },
      include: { plan: { select: { clientId: true } } },
    });
    return item && item.plan.clientId === clientId ? item : null;
  }

  // Client: tick an item done / undone.
  fastify.post<{ Params: { itemId: string } }>(
    '/client/meal-plan/items/:itemId/toggle',
    { preHandler: fastify.requireAuth },
    async (request, reply) => {
      const item = await itemOwnedBy(request.params.itemId, request.auth!.userId);
      if (!item) {
        reply.code(404).send({ error: 'not_found' });
        return;
      }
      const done = !item.done;
      await prisma.mealPlanItem.update({
        where: { id: item.id },
        data: { done, doneAt: done ? new Date() : null },
      });
      return { ok: true, done };
    },
  );

  // Client: presign a photo-report upload for an item.
  fastify.post<{ Params: { itemId: string }; Body: { ext?: string } }>(
    '/client/meal-plan/items/:itemId/photo/presign',
    { preHandler: fastify.requireAuth },
    async (request, reply) => {
      const userId = request.auth!.userId;
      const item = await itemOwnedBy(request.params.itemId, userId);
      if (!item) {
        reply.code(404).send({ error: 'not_found' });
        return;
      }
      if (!isStorageConfigured()) {
        reply.code(503).send({ error: 'storage_unconfigured' });
        return;
      }
      const ext = (request.body?.ext ?? 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
      const fileKey = `mealplan/${userId}/${request.params.itemId}-${Date.now()}-${randomBytes(4).toString('hex')}.${ext}`;
      const uploadUrl = presign('PUT', fileKey, 900);
      return { uploadUrl, fileKey };
    },
  );

  // Client: confirm the uploaded photo report.
  fastify.post<{ Params: { itemId: string }; Body: { fileKey?: string } }>(
    '/client/meal-plan/items/:itemId/photo',
    { preHandler: fastify.requireAuth },
    async (request, reply) => {
      const userId = request.auth!.userId;
      const item = await itemOwnedBy(request.params.itemId, userId);
      if (!item) {
        reply.code(404).send({ error: 'not_found' });
        return;
      }
      const fileKey = request.body?.fileKey;
      if (!fileKey || !fileKey.startsWith(`mealplan/${userId}/`)) {
        reply.code(400).send({ error: 'bad_request', reason: 'invalid_key' });
        return;
      }
      await prisma.mealPlanItem.update({
        where: { id: item.id },
        data: { photoKey: fileKey, done: true, doneAt: item.doneAt ?? new Date() },
      });
      return { ok: true, photoUrl: isStorageConfigured() ? presign('GET', fileKey, 3600) : null };
    },
  );
};
