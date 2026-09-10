# Observability

## Logging

- `structlog` -> JSON to stdout (one line per event). Fields: `timestamp`, `level`, `event`,
  `logger`, `request_id`, `correlation_id`, `user_id`, `method`, `path`, `status`,
  `duration_ms`.
- `request_id` is generated (ULID) or taken from `X-Request-ID`. `correlation_id` propagates
  across the API -> Celery -> outbound HTTP boundary via task headers / request headers.
- No PII or secrets in logs (a processor redacts known-sensitive keys).
- Container stdout is shipped by the platform (CloudWatch / Cloud Logging / Loki).

## Metrics (Prometheus)

`/metrics` on the API (guarded — internal network / bearer). Exposed:

| Metric | Type |
|--------|------|
| `http_requests_total{method,route,status}` | counter |
| `http_request_duration_seconds{method,route}` | histogram |
| `http_requests_in_progress` | gauge |
| `db_pool_connections{state}` | gauge |
| `db_query_duration_seconds{operation}` | histogram |
| `redis_command_duration_seconds{command}` | histogram |
| `cache_events_total{result}` (hit/miss/error) | counter |
| `celery_task_duration_seconds{task,state}` | histogram |
| `celery_tasks_total{task,state}` | counter |
| `rate_limit_rejections_total{scope}` | counter |

Celery exports via `celery-exporter`; Redis via `redis_exporter`; Postgres via
`postgres_exporter`; Nginx via `nginx-prometheus-exporter`. `infrastructure/monitoring/` ships
Prometheus scrape config + Grafana dashboards (JSON) but the stack is opt-in
(`docker compose --profile monitoring up`).

## Tracing

OpenTelemetry SDK wired but disabled by default. Set `OTEL_EXPORTER_OTLP_ENDPOINT` to enable
auto-instrumentation of FastAPI, SQLAlchemy, Redis, httpx, Celery. Spans carry `request_id`.

## Error tracking

Sentry SDK initialized when `SENTRY_DSN` is set; `traces_sample_rate` and `environment` from
config; `before_send` scrubs headers/cookies/body.

## Health endpoints

| Endpoint | Purpose | Checks |
|----------|---------|--------|
| `/healthz` (liveness) | process is up | returns 200 unconditionally if the event loop responds |
| `/readyz` (readiness) | safe to receive traffic | DB `SELECT 1`, Redis `PING`, migrations at head |
| `/startupz` | slow-start gate for orchestrators | one-time deps warmed |

Nginx/K8s probe `/healthz`; the LB/Service uses `/readyz` to add/drain instances.

## Dashboards / alerts (recommended)

- API: p50/p95/p99 latency, error rate, RPS, in-flight.
- Saturation: DB pool usage, Redis memory, worker queue depth, CPU/mem.
- Alerts: error rate > 2% 5m, p99 > 1s 10m, `/readyz` failing, queue depth > N growing,
  DLQ non-empty.
