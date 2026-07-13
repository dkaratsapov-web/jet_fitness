// FatSecret Platform API integration (nutrition database).
//
// Auth: OAuth 2.0 client credentials — POST to the token endpoint with the
// Client ID/Secret, cache the bearer token until it expires. Search: POST
// method=foods.search to the REST endpoint. Results carry a `food_description`
// like "Per 100g - Calories: 52kcal | Fat: 0.17g | Carbs: 13.81g | Protein:
// 0.26g"; we parse it and normalize gram/millilitre servings to per-100g so it
// slots into the app's existing per100 model.
//
// Everything is best-effort: any failure returns empty so the caller falls back
// to Open Food Facts and manual entry keeps working.
//
// IMPORTANT: FatSecret enforces source-IP whitelisting. The API's egress IP
// must be registered in the FatSecret account or every call is rejected.

import { env } from '../env.js';
import type { FoodHit, Macros } from '../nutritionSources.js';

const TOKEN_URL = 'https://oauth.fatsecret.com/connect/token';
const REST_URL = 'https://platform.fatsecret.com/rest/server.api';
const TIMEOUT_MS = 4500;

export function isFatSecretConfigured(): boolean {
  return Boolean(env.fatSecretClientId && env.fatSecretClientSecret);
}

// ── Token cache (in-memory; fine per warm serverless instance) ──────
let cachedToken: { value: string; expiresAt: number } | null = null;

async function getToken(): Promise<string | null> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value;
  }
  const basic = Buffer.from(
    `${env.fatSecretClientId}:${env.fatSecretClientSecret}`,
  ).toString('base64');
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    scope: env.fatSecretScope || 'basic',
  });
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!json.access_token) return null;
    const ttlMs = (json.expires_in ?? 86400) * 1000;
    cachedToken = { value: json.access_token, expiresAt: Date.now() + ttlMs };
    return cachedToken.value;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

// ── Parse "Per 100g - Calories: 52kcal | Fat: .. | Carbs: .. | Protein: .." ──
interface ParsedDescription {
  amount: number;
  unit: string;
  macros: Macros;
}

function parseDescription(desc: string): ParsedDescription | null {
  const head = desc.match(/Per\s+([\d.]+)\s*([a-zA-Zа-яА-Я]*)/);
  const kcal = desc.match(/Calories:\s*([\d.]+)\s*kcal/i);
  const fat = desc.match(/Fat:\s*([\d.]+)\s*g/i);
  const carbs = desc.match(/Carbs:\s*([\d.]+)\s*g/i);
  const protein = desc.match(/Protein:\s*([\d.]+)\s*g/i);
  if (!head || !kcal) return null;
  return {
    amount: Number(head[1]) || 0,
    unit: (head[2] || '').toLowerCase(),
    macros: {
      kcal: Number(kcal[1]) || 0,
      fat: fat ? Number(fat[1]) || 0 : 0,
      carbs: carbs ? Number(carbs[1]) || 0 : 0,
      protein: protein ? Number(protein[1]) || 0 : 0,
    },
  };
}

// Normalize to per-100g when the serving is a gram/millilitre amount. Non-mass
// servings (a piece, a cup) can't be converted without a gram weight, so they
// are dropped to keep the per100 model honest.
function toPer100(parsed: ParsedDescription): Macros | null {
  const gramUnits = new Set(['g', 'г', 'ml', 'мл']);
  if (!gramUnits.has(parsed.unit) || parsed.amount <= 0) return null;
  const factor = 100 / parsed.amount;
  const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;
  return {
    kcal: Math.round(parsed.macros.kcal * factor),
    protein: round(parsed.macros.protein * factor),
    fat: round(parsed.macros.fat * factor),
    carbs: round(parsed.macros.carbs * factor),
  };
}

// ── Diagnostics (owner panel) ───────────────────────────────────────
// Probes the token endpoint and a sample search, surfacing the HTTP status so
// the owner can tell "bad keys" from "IP not whitelisted". Also reports the
// function's egress IP — the address to add in FatSecret's IP Restrictions.
export interface FatSecretDiagnostics {
  configured: boolean;
  tokenOk: boolean;
  tokenStatus: number | null;
  sampleCount: number;
  egressIp: string | null;
  hint: string;
}

async function egressIp(): Promise<string | null> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 3500);
  try {
    const res = await fetch('https://api.ipify.org?format=json', { signal: controller.signal });
    if (!res.ok) return null;
    const j = (await res.json()) as { ip?: string };
    return j.ip ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export async function fatSecretDiagnostics(): Promise<FatSecretDiagnostics> {
  const ip = await egressIp();
  if (!isFatSecretConfigured()) {
    return {
      configured: false,
      tokenOk: false,
      tokenStatus: null,
      sampleCount: 0,
      egressIp: ip,
      hint: 'Ключи FatSecret не заданы (FATSECRET_CLIENT_ID/SECRET).',
    };
  }
  // Direct token probe to capture the HTTP status.
  const basic = Buffer.from(
    `${env.fatSecretClientId}:${env.fatSecretClientSecret}`,
  ).toString('base64');
  let tokenStatus: number | null = null;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        scope: env.fatSecretScope || 'basic',
      }),
    });
    tokenStatus = res.status;
  } catch {
    tokenStatus = null;
  } finally {
    clearTimeout(t);
  }

  const token = tokenStatus === 200 ? await getToken() : null;
  const hits = token ? await searchFatSecret('milk') : [];

  let hint: string;
  if (tokenStatus === 200 && hits.length > 0) {
    hint = 'FatSecret подключён и отвечает ✅';
  } else if (tokenStatus === 200) {
    hint = 'Токен получен, но поиск пуст — вероятно, egress-IP не в whitelist FatSecret.';
  } else if (tokenStatus === 401 || tokenStatus === 400) {
    hint = 'Токен отклонён (401/400) — проверьте Client ID/Secret.';
  } else if (tokenStatus === 403) {
    hint = 'Доступ запрещён (403) — добавьте egress-IP ниже в FatSecret → IP Restrictions.';
  } else {
    hint = `Не удалось связаться с FatSecret (статус ${tokenStatus ?? 'таймаут'}).`;
  }

  return {
    configured: true,
    tokenOk: tokenStatus === 200,
    tokenStatus,
    sampleCount: hits.length,
    egressIp: ip,
    hint,
  };
}

interface FsFood {
  food_id?: string;
  food_name?: string;
  brand_name?: string;
  food_description?: string;
}

export async function searchFatSecret(query: string): Promise<FoodHit[]> {
  if (!isFatSecretConfigured()) return [];
  const token = await getToken();
  if (!token) return [];

  const params = new URLSearchParams({
    method: 'foods.search',
    search_expression: query,
    format: 'json',
    max_results: '15',
  });
  if (env.fatSecretRegion) params.set('region', env.fatSecretRegion);
  if (env.fatSecretLanguage) params.set('language', env.fatSecretLanguage);

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    // Method-based integration: POST to /rest/server.api with the parameters in
    // the form-urlencoded body (per FatSecret's docs), Bearer token in header.
    const res = await fetch(REST_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { foods?: { food?: FsFood | FsFood[] } };
    const raw = json.foods?.food;
    const list: FsFood[] = Array.isArray(raw) ? raw : raw ? [raw] : [];
    const hits: FoodHit[] = [];
    for (const f of list) {
      if (!f.food_id || !f.food_name || !f.food_description) continue;
      const parsed = parseDescription(f.food_description);
      if (!parsed) continue;
      const per100 = toPer100(parsed);
      if (!per100) continue;
      const name = f.brand_name ? `${f.food_name} (${f.brand_name})` : f.food_name;
      hits.push({ externalId: f.food_id, name: name.trim(), barcode: null, per100 });
    }
    return hits;
  } catch {
    return [];
  } finally {
    clearTimeout(t);
  }
}
