// Verifies the Yandex Cloud Function adapter maps API Gateway events to the
// Fastify app correctly (health = public, /api/me = auth-guarded).

import { describe, it, expect, beforeAll } from 'vitest';

process.env.BOT_TOKEN ??= '123456:TEST';

// Imported after env is set so buildApp()'s env parsing succeeds.
let handler: typeof import('./serverless.js').handler;

beforeAll(async () => {
  ({ handler } = await import('./serverless.js'));
});

describe('serverless handler', () => {
  it('routes GET /health to a 200 JSON response', async () => {
    const res = await handler({ httpMethod: 'GET', path: '/health' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { status: string };
    expect(body.status).toBe('ok');
  });

  it('guards GET /api/me without initData (401)', async () => {
    const res = await handler({ httpMethod: 'GET', path: '/api/me' });
    expect(res.statusCode).toBe(401);
  });

  it('passes query string through to the app', async () => {
    const res = await handler({
      httpMethod: 'GET',
      path: '/health',
      queryStringParameters: { foo: 'bar' },
    });
    expect(res.statusCode).toBe(200);
  });
});
