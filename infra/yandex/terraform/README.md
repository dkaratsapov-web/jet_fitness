# Terraform — инфраструктура Jet Fitness в Yandex Cloud

Создаёт всё разом: сеть, сервисный аккаунт (+роли, ключи), 2 бакета Object
Storage, Managed PostgreSQL, Cloud Function (плейсхолдер-версия) и API Gateway.
Автодеплой (`.github/workflows/deploy.yml`) затем катит в эту функцию новые
версии, а Terraform владеет самой инфраструктурой.

## Предусловия (на Mac)

```bash
brew install terraform yandex-cloud-cli   # terraform + yc
yc init                                    # авторизация в Yandex Cloud
```

## Запуск

```bash
cd infra/yandex/terraform
cp terraform.tfvars.example terraform.tfvars   # вписать cloud_id/folder_id/pg_password
export YC_TOKEN=$(yc iam create-token)         # авторизация провайдера

terraform init
terraform plan      # посмотреть, что создастся
terraform apply     # создать (~5-10 мин, дольше всего PostgreSQL)
```

## После apply — забрать значения для секретов

```bash
terraform output api_gateway_url          # -> секрет API_GATEWAY_URL, VITE_API_URL
terraform output -raw database_url        # -> секрет DATABASE_URL
terraform output -raw s3_key              # -> секрет S3_KEY
terraform output -raw s3_secret           # -> секрет S3_SECRET
terraform output -raw yc_sa_json          # -> секрет YC_SA_JSON_CREDENTIALS (весь JSON)
terraform output app_bucket               # -> секрет S3_APP_BUCKET
terraform output uploads_bucket           # -> секрет S3_UPLOADS_BUCKET
terraform output miniapp_url              # -> Web App URL в BotFather
```

Эти значения занесите в GitHub Secrets (см. `../SECRETS.md`), плюс `BOT_TOKEN`,
`BOT_WEBHOOK_SECRET`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, и после
первого деплоя воркера — `TELEGRAM_API_ROOT`.

## Миграции БД (один раз и при изменениях схемы)

PostgreSQL создаётся с публичным IP (порт 6432, группа безопасности открыта —
позже стоит сузить до нужных IP). Применить схему:

```bash
DATABASE_URL="$(terraform output -raw database_url)" npm run db:deploy
```

## Заметки

- Провайдер `yandex-cloud/yandex` тянется из реестра Terraform при `init`.
- `pg_resource_preset` по умолчанию `b2.medium` (дешёвый burstable). Меняйте под
  нагрузку.
- Первый `terraform plan` — это и есть настоящая проверка конфигурации против
  живого провайдера (в CI-песочнице реестр недоступен, поэтому здесь
  конфигурация проверена только на уровне HCL/`fmt`).
