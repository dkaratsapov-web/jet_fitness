# Jet Fitness — API service image (Phase 0)
# Build context is the repo root (see docker-compose.yml).
# Phase 0 runs TypeScript directly via tsx to keep the monorepo skeleton simple;
# a compiled multi-stage build can be introduced once the surface stabilizes.

FROM node:20-alpine
WORKDIR /app
# Prisma needs OpenSSL at runtime.
RUN apk add --no-cache openssl

# Install workspace dependencies.
COPY package.json package-lock.json* ./
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN npm install

# Copy sources.
COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps/api ./apps/api

# Generate the Prisma client.
RUN npm run generate --workspace @jet/db

ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm", "run", "start", "--workspace", "@jet/api"]
