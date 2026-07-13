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
  type FoodHit,
} from '../nutritionSources.js';
import { searchFatSecret, isFatSecretConfigured } from '../nutrition/fatsecret.js';

const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

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
  return t ? { kcal: t.kcal, protein: t.protein, fat: t.fat, carbs: t.carbs } : null;
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

  // ── Client: log a meal ──────────────────────────────────────────
  fastify.post<{
    Body: {
      mealType?: string;
      grams?: number;
      name?: string;
      foodItemId?: string;
      per100?: Partial<Macros>;
    };
  }>('/client/nutrition/meals', { preHandler: fastify.requireAuth }, async (request, reply) => {
    const auth = request.auth!;
    const b = request.body ?? {};
    const mealType = (b.mealType ?? 'snack') as MealType;
    const grams = Number(b.grams);
    if (!MEAL_TYPES.includes(mealType) || !grams || grams <= 0) {
      reply.code(400).send({ error: 'bad_request', reason: 'invalid_meal' });
      return;
    }

    // Resolve per-100g macros: from a saved FoodItem or from the request body.
    let per100: Macros | null = null;
    let foodItemId = b.foodItemId ?? null;
    let name = b.name?.trim() || null;

    if (foodItemId) {
      const food = await prisma.foodItem.findUnique({ where: { id: foodItemId } });
      if (!food) {
        reply.code(404).send({ error: 'not_found', reason: 'food_not_found' });
        return;
      }
      per100 = food.per100 as unknown as Macros;
      name = food.name;
    } else if (b.per100) {
      per100 = {
        kcal: Number(b.per100.kcal) || 0,
        protein: Number(b.per100.protein) || 0,
        fat: Number(b.per100.fat) || 0,
        carbs: Number(b.per100.carbs) || 0,
      };
      // Persist ad-hoc foods so they can be reused later.
      if (name) {
        const food = await prisma.foodItem.create({
          data: { source: 'manual', name, per100: per100 as object },
          select: { id: true },
        });
        foodItemId = food.id;
      }
    }

    if (!per100) {
      reply.code(400).send({ error: 'bad_request', reason: 'macros_required' });
      return;
    }

    const factor = grams / 100;
    const meal = await prisma.mealLog.create({
      data: {
        clientId: auth.userId,
        date: new Date(),
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
  });

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
    async (request) => {
      const q = (request.query.q ?? '').trim();
      if (q.length < 2) return { foods: [] };

      // Local cache first (instant, offline-friendly).
      const local = await prisma.foodItem.findMany({
        where: { name: { contains: q, mode: 'insensitive' } },
        take: 10,
        orderBy: { createdAt: 'desc' },
      });
      const foods = local.map((f) => ({
        id: f.id,
        name: f.name,
        barcode: f.barcode,
        per100: f.per100 as unknown as Macros,
      }));

      // Remote providers (best-effort; cache new hits). Prefer FatSecret when
      // configured — its data is richer — then fall back to Open Food Facts.
      const providers: Array<{ source: string; hits: FoodHit[] }> = [];
      if (isFatSecretConfigured()) {
        providers.push({ source: 'fatsecret', hits: await searchFatSecret(q) });
      }
      providers.push({ source: 'openfoodfacts', hits: await searchOpenFoodFacts(q) });

      for (const provider of providers) {
        for (const r of provider.hits) {
          if (foods.length >= 15) break;
          const saved = await prisma.foodItem.upsert({
            where: { source_externalId: { source: provider.source, externalId: r.externalId } },
            update: { name: r.name, per100: r.per100 as object, barcode: r.barcode },
            create: {
              source: provider.source,
              externalId: r.externalId,
              name: r.name,
              per100: r.per100 as object,
              barcode: r.barcode,
            },
            select: { id: true, name: true, barcode: true, per100: true },
          });
          if (!foods.some((f) => f.id === saved.id)) {
            foods.push({
              id: saved.id,
              name: saved.name,
              barcode: saved.barcode,
              per100: saved.per100 as unknown as Macros,
            });
          }
        }
      }
      return { foods };
    },
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
};
