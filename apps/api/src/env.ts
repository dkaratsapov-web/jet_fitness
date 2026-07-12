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
  initDataTtlSeconds: toInt(optional('INITDATA_TTL_SECONDS', '86400'), 'INITDATA_TTL_SECONDS'),

  corsOrigins: optional('CORS_ORIGINS', 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  healthModuleEnabled: optional('HEALTH_MODULE_ENABLED', 'false') === 'true',
  platformFeePercent: Number(optional('PLATFORM_FEE_PERCENT', '10')),

  // If set, the API also serves the built Mini App static files from this
  // directory (single-origin mode — used by the Cloudflare tunnel demo stack).
  miniappDist: process.env.MINIAPP_DIST ?? '',
} as const;

export type Env = typeof env;
