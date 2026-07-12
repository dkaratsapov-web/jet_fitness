# Jet Fitness — Mini App image (production).
# Builds the React app to static files and serves them via nginx.
# Build context is the repo root (see docker-compose.prod.yml).
#
# VITE_API_URL is a BUILD-TIME value (Vite bakes env vars into the bundle),
# so it must be passed as a build arg — not a runtime env var.

FROM node:20-alpine AS build
WORKDIR /app
ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}

# Copy all workspace manifests so npm can resolve the workspace tree.
COPY package.json package-lock.json* ./
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/bot/package.json apps/bot/
COPY apps/miniapp/package.json apps/miniapp/
RUN npm install

COPY apps/miniapp ./apps/miniapp
RUN npm run build --workspace @jet/miniapp

# ── Serve ──
FROM nginx:1.27-alpine AS runtime
COPY apps/miniapp/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/miniapp/dist /usr/share/nginx/html
EXPOSE 80
