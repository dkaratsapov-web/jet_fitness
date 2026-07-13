// Yandex Cloud Function entrypoint.
//
// API Gateway (HTTP integration) invokes this handler with an AWS-style proxy
// event. We translate it into a Fastify `inject` call and map the reply back.
// The Fastify app is built once at module load and reused across warm
// invocations (cold start pays the build cost; subsequent calls are fast).
//
// Deploy note: the same function serves /api/* and /telegram/webhook — set
// ENABLE_TELEGRAM_WEBHOOK=true in the function environment.

import type { FastifyInstance } from 'fastify';
import { buildApp } from './app.js';

export interface ApiGatewayEvent {
  httpMethod?: string;
  path?: string;
  url?: string;
  headers?: Record<string, string>;
  queryStringParameters?: Record<string, string> | null;
  // Yandex API Gateway greedy {proxy+} route puts the real path segments here.
  params?: Record<string, string>;
  pathParams?: Record<string, string>;
  body?: string;
  isBase64Encoded?: boolean;
}

export interface ApiGatewayResult {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  isBase64Encoded: boolean;
}

let appPromise: Promise<FastifyInstance> | null = null;

async function getApp(): Promise<FastifyInstance> {
  if (!appPromise) {
    appPromise = buildApp({ serverless: true }).then(async (app) => {
      await app.ready();
      return app;
    });
  }
  return appPromise;
}

function buildUrl(event: ApiGatewayEvent): string {
  // Yandex API Gateway routes everything through the greedy {proxy+} operation,
  // so event.path/url is the literal template "/{proxy+}". The actual path is in
  // the `proxy` path parameter; reconstruct from it, falling back to any concrete
  // url/path (e.g. the root "/" operation).
  const proxy = event.pathParams?.proxy ?? event.params?.proxy;
  let path: string;
  if (typeof proxy === 'string' && proxy.length > 0) {
    path = '/' + proxy.replace(/^\/+/, '');
  } else if (event.url && !event.url.includes('{')) {
    path = event.url;
  } else if (event.path && !event.path.includes('{')) {
    path = event.path;
  } else {
    path = '/';
  }

  const qs = event.queryStringParameters;
  if (qs && Object.keys(qs).length > 0) {
    const search = new URLSearchParams(qs).toString();
    return `${path}?${search}`;
  }
  return path;
}

export async function handler(event: ApiGatewayEvent): Promise<ApiGatewayResult> {
  const app = await getApp();

  const payload =
    event.body === undefined
      ? undefined
      : event.isBase64Encoded
        ? Buffer.from(event.body, 'base64')
        : event.body;

  const res = await app.inject({
    method: (event.httpMethod ?? 'GET') as never,
    url: buildUrl(event),
    headers: event.headers ?? {},
    payload,
  });

  // Flatten headers to strings.
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(res.headers)) {
    if (value === undefined) continue;
    headers[key] = Array.isArray(value) ? value.join(', ') : String(value);
  }

  return {
    statusCode: res.statusCode,
    headers,
    body: res.body,
    isBase64Encoded: false,
  };
}
