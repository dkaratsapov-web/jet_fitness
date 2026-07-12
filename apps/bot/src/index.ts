// Bot entrypoint. Runs in long-polling mode by default (great for local dev);
// switches to webhook mode when WEBHOOK_URL is set (required for production —
// Telegram webhooks need HTTPS, spec §9).

import { createServer } from 'node:http';
import { webhookCallback } from 'grammy';
import { createBot } from './bot.js';
import { env } from './env.js';

async function main(): Promise<void> {
  const bot = createBot();

  // Register the bot's command list shown in Telegram clients.
  await bot.api.setMyCommands([
    { command: 'start', description: 'Начать / принять приглашение' },
    { command: 'app', description: 'Открыть приложение' },
    { command: 'help', description: 'Справка' },
  ]);

  if (env.webhookUrl) {
    // ── Webhook mode ──
    const handle = webhookCallback(bot, 'http', {
      secretToken: env.webhookSecret || undefined,
    });
    const server = createServer((req, res) => {
      if (req.method === 'POST' && req.url === '/telegram/webhook') {
        void handle(req, res);
        return;
      }
      if (req.url === '/health') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', service: 'jet-bot' }));
        return;
      }
      res.writeHead(404);
      res.end();
    });

    await new Promise<void>((resolve) => server.listen(env.botPort, resolve));
    await bot.api.setWebhook(env.webhookUrl, {
      secret_token: env.webhookSecret || undefined,
    });
    console.log(`[bot] webhook mode on :${env.botPort} -> ${env.webhookUrl}`);
  } else {
    // ── Long-polling mode (local dev) ──
    await bot.api.deleteWebhook();
    console.log('[bot] long-polling mode');
    await bot.start({
      onStart: (info) => console.log(`[bot] started as @${info.username}`),
    });
  }
}

main().catch((err) => {
  console.error('[bot] fatal', err);
  process.exit(1);
});
