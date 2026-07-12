// Bundles the Yandex Cloud Function entrypoint into a single CommonJS file.
//
// Prisma cannot be bundled (it ships a native query-engine binary and generated
// client), so @prisma/client and .prisma/client stay external and must be
// included in the deployment zip alongside the bundle (see infra/yandex/DEPLOY.md).
//
// Output: dist/handler.js  with named export `handler`
// Yandex function entrypoint:  handler.handler

import { build } from 'esbuild';

await build({
  entryPoints: ['src/serverless.ts'],
  outfile: 'dist/handler.js',
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  sourcemap: true,
  // Keep Prisma external — its engine binary and generated client are copied
  // into the zip separately.
  external: ['@prisma/client', '.prisma/client'],
  // pino-pretty is dev-only; production logging uses plain JSON.
  logOverride: { 'require-resolve-not-external': 'silent' },
});

// eslint-disable-next-line no-console
console.log('Bundled -> apps/api/dist/handler.js (entrypoint: handler.handler)');
