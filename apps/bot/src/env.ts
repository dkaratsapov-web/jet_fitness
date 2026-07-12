// Environment access for the bot service.

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable: ${name}`);
  return v;
}

function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

export const env = {
  nodeEnv: optional('NODE_ENV', 'development'),
  botToken: required('BOT_TOKEN'),
  // If set, run in webhook mode; otherwise long polling (convenient for local dev).
  webhookUrl: process.env.WEBHOOK_URL ?? '',
  webhookSecret: process.env.BOT_WEBHOOK_SECRET ?? '',
  // Public HTTPS URL of the Mini App, used to build the web_app launch button.
  miniAppUrl: optional('MINIAPP_URL', ''),
  // Port for the webhook HTTP server (webhook mode only).
  botPort: Number(optional('BOT_PORT', '3001')),
} as const;
