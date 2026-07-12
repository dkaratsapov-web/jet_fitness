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
printf '{"type":"commonjs"}\n' > "$API/pkg/package.json"
cp -r node_modules/@prisma/client "$API/pkg/node_modules/@prisma/client"
cp -r node_modules/.prisma/client "$API/pkg/node_modules/.prisma/client"

echo "==> Zipping"
( cd "$API/pkg" && zip -qr "../function.zip" . )

echo "==> Done: $API/function.zip ($(du -h "$API/function.zip" | cut -f1))"
