// Centralized, validated environment access for the API service.
// Fails fast on boot if a required variable is missing.

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return v;
}

function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

function toInt(value: string, name: string): number {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) {
    throw new Error(`Environment variable ${name} must be an integer, got: ${value}`);
  }
  return n;
}

export const env = {
  nodeEnv: optional('NODE_ENV', 'development'),
  host: optional('API_HOST', '0.0.0.0'),
  port: toInt(optional('API_PORT', '3000'), 'API_PORT'),

  botToken: required('BOT_TOKEN'),
  // Bot username (without @) — used to build invite deep-links.
  botUsername: optional('BOT_USERNAME', '').replace(/^@/, ''),
  initDataTtlSeconds: toInt(optional('INITDATA_TTL_SECONDS', '86400'), 'INITDATA_TTL_SECONDS'),

  corsOrigins: optional('CORS_ORIGINS', 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  healthModuleEnabled: optional('HEALTH_MODULE_ENABLED', 'false') === 'true',
  // 32-byte key (hex or base64) for AES-256-GCM encryption of sensitive health
  // fields. Required when the health module is enabled.
  healthEncryptionKey: optional('HEALTH_ENCRYPTION_KEY', ''),
  platformFeePercent: Number(optional('PLATFORM_FEE_PERCENT', '10')),

  // If set, the API also serves the built Mini App static files from this
  // directory (single-origin mode — used by the Cloudflare tunnel demo stack).
  miniappDist: process.env.MINIAPP_DIST ?? '',

  // Mount the Telegram webhook route in-process (serverless deploy: one Cloud
  // Function serves both /api and /telegram/webhook). Off by default so the
  // standalone bot service and local dev/tests don't double-handle updates.
  enableTelegramWebhook: optional('ENABLE_TELEGRAM_WEBHOOK', 'false') === 'true',

  // Telegram IDs auto-promoted to coach on login (owner bootstrap until the
  // Phase-1 onboarding flow exists).
  ownerTelegramIds: optional('OWNER_TELEGRAM_IDS', '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  // Object Storage (Yandex, S3-compatible) for user uploads (progress photos,
  // technique videos). Presigned PUT/GET URLs are generated in-process.
  s3: {
    endpoint: optional('S3_ENDPOINT', 'https://storage.yandexcloud.net').replace(/\/+$/, ''),
    bucket: optional('S3_BUCKET', ''),
    region: optional('S3_REGION', 'ru-central1'),
    accessKeyId: optional('S3_KEY', ''),
    secretAccessKey: optional('S3_SECRET', ''),
  },
} as const;

export type Env = typeof env;
