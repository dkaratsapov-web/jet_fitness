// Telegram webhook route (serverless-friendly).
//
// In the Yandex Cloud deploy, Telegram updates arrive via the Cloudflare Worker
// relay -> API Gateway -> this route. We reuse the same grammY bot definition as
// the standalone bot service, so command logic lives in one place (@jet/bot).
//
// The bot is initialized lazily on the FIRST webhook update (bot.init calls
// getMe through the relay). This keeps /health and the /api routes independent
// of the relay — cold starts and the deploy smoke test never touch Telegram.

import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { webhookCallback } from 'grammy';
import { createBot } from '@jet/bot';

type WebhookHandler = (request: FastifyRequest, reply: FastifyReply) => unknown;

export const telegramRoutes: FastifyPluginAsync = async (fastify) => {
  const secret = process.env.BOT_WEBHOOK_SECRET || undefined;
  let handle: WebhookHandler | null = null;

  fastify.post('/telegram/webhook', async (request, reply) => {
    if (!handle) {
      const bot = createBot();
      await bot.init(); // getMe via the relay; only on the first real update
      handle = webhookCallback(bot, 'fastify', {
        secretToken: secret,
      }) as unknown as WebhookHandler;
    }
    return handle(request, reply);
  });
};
