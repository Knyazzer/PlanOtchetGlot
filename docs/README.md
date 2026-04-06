# TV Shifts — Документация

## Содержание

| Файл | Описание |
|------|----------|
| [01-overview.md](01-overview.md) | Обзор проекта — что это, для кого, какую задачу решает |
| [02-features.md](02-features.md) | Полный функционал — роли, календарь, смены, синхронизация, уведомления, задачи |
| [03-data-sources.md](03-data-sources.md) | Источники данных — структура всех трёх Google Sheets таблиц |
| [04-database-schema.md](04-database-schema.md) | Схема базы данных — все таблицы, поля, связи, индексы |
| [05-architecture.md](05-architecture.md) | Архитектура и стек — технологии, структура проекта, парсер матриц |
| [06-implementation-plan.md](06-implementation-plan.md) | План реализации — 8 этапов с конкретными задачами |

## Быстрый старт (после реализации)

```bash
cp .env.example .env
# Заполнить .env: DATABASE_URL, JWT_SECRET, GOOGLE_SERVICE_ACCOUNT_KEY

docker-compose up -d
# Приложение доступно на http://localhost
```
