// Open Food Facts integration (spec §7.4). Best-effort: any failure returns
// empty/null so manual entry always remains a working fallback.

export interface Macros {
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
}

export interface FoodHit {
  externalId: string; // OFF product code
  name: string;
  barcode: string | null;
  per100: Macros;
}

const OFF_BASE = 'https://world.openfoodfacts.org';
const UA = 'JetFitness/1.0 (Telegram coaching platform)';
const TIMEOUT_MS = 4000;

async function offFetch(url: string): Promise<unknown | null> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': UA, Accept: 'application/json' },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

interface OffNutriments {
  ['energy-kcal_100g']?: number;
  ['energy_100g']?: number;
  proteins_100g?: number;
  fat_100g?: number;
  carbohydrates_100g?: number;
}

interface OffProduct {
  code?: string;
  product_name?: string;
  product_name_ru?: string;
  nutriments?: OffNutriments;
}

function toMacros(n: OffNutriments | undefined): Macros | null {
  if (!n) return null;
  let kcal = Number(n['energy-kcal_100g']);
  if (!Number.isFinite(kcal) && Number.isFinite(Number(n.energy_100g))) {
    kcal = Number(n.energy_100g) / 4.184; // kJ → kcal
  }
  const protein = Number(n.proteins_100g) || 0;
  const fat = Number(n.fat_100g) || 0;
  const carbs = Number(n.carbohydrates_100g) || 0;
  if (!Number.isFinite(kcal) || kcal <= 0) return null;
  return {
    kcal: Math.round(kcal),
    protein: Math.round(protein * 10) / 10,
    fat: Math.round(fat * 10) / 10,
    carbs: Math.round(carbs * 10) / 10,
  };
}

function toHit(p: OffProduct): FoodHit | null {
  const name = (p.product_name_ru || p.product_name || '').trim();
  const per100 = toMacros(p.nutriments);
  if (!name || !per100 || !p.code) return null;
  return { externalId: p.code, name, barcode: p.code, per100 };
}

export async function lookupBarcode(code: string): Promise<FoodHit | null> {
  const data = (await offFetch(
    `${OFF_BASE}/api/v2/product/${encodeURIComponent(code)}.json?fields=code,product_name,product_name_ru,nutriments`,
  )) as { status?: number; product?: OffProduct } | null;
  if (!data || data.status !== 1 || !data.product) return null;
  return toHit(data.product);
}

export async function searchOpenFoodFacts(query: string): Promise<FoodHit[]> {
  const url =
    `${OFF_BASE}/cgi/search.pl?search_terms=${encodeURIComponent(query)}` +
    `&search_simple=1&action=process&json=1&page_size=30` +
    `&fields=code,product_name,product_name_ru,nutriments`;
  const data = (await offFetch(url)) as { products?: OffProduct[] } | null;
  if (!data?.products) return [];
  const hits: FoodHit[] = [];
  for (const p of data.products) {
    const hit = toHit(p);
    if (hit) hits.push(hit);
  }
  return hits;
}
