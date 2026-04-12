# Observability — Grafana + Loki + Prometheus

Идея: подключить мониторинг, логирование и аудит действий пользователей через Grafana-стек.

---

## Что уже есть в проекте

Fastify использует **Pino** для логов — каждый запрос автоматически пишется в JSON с полями `responseTime`, `statusCode`, `url`, `method`, `reqId`. Код менять не нужно.

В PostgreSQL уже есть таблицы с полезными данными:

| Таблица | Что содержит |
|---------|-------------|
| `sync_logs` | История синхронизаций, статус, тайминги, ошибки |
| `change_logs` | Кто, что и когда изменил (entityType, field, oldValue, newValue) |
| `shift_entries` | Смены по сотрудникам с датами и типами |
| `notifications` | События системы (no_matrix, unmatched_name, data_conflict) |

Grafana умеет напрямую ходить в PostgreSQL как datasource — дашборды по этим данным можно строить без единой строки кода.

---

## Стек

```
grafana     — UI дашбордов (порт 3000)
loki        — хранилище логов (принимает от promtail)
promtail    — агент: читает stdout Docker-контейнеров → отправляет в loki
prometheus  — хранилище метрик (собирает с /metrics endpoint API)
```

Всё open source, добавляется в `docker-compose`.

---

## Приоритеты внедрения

### Шаг 1 — Grafana + PostgreSQL (нулевой код)

Подключить Grafana к существующей БД как datasource. Сразу доступны дашборды:
- График синхронизаций по времени (из `sync_logs`)
- Аудит изменений проектов и смен (из `change_logs`)
- Активность по ролям и пользователям
- Статистика смен по сотрудникам

**Сложность:** минимальная — только конфиг datasource в Grafana.

### Шаг 2 — Pino → Loki (логи HTTP-запросов)

Promtail читает stdout API-контейнера и отправляет в Loki. В Grafana появляется:
- Все HTTP-запросы с таймингами
- Ошибки 4xx/5xx с контекстом
- Фильтрация по пользователю, роуту, методу

**Сложность:** низкая — docker-compose + конфиг Promtail (указать какой контейнер читать).

Опционально: добавить `pino-loki` транспорт в API — тогда логи идут напрямую в Loki без Promtail, но требует пары строк кода в `server.ts`.

### Шаг 3 — `@fastify/metrics` + Prometheus (метрики)

Плагин добавляет endpoint `GET /metrics` в формате Prometheus. Prometheus собирает, Grafana рисует:
- Latency по каждому роуту (гистограмма p50/p95/p99)
- Количество запросов в секунду
- Error rate (4xx/5xx)
- Активные соединения

**Сложность:** средняя — один плагин, конфиг Prometheus, дашборд в Grafana.

```bash
pnpm --filter @tv-shifts/api add @fastify/metrics prom-client
```

```typescript
// server.ts
import metrics from '@fastify/metrics'
await app.register(metrics, { endpoint: '/metrics' })
```

---

## docker-compose добавления

```yaml
grafana:
  image: grafana/grafana:latest
  ports: ["3000:3000"]
  volumes:
    - grafana_data:/var/lib/grafana
    - ./grafana/provisioning:/etc/grafana/provisioning
  environment:
    - GF_SECURITY_ADMIN_PASSWORD=admin

loki:
  image: grafana/loki:latest
  ports: ["3100:3100"]
  volumes:
    - loki_data:/loki
    - ./loki/config.yml:/etc/loki/config.yml

promtail:
  image: grafana/promtail:latest
  volumes:
    - /var/run/docker.sock:/var/run/docker.sock
    - ./promtail/config.yml:/etc/promtail/config.yml

prometheus:
  image: prom/prometheus:latest
  ports: ["9090:9090"]
  volumes:
    - ./prometheus/prometheus.yml:/etc/prometheus/prometheus.yml
```

---

## Что можно отслеживать через дашборды

- **Аудит действий** — кто из какой роли что изменил и когда (из `change_logs` + Pino-логи)
- **Производительность роутов** — какие endpoint'ы медленнее всего (из Prometheus)
- **Синхронизации** — история, количество изменений, ошибки по матрицам (из `sync_logs`)
- **Ошибки** — всплески 5xx, конкретные stacktrace-ы (из Loki)
- **Активность пользователей** — кто и как часто пользуется системой (из Pino-логов)

---

## Связанные ссылки

- [Grafana docs](https://grafana.com/docs/)
- [@fastify/metrics](https://github.com/fastify/fastify-metrics)
- [Grafana Loki](https://grafana.com/oss/loki/)
- [pino-loki](https://github.com/Vuader/pino-loki) — прямая отправка логов Pino в Loki без Promtail
