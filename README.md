# Jet Fitness

Telegram-нативная платформа для фитнес-коучинга: **тренер ↔ подопечные**. Всё
внутри Telegram — бот + Mini App, без отдельного приложения и регистрации для
клиента.

> Статус: **Фаза 0 — Каркас** (см. ТЗ §12). Готов монорепо, инфраструктура,
> схема БД, скелет бота, API с валидацией `initData` и скелет Mini App.

## Структура репозитория

```
jet_fitness/
├── docker-compose.yml         # postgres, redis, minio (+ api, bot)
├── .env.example               # шаблон переменных окружения
├── tsconfig.base.json
├── package.json               # npm workspaces (монорепо)
│
├── packages/
│   ├── db/                    # @jet/db — Prisma схема (§5) + клиент
│   │   ├── prisma/schema.prisma
│   │   └── src/index.ts       # singleton PrismaClient
│   └── shared/                # @jet/shared — общий код
│       └── src/
│           ├── initData.ts    # валидация Telegram initData (§6) — КРИТИЧНО
│           └── roles.ts       # роли, парсинг deep-link
│
└── apps/
    ├── api/                   # @jet/api — Fastify REST API
    │   └── src/
    │       ├── auth/          # authPlugin (requireAuth) + тесты initData
    │       ├── routes/        # /health, /api/auth/session, /api/me
    │       ├── app.ts
    │       └── index.ts
    ├── bot/                   # @jet/bot — grammY бот
    │   └── src/
    │       ├── bot.ts         # /start (+deep-link invite), /app, /help
    │       └── index.ts       # webhook / long-polling
    └── miniapp/               # @jet/miniapp — React + Vite + Tailwind
        └── src/
            ├── telegram.ts    # window.Telegram.WebApp (initData, тема)
            ├── api.ts         # клиент API (шлёт initData)
            ├── App.tsx        # вход, определение роли
            └── screens/       # пустые экраны тренера/клиента
```

## Технологии

- **Bot:** Node.js + TypeScript + [grammY](https://grammy.dev)
- **API:** [Fastify](https://fastify.dev) + валидация `initData` (HMAC-SHA256)
- **Mini App:** React + TypeScript + Vite + Tailwind. Рантайм Telegram Mini Apps
  через официальный `telegram-web-app.js` (`window.Telegram.WebApp`).
  Обёртку `@telegram-apps/sdk-react` планируется навесить сверху в след. фазах.
- **БД:** PostgreSQL + Prisma
- **Инфра:** Redis (BullMQ — позже), S3/MinIO (файлы — позже)

## Быстрый старт (локально)

Требуется Node 20+, Docker.

```bash
# 1. Переменные окружения
cp .env.example .env
# заполнить BOT_TOKEN (обязательно), при необходимости MINIAPP_URL и др.

# 2. Инфраструктура
docker compose up -d postgres redis minio minio-init

# 3. Зависимости
npm install

# 4. Prisma: клиент + первая миграция
npm run db:generate
npm run db:migrate        # создаст миграцию в packages/db/prisma/migrations

# 5. Запуск сервисов (в отдельных терминалах)
npm run dev:api           # http://localhost:3000/health
npm run dev:bot           # long-polling (без webhook) при пустом WEBHOOK_URL
npm run dev:miniapp       # http://localhost:5173
```

Полностью в Docker (api + bot + инфра):

```bash
docker compose up --build
```

## Быстрый временный URL (Cloudflare tunnel) — увидеть в Telegram без домена

Самый быстрый способ открыть Mini App прямо в Telegram, **без домена и без
хостинга**. API отдаёт и фронтенд, и `/api` с одного адреса; бот работает в
режиме long-polling (публичный URL ему не нужен); Cloudflare выдаёт временный
`https://<случайно>.trycloudflare.com`.

```bash
# 1. .env — достаточно BOT_TOKEN
cp .env.example .env && $EDITOR .env   # вписать BOT_TOKEN

# 2. Поднять стек (миграции применятся сами)
docker compose -f docker-compose.tunnel.yml up --build

# 3. Узнать временный URL
docker compose -f docker-compose.tunnel.yml logs cloudflared | grep trycloudflare.com
```

Затем в [@BotFather](https://t.me/BotFather) → Bot Settings → **Menu Button** →
вставить полученный `https://…trycloudflare.com`. Откройте бота, нажмите кнопку —
Mini App загрузится с этого адреса.

> URL меняется при каждом перезапуске туннеля, но **пересобирать ничего не
> нужно**: фронтенд ходит в API по относительным путям `/api/...`, так что
> достаточно обновить адрес в BotFather. Для стабильного адреса — раздел
> «Продакшн-деплой» ниже.

## Продакшн-деплой (VPS + ваш домен)

Стек `docker-compose.prod.yml`: **Traefik** терминирует TLS и сам получает
сертификаты Let's Encrypt. Mini App отдаётся статикой из nginx, API и вебхук
бота — за реверс-прокси. Нужны два поддомена вашего домена.

**1. DNS.** Направьте A/AAAA-записи на IP вашего VPS:

| Поддомен | Назначение |
|---|---|
| `app.<ваш-домен>` | Mini App (фронтенд) |
| `api.<ваш-домен>` | REST API + вебхук бота (`/telegram/webhook`) |

**2. `.env`** на сервере (из `.env.example`), минимум:

```env
BOT_TOKEN=<от BotFather>
APP_DOMAIN=app.вашдомен.ру
API_DOMAIN=api.вашдомен.ру
ACME_EMAIL=you@вашдомен.ру
POSTGRES_PASSWORD=<надёжный пароль>
```

`WEBHOOK_URL`, `MINIAPP_URL`, `VITE_API_URL` и `CORS_ORIGINS` стек выводит из
`APP_DOMAIN`/`API_DOMAIN` автоматически — вручную задавать не нужно.

**3. Запуск** (миграции применяются автоматически перед стартом api/bot):

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

**4. BotFather.** Укажите Mini App URL = `https://app.<ваш-домен>`
(`/newapp` или Bot Settings → Menu Button → Web App URL). Вебхук бот ставит сам
при старте (`WEBHOOK_URL`).

После этого бот открывает Mini App по кнопке, а Telegram грузит фронтенд с
`https://app.<ваш-домен>` и ходит в API на `https://api.<ваш-домен>`.

## Скрипты

| Команда | Действие |
|---|---|
| `npm run dev:api` | API в watch-режиме (tsx) |
| `npm run dev:bot` | Бот в watch-режиме |
| `npm run dev:miniapp` | Vite dev server |
| `npm run db:generate` | Сгенерировать Prisma Client |
| `npm run db:migrate` | Миграция (dev) |
| `npm run db:studio` | Prisma Studio |
| `npm run typecheck` | Проверка типов во всех пакетах |
| `npm test` (в apps/api) | Тесты (валидация initData) |

## Аутентификация (§6)

Mini App при каждом запросе шлёт заголовок `Authorization: tma <initData>`.
Сервер (`packages/shared/src/initData.ts`) проверяет подпись HMAC-SHA256
(`secret = HMAC_SHA256("WebAppData", BOT_TOKEN)`), сверяет `hash` в
константное время и проверяет свежесть по `auth_date` (TTL
`INITDATA_TTL_SECONDS`). `telegram_id` берётся **только** из проверенной
`initData`, никогда из тела запроса. Покрыто тестами в
`apps/api/src/auth/initData.test.ts`.

## Приглашения (§2)

Тренер генерирует deep-link `t.me/<bot>?start=invite_<token>`. Клиент
открывает — бот (`apps/bot/src/bot.ts`) проверяет одноразовый токен с TTL,
привязывает клиента к тренеру (`CoachClient`) и предлагает кнопку запуска Mini
App. API (`/api/auth/session`) дополнительно обрабатывает `start_param` для
запусков через `startapp`.

## Безопасность / compliance (§10)

- `initData` валидируется на сервере всегда.
- Секреты — только в `.env` (не в репозитории), rate limiting на API.
- Модуль здоровья (анализы, БАДы) присутствует в схеме, но **выключен** флагом
  `HEALTH_MODULE_ENABLED=false` до юридической проработки (Фаза 3).
- БАДы — только нейтральный self-log; функционал назначения дозировок не
  реализуется.

## Что нужно от заказчика перед запуском

- **`BOT_TOKEN`** — от [@BotFather](https://t.me/BotFather). **Обязательно** —
  без него не стартуют ни бот, ни API (нужен для валидации `initData`).
- **Домен + VPS** — для прод: два поддомена (`app.` и `api.`) на IP сервера
  (см. «Продакшн-деплой»). HTTPS Traefik делает сам.
- Позже (Фаза 1+): `PAYMENT_PROVIDER_TOKEN` (напр. ЮKassa), настройки S3.

Mini App URL (`MINIAPP_URL`), webhook (`WEBHOOK_URL`) и `VITE_API_URL` в
прод-стеке выводятся из `APP_DOMAIN`/`API_DOMAIN` автоматически. Остальные
переменные имеют рабочие дефолты для локальной разработки — см. `.env.example`.
