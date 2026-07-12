# GitHub Secrets для автодеплоя

Задаются один раз: **репозиторий → Settings → Secrets and variables → Actions →
New repository secret**. После этого пуш в `main` (или ручной запуск workflow
«Deploy») автоматически разворачивает функцию, статику Mini App и Cloudflare
Worker.

| Secret | Что это | Где взять |
|---|---|---|
| `YC_SA_JSON_CREDENTIALS` | Ключ сервисного аккаунта Yandex (весь JSON) | `yc iam key create --service-account-name jet-fitness-sa --output key.json` → вставить содержимое key.json |
| `YC_FOLDER_ID` | ID каталога | `b1gljk9huj8ot3pn8g1c` (каталог `default`) |
| `BOT_TOKEN` | Токен бота | @BotFather |
| `BOT_WEBHOOK_SECRET` | Секрет вебхука (любая строка) | придумать |
| `DATABASE_URL` | Строка Managed PostgreSQL | шаг 1 в DEPLOY.md (порт 6432, `&connection_limit=5`) |
| `TELEGRAM_API_ROOT` | URL Cloudflare Worker-релея | после первого деплоя воркера (`https://jet-fitness-relay.<акк>.workers.dev`) |
| `API_GATEWAY_URL` | Домен API Gateway | шаг 5 в DEPLOY.md (`https://d5xxxx.apigw.yandexcloud.net`) |
| `S3_APP_BUCKET` | Бакет статики Mini App | `jet-fitness-app` |
| `S3_UPLOADS_BUCKET` | Бакет загрузок | `jet-fitness-uploads` |
| `S3_KEY` / `S3_SECRET` | Статический ключ доступа к Object Storage | `yc iam access-key create --service-account-name jet-fitness-sa` |
| `CLOUDFLARE_API_TOKEN` | Токен Cloudflare (право Edit Workers) | dash.cloudflare.com → My Profile → API Tokens |
| `CLOUDFLARE_ACCOUNT_ID` | ID аккаунта Cloudflare | dash.cloudflare.com → Workers → Account ID |

## Порядок первого запуска

Автодеплой обновляет уже существующую инфраструктуру. Поэтому один раз (по
`DEPLOY.md`) создаём: Managed PostgreSQL, бакеты, сервисный аккаунт, API Gateway.
Есть «яйцо-и-курица» с двумя URL — решается в два прохода:

1. Создать инфру (DEPLOY.md шаги 1–2), задать секреты, кроме `TELEGRAM_API_ROOT`
   и `API_GATEWAY_URL` (их ещё нет).
2. Запустить workflow «Deploy» вручную → создаётся функция. Создать API Gateway
   (шаг 5), задать `API_GATEWAY_URL`. Задеплоить воркер (шаг 6) → задать
   `TELEGRAM_API_ROOT`.
3. Ещё раз запустить workflow — теперь функция знает про релей, а Mini App
   собирается с правильным `VITE_API_URL`.
4. Установить вебхук Telegram на релей (DEPLOY.md шаг 7) и Mini App URL в
   BotFather (шаг 8).

Дальше каждый пуш в `main` деплоит автоматически.
