#!/usr/bin/env bash
# Assemble the Yandex Cloud Function deployment package (apps/api/function.zip).
# Used by both CI (.github/workflows/deploy.yml) and manual deploys.
#
# Produces a self-contained package:
#   handler.js            — esbuild bundle (entrypoint: handler.handler)
#   package.json          — { "type": "commonjs" } so Node loads the CJS bundle
#   node_modules/@prisma/client, node_modules/.prisma/client  — Prisma runtime
#                                                                + Linux engine
set -euo pipefail

# Repo root (this script lives in infra/yandex/).
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

API="apps/api"

echo "==> Generating Prisma client (with Linux engine)"
npm run db:generate

echo "==> Bundling function"
npm run bundle --workspace @jet/api

echo "==> Assembling package"
rm -rf "$API/pkg" "$API/function.zip"
mkdir -p "$API/pkg/node_modules/@prisma" "$API/pkg/node_modules/.prisma"
cp "$API/dist/handler.js" "$API/pkg/"
# Sourcemap is omitted from the package to keep it small (runtime doesn't need it).
# NOTE: no package.json — Yandex would run npm install and drop the bundled
# node_modules. Without it the runtime treats handler.js as CommonJS by default.
cp -r node_modules/@prisma/client "$API/pkg/node_modules/@prisma/client"
cp -r node_modules/.prisma/client "$API/pkg/node_modules/.prisma/client"

echo "==> Zipping"
( cd "$API/pkg" && zip -qr "../function.zip" . )

echo "==> Done: $API/function.zip ($(du -h "$API/function.zip" | cut -f1))"
echo "==> Package sanity (must list @prisma/client + engine):"
unzip -l "$API/function.zip" | grep -E "handler.js|@prisma/client/index.js|libquery_engine" || echo "!! MISSING expected files"
