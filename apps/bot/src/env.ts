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
  // Base URL for the Telegram Bot API. In RF-hosted deploys where api.telegram.org
  // is blocked, point this at the Cloudflare Worker relay. Defaults to Telegram.
  telegramApiRoot: optional('TELEGRAM_API_ROOT', 'https://api.telegram.org'),
  // If set, run in webhook mode; otherwise long polling (convenient for local dev).
  webhookUrl: process.env.WEBHOOK_URL ?? '',
  webhookSecret: process.env.BOT_WEBHOOK_SECRET ?? '',
  // Public HTTPS URL of the Mini App, used to build the web_app launch button.
  miniAppUrl: optional('MINIAPP_URL', ''),
  // Bot @username — lets us set a static botInfo and skip getMe on cold start.
  botUsername: optional('BOT_USERNAME', '').replace(/^@/, ''),
  // Port for the webhook HTTP server (webhook mode only).
  botPort: Number(optional('BOT_PORT', '3001')),
} as const;
