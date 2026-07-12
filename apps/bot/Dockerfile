# Jet Fitness — Bot service image (Phase 0)
# Build context is the repo root (see docker-compose.yml).

FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache openssl

COPY package.json package-lock.json* ./
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
COPY apps/bot/package.json apps/bot/
RUN npm install

COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps/bot ./apps/bot

RUN npm run generate --workspace @jet/db

ENV NODE_ENV=production
CMD ["npm", "run", "start", "--workspace", "@jet/bot"]
