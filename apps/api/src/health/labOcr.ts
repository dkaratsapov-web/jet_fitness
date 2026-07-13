// Lab-analysis recognition — Yandex Vision OCR + YandexGPT. Everything runs
// inside Yandex Cloud (RF), so sensitive medical data never leaves the country
// (152-ФЗ). The Cloud Function authenticates with its own service-account IAM
// token, fetched from the instance metadata service (no secret to manage). The
// service account must hold roles `ai.vision.user` and `ai.languageModels.user`
// and the folder id must be provided via YANDEX_FOLDER_ID.
//
// Flow: recognizeTextAsync → poll getRecognition → concatenate page text →
// YandexGPT structures it into lab markers. Best-effort: any failure surfaces a
// clear reason and the client can still enter results by hand.

import { env } from '../env.js';

const METADATA_TOKEN_URL =
  'http://169.254.169.254/computeMetadata/v1/instance/service-accounts/default/token';
const OCR_ASYNC_URL = 'https://ocr.api.cloud.yandex.net/ocr/v1/recognizeTextAsync';
const OCR_RESULT_URL = 'https://ocr.api.cloud.yandex.net/ocr/v1/getRecognition';
const GPT_URL = 'https://llm.api.cloud.yandex.net/foundationModels/v1/completion';

export function isLabOcrConfigured(): boolean {
  return Boolean(env.yandexFolderId);
}

export interface LabMarker {
  marker: string;
  value: number;
  unit: string | null;
  refLow: number | null;
  refHigh: number | null;
}

async function fetchJson(url: string, init: RequestInit, timeoutMs = 8000): Promise<any | null> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

// ── IAM token from the metadata service (cached) ────────────────────
let cachedIam: { value: string; expiresAt: number } | null = null;

async function iamToken(): Promise<string | null> {
  if (cachedIam && cachedIam.expiresAt > Date.now() + 60_000) return cachedIam.value;
  const json = await fetchJson(
    METADATA_TOKEN_URL,
    { headers: { 'Metadata-Flavor': 'Google' } },
    3000,
  );
  if (!json?.access_token) return null;
  cachedIam = {
    value: json.access_token,
    expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
  };
  return cachedIam.value;
}

function mimeFor(ext: string): string | null {
  const e = ext.toLowerCase();
  if (e === 'pdf') return 'application/pdf';
  if (e === 'png') return 'image/png';
  if (e === 'jpg' || e === 'jpeg') return 'image/jpeg';
  return null;
}

// ── OCR (async: submit → poll) ──────────────────────────────────────
async function recognizeText(base64: string, mime: string): Promise<string | null> {
  const iam = await iamToken();
  if (!iam || !env.yandexFolderId) return null;
  const headers = {
    Authorization: `Bearer ${iam}`,
    'x-folder-id': env.yandexFolderId,
    'x-data-logging-enabled': 'false',
    'Content-Type': 'application/json',
  };
  const submit = await fetchJson(OCR_ASYNC_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      mimeType: mime,
      languageCodes: ['ru', 'en'],
      model: 'page',
      content: base64,
    }),
  });
  const operationId: string | undefined = submit?.id;
  if (!operationId) return null;

  // Poll the operation for up to ~24s.
  for (let i = 0; i < 12; i += 1) {
    await new Promise((r) => setTimeout(r, 2000));
    const done = await fetchJson(
      `${OCR_RESULT_URL}?operationId=${encodeURIComponent(operationId)}`,
      { headers },
    );
    // getRecognition returns one result per page; the gateway may return an
    // array or newline-delimited objects normalized to { result }.
    const pages: any[] = Array.isArray(done) ? done : done ? [done] : [];
    const texts = pages
      .map((p) => p?.result?.textAnnotation?.fullText)
      .filter((s): s is string => typeof s === 'string' && s.length > 0);
    if (texts.length > 0) return texts.join('\n');
  }
  return null;
}

// ── Structure the OCR text into markers via YandexGPT ───────────────
const SYSTEM_PROMPT =
  'Ты — помощник, который извлекает показатели лабораторных анализов из текста. ' +
  'Верни СТРОГО JSON-массив без пояснений. Каждый элемент: ' +
  '{"marker": строка (название показателя по-русски), "value": число, ' +
  '"unit": строка или null, "refLow": число или null, "refHigh": число или null}. ' +
  'Бери только числовые показатели с значением. Референсный интервал вида "4.0-5.5" ' +
  'разложи в refLow/refHigh. Если данных нет — пустой массив [].';

function extractJsonArray(text: string): LabMarker[] {
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start < 0 || end <= start) return [];
  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    if (!Array.isArray(parsed)) return [];
    const out: LabMarker[] = [];
    for (const m of parsed) {
      const value = Number(m?.value);
      const marker = String(m?.marker ?? '').trim();
      if (!marker || !Number.isFinite(value)) continue;
      out.push({
        marker: marker.slice(0, 120),
        value,
        unit: m?.unit ? String(m.unit).slice(0, 32) : null,
        refLow: Number.isFinite(Number(m?.refLow)) ? Number(m.refLow) : null,
        refHigh: Number.isFinite(Number(m?.refHigh)) ? Number(m.refHigh) : null,
      });
    }
    return out.slice(0, 100);
  } catch {
    return [];
  }
}

async function structureMarkers(ocrText: string): Promise<LabMarker[]> {
  const iam = await iamToken();
  if (!iam || !env.yandexFolderId) return [];
  const json = await fetchJson(
    GPT_URL,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${iam}`,
        'x-folder-id': env.yandexFolderId,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        modelUri: `gpt://${env.yandexFolderId}/yandexgpt/latest`,
        completionOptions: { stream: false, temperature: 0, maxTokens: '2000' },
        messages: [
          { role: 'system', text: SYSTEM_PROMPT },
          { role: 'user', text: ocrText.slice(0, 12000) },
        ],
      }),
    },
    20000,
  );
  const text: string | undefined = json?.result?.alternatives?.[0]?.message?.text;
  return text ? extractJsonArray(text) : [];
}

export interface LabRecognitionResult {
  ok: boolean;
  markers: LabMarker[];
  reason?: string;
}

/** Recognize lab markers from a file's bytes. `ext` drives the MIME type. */
export async function recognizeLab(bytes: Buffer, ext: string): Promise<LabRecognitionResult> {
  if (!isLabOcrConfigured()) return { ok: false, markers: [], reason: 'ocr_not_configured' };
  const mime = mimeFor(ext);
  if (!mime) return { ok: false, markers: [], reason: 'unsupported_format' };
  const text = await recognizeText(bytes.toString('base64'), mime);
  if (!text) return { ok: false, markers: [], reason: 'ocr_failed' };
  const markers = await structureMarkers(text);
  return { ok: true, markers };
}
