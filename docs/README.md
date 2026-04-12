# TV Shifts — Документация

## Содержание

| Файл | Описание |
|------|----------|
| [01-overview.md](01-overview.md) | Обзор проекта — что это, для кого, какую задачу решает |
| [02-features.md](02-features.md) | Полный функционал — роли, календарь, смены, синхронизация, уведомления, задачи |
| [03-data-sources.md](03-data-sources.md) | Источники данных — структура всех трёх Google Sheets таблиц |
| [04-database-schema.md](04-database-schema.md) | Схема базы данных — все таблицы, поля, связи, индексы |
| [05-architecture.md](05-architecture.md) | Архитектура и стек — технологии, структура проекта, парсер матриц |
| [07-dev-setup.md](07-dev-setup.md) | Развёртывание на новой машине — Git, Docker, миграции |
| [08-deploy.md](08-deploy.md) | Деплой на сервер — Docker Compose prod, SSL, бэкапы |
| [09-observability.md](09-observability.md) | Мониторинг — Grafana, Loki, Prometheus, план внедрения |
| [TODO.md](TODO.md) | Актуальные задачи с приоритетами |
| [DONE.md](DONE.md) | Всё реализованное |

## Быстрый старт (разработка)

```powershell
# Запустить API + Web (PowerShell из корня проекта)
.\start.ps1
```

- Web: http://localhost:5173
- API: http://localhost:4000

## Тестовые аккаунты

| Email | Пароль | Роль |
|-------|--------|------|
| admin@tvshifts.ru | admin123 | Администратор |
| ivanov@tvshifts.ru | user123 | Сотрудник |
| petrov@tvshifts.ru | user123 | Сотрудник |
| sidorova@tvshifts.ru | user123 | Сотрудник |
| producer@tvshifts.ru | user123 | Продюсер |
