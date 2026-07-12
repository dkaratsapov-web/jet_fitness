# Деплой Jet Fitness в Yandex Cloud + Cloudflare relay

Архитектура (данные — в РФ, обход блокировки Telegram — через Cloudflare):

```
Telegram ⇄ Cloudflare Worker (relay, вне РФ, без хранения)
                ⇅
Yandex Cloud (РФ):
  • API Gateway        — публичный HTTPS-вход
  • Cloud Function     — Fastify API + вебхук бота (одна функция)
  • Managed PostgreSQL — данные (Prisma)
  • Object Storage     — статика Mini App + загрузки (фото/видео)
```

- **Mini App → API:** телефон клиента в РФ → API Gateway в РФ (напрямую, релей не нужен).
- **Бот ⇄ Telegram:** только через Cloudflare Worker.
- **Статика Mini App:** Object Storage (РФ-адрес), клиент грузит её напрямую.

---

## 0. Предусловия

- Установленный `yc` CLI: https://yandex.cloud/ru/docs/cli/quickstart — `yc init`.
- Установленный `wrangler` (Cloudflare): `npm i -g wrangler` (или `npx wrangler`).
- В репозитории: `npm install`.
- Значения из вашего облака: `CLOUD_ID`, `FOLDER_ID` (каталог `default`).

## Переменные окружения функции

Функция читает те же переменные, что и локально (см. `.env.example`), плюс:

| Переменная | Значение для этого деплоя |
|---|---|
| `BOT_TOKEN` | от BotFather |
| `DATABASE_URL` | строка Managed PostgreSQL (см. шаг 1) |
| `TELEGRAM_API_ROOT` | URL Cloudflare Worker (см. шаг 6) — исходящие в Telegram через релей |
| `ENABLE_TELEGRAM_WEBHOOK` | `true` — функция обрабатывает и вебхук бота |
| `BOT_WEBHOOK_SECRET` | произвольная строка-секрет (сверяется на вебхуке) |
| `S3_ENDPOINT` | `https://storage.yandexcloud.net` |
| `S3_BUCKET` / `S3_KEY` / `S3_SECRET` | из статического ключа сервисного аккаунта |
| `INITDATA_TTL_SECONDS` | `86400` |
| `HEALTH_MODULE_ENABLED` | `false` |

---

## 1. Managed PostgreSQL

```bash
yc managed-postgresql cluster create \
  --name jet-fitness-pg \
  --environment production \
  --network-name default \
  --host zone-id=ru-central1-a,subnet-name=default \
  --resource-preset s2.micro \
  --disk-size 10 --disk-type network-ssd \
  --postgresql-version 16 \
  --user name=jet,password=<СИЛЬНЫЙ_ПАРОЛЬ> \
  --database name=jet_fitness,owner=jet
```

Соберите `DATABASE_URL`:
```
postgresql://jet:<ПАРОЛЬ>@<FQDN_ХОСТА>:6432/jet_fitness?sslmode=verify-full&schema=public
```
Порт **6432** — встроенный пул соединений (важно для serverless, чтобы не
исчерпать лимит подключений). Добавьте в URL `&connection_limit=5`.

Применить миграции (с локальной машины, разрешив ваш IP в группе безопасности,
либо из виртуалки в той же сети):
```bash
DATABASE_URL="postgresql://..." npm run db:deploy
```

## 2. Object Storage

```bash
# бакет для статики Mini App (публичное чтение)
yc storage bucket create --name jet-fitness-app --public-read
# бакет для загрузок пользователей (приватный)
yc storage bucket create --name jet-fitness-uploads
```
Создайте сервисный аккаунт + статический ключ для доступа по S3:
```bash
yc iam service-account create --name jet-fitness-sa
yc iam access-key create --service-account-name jet-fitness-sa
# сохраните key_id (S3_KEY) и secret (S3_SECRET)
```

## 3. Сборка и упаковка функции

```bash
# 1) сгенерировать Prisma client с linux-движком и собрать бандл
npm run db:generate
npm run bundle --workspace @jet/api      # -> apps/api/dist/handler.js

# 2) собрать zip: бандл + Prisma client + движок
cd apps/api
mkdir -p pkg && cp dist/handler.js dist/handler.js.map pkg/
cp -r ../../node_modules/@prisma/client pkg/node_modules/@prisma/client
cp -r ../../node_modules/.prisma pkg/node_modules/.prisma
cd pkg && zip -r ../function.zip . && cd ..
```

> Если Prisma при старте функции ругается на несовместимый движок — поправьте
> `binaryTargets` в `packages/db/prisma/schema.prisma` под платформу рантайма
> (частые варианты: `debian-openssl-3.0.x`, `debian-openssl-1.1.x`), пересоберите.

## 4. Создать функцию

```bash
yc serverless function create --name jet-fitness-api

yc serverless function version create \
  --function-name jet-fitness-api \
  --runtime nodejs18 \
  --entrypoint handler.handler \
  --memory 512m --execution-timeout 30s \
  --source-path apps/api/function.zip \
  --environment BOT_TOKEN=...,DATABASE_URL=...,ENABLE_TELEGRAM_WEBHOOK=true,BOT_WEBHOOK_SECRET=...,TELEGRAM_API_ROOT=...,S3_ENDPOINT=https://storage.yandexcloud.net,S3_BUCKET=jet-fitness-uploads,S3_KEY=...,S3_SECRET=...,INITDATA_TTL_SECONDS=86400,HEALTH_MODULE_ENABLED=false
```

Дайте сервисному аккаунту роль вызова функции и сделайте функцию публичной для
API Gateway (или используйте service_account в спецификации Gateway).

## 5. API Gateway

Подставьте `FUNCTION_ID` (`yc serverless function get jet-fitness-api`) и
`SERVICE_ACCOUNT_ID` в `api-gateway.yaml`, затем:
```bash
yc serverless api-gateway create --name jet-fitness-gw \
  --spec=infra/yandex/api-gateway.yaml
# получите домен вида https://d5xxxx.apigw.yandexcloud.net
```
Проверка: `curl https://d5xxxx.apigw.yandexcloud.net/health` → `{"status":"ok"}`.

## 6. Cloudflare Worker relay

```bash
cd infra/cloudflare-worker
npx wrangler login
# впишите YANDEX_GATEWAY_URL в wrangler.toml (домен из шага 5)
npx wrangler deploy
# получите URL вида https://jet-fitness-relay.<акк>.workers.dev
```
Пропишите этот URL в переменную функции `TELEGRAM_API_ROOT` (пересоздайте версию
функции или обновите переменные), чтобы исходящие вызовы шли через релей.

## 7. Вебхук Telegram → через релей

Установите вебхук на URL релея (одноразовая команда; можно с любой машины с
доступом к api.telegram.org, напр. через тот же релей):
```bash
curl "https://<RELAY>/bot<BOT_TOKEN>/setWebhook?url=https://<RELAY>/webhook&secret_token=<BOT_WEBHOOK_SECRET>"
```

## 8. Статика Mini App

```bash
# собрать с адресом API = домен API Gateway
VITE_API_URL="https://d5xxxx.apigw.yandexcloud.net" npm run build --workspace @jet/miniapp
# загрузить в бакет статики
yc storage s3 --endpoint https://storage.yandexcloud.net \
  cp --recursive apps/miniapp/dist s3://jet-fitness-app/
```
Адрес Mini App: `https://storage.yandexcloud.net/jet-fitness-app/index.html`.
Укажите его в **@BotFather → Bot Settings → Menu Button → Web App URL**.

---

## Итог

- Открываете бота → кнопка меню → Mini App грузится из Object Storage (РФ).
- Mini App шлёт `initData` в API Gateway → Cloud Function (валидация §6).
- Команды бота (`/start`, инвайты) идут Telegram → relay → функция и обратно.
- Все данные — в Managed PostgreSQL в РФ.
