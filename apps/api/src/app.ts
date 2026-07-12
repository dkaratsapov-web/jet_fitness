// Build the Fastify app. Kept separate from index.ts so tests can import it.

import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import authPlugin from './auth/authPlugin.js';
import { healthRoutes } from './routes/health.js';
import { authRoutes } from './routes/auth.js';
import { env } from './env.js';

// BigInt is not JSON-serializable by default; emit as string globally.
// (Individual responses also convert explicitly, but this guards ad-hoc payloads.)
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function () {
  return this.toString();
};

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: env.nodeEnv === 'production' ? 'info' : 'debug',
      transport:
        env.nodeEnv === 'production'
          ? undefined
          : { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } },
    },
    trustProxy: true,
  });

  await app.register(cors, {
    origin: env.corsOrigins.length > 0 ? env.corsOrigins : true,
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

  return app;
}
