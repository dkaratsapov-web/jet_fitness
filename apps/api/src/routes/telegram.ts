// Telegram webhook route (serverless-friendly).
//
// In the Yandex Cloud deploy, Telegram updates arrive via the Cloudflare Worker
// relay -> API Gateway -> this route. We reuse the same grammY bot definition as
// the standalone bot service, so command logic lives in one place (@jet/bot).
//
// This plugin is only registered when ENABLE_TELEGRAM_WEBHOOK=true (the
// serverless single-function mode), so the bot.init() getMe call at
// registration is confined to that path — local dev/tests never hit it.

import type { FastifyPluginAsync } from 'fastify';
import { webhookCallback } from 'grammy';
import { createBot } from '@jet/bot';

export const telegramRoutes: FastifyPluginAsync = async (fastify) => {
  const secret = process.env.BOT_WEBHOOK_SECRET || undefined;

  const bot = createBot();
  // Populate bot.botInfo before handling updates (webhook mode does not
  // auto-init). Goes through the configured Telegram apiRoot (relay).
  await bot.init();

  fastify.post('/telegram/webhook', webhookCallback(bot, 'fastify', { secretToken: secret }));
};
