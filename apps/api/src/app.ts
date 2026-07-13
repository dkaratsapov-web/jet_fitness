// Build the Fastify app. Kept separate from index.ts so tests can import it.

import { existsSync } from 'node:fs';
import { join, isAbsolute, resolve } from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import authPlugin from './auth/authPlugin.js';
import { healthRoutes } from './routes/health.js';
import { authRoutes } from './routes/auth.js';
import { coachRoutes } from './routes/coach.js';
import { programRoutes } from './routes/programs.js';
import { clientRoutes } from './routes/client.js';
import { telegramRoutes } from './routes/telegram.js';
import { env } from './env.js';

// BigInt is not JSON-serializable by default; emit as string globally.
// (Individual responses also convert explicitly, but this guards ad-hoc payloads.)
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function () {
  return this.toString();
};

export interface BuildAppOptions {
  /**
   * Serverless mode: disable the pino logger. When the app is bundled (esbuild)
   * for a Cloud Function, pino's thread-stream worker path breaks; skipping the
   * logger instance avoids it entirely. Platform captures stdout regardless.
   */
  serverless?: boolean;
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.serverless
      ? false
      : {
          level: env.nodeEnv === 'production' ? 'info' : 'debug',
          transport:
            env.nodeEnv === 'production'
              ? undefined
              : { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } },
        },
    trustProxy: true,
  });

  // Tolerate empty JSON bodies (the Mini App sends POST /auth/session with an
  // application/json header but no body). Default parser 400s on empty input.
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (_req, body: string, done) => {
      if (!body || body.trim().length === 0) {
        done(null, {});
        return;
      }
      try {
        done(null, JSON.parse(body));
      } catch (err) {
        done(err as Error, undefined);
      }
    },
  );

  const allowAllOrigins = env.corsOrigins.includes('*') || env.corsOrigins.length === 0;
  await app.register(cors, {
    origin: allowAllOrigins ? true : env.corsOrigins,
    credentials: true,
  });

  // Rate limiting on the whole API surface (spec §10.4).
  await app.register(rateLimit, {
    max: 120,
    timeWindow: '1 minute',
  });

  await app.register(authPlugin);

  // Routes
  await app.register(healthRoutes);
  await app.register(authRoutes, { prefix: '/api' });
  await app.register(coachRoutes, { prefix: '/api' });
  await app.register(programRoutes, { prefix: '/api' });
  await app.register(clientRoutes, { prefix: '/api' });

  // Serverless single-function mode: also handle the Telegram webhook here.
  if (env.enableTelegramWebhook) {
    await app.register(telegramRoutes);
  }

  // Optional single-origin mode: also serve the built Mini App static files.
  await registerStatic(app);

  return app;
}

/**
 * When MINIAPP_DIST points at a built Mini App, serve it from the API origin.
 * Non-API GET routes fall back to index.html (SPA), so the frontend and API
 * share one public URL (used by the Cloudflare tunnel demo stack).
 */
async function registerStatic(app: FastifyInstance): Promise<void> {
  if (!env.miniappDist) return;
  const root = isAbsolute(env.miniappDist)
    ? env.miniappDist
    : resolve(process.cwd(), env.miniappDist);
  if (!existsSync(join(root, 'index.html'))) {
    app.log.warn(`MINIAPP_DIST set but no index.html at ${root}; skipping static serving`);
    return;
  }

  await app.register(fastifyStatic, { root, wildcard: false });

  // SPA fallback: unmatched GETs that aren't API/health return the app shell.
  app.setNotFoundHandler((request, reply) => {
    const url = request.raw.url ?? '';
    if (request.method === 'GET' && !url.startsWith('/api') && !url.startsWith('/health')) {
      return reply.sendFile('index.html');
    }
    return reply.code(404).send({ error: 'not_found' });
  });

  app.log.info(`serving Mini App static from ${root}`);
}
