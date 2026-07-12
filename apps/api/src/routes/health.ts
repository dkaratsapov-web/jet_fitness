import type { FastifyPluginAsync } from 'fastify';

// Liveness endpoint — no auth (spec §8: all endpoints require initData except health).
export const healthRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/health', async () => ({
    status: 'ok',
    service: 'jet-api',
    time: new Date().toISOString(),
  }));
};
