"""Prometheus metric definitions. Import-safe; cheap no-ops when disabled."""

from __future__ import annotations

import contextlib

from prometheus_client import CollectorRegistry, Counter, Gauge, Histogram, multiprocess

registry = CollectorRegistry()
with contextlib.suppress(Exception):  # gunicorn multi-worker sets PROMETHEUS_MULTIPROC_DIR
    multiprocess.MultiProcessCollector(registry)

http_requests_total = Counter(
    "http_requests_total", "Total HTTP requests", ["method", "route", "status"], registry=registry
)
http_request_duration_seconds = Histogram(
    "http_request_duration_seconds",
    "HTTP request latency",
    ["method", "route"],
    buckets=(0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10),
    registry=registry,
)
http_requests_in_progress = Gauge(
    "http_requests_in_progress", "In-flight HTTP requests", ["method", "route"], registry=registry
)
cache_events_total = Counter("cache_events_total", "Cache outcomes", ["result"], registry=registry)
rate_limit_rejections_total = Counter(
    "rate_limit_rejections_total",
    "Requests rejected by the rate limiter",
    ["scope"],
    registry=registry,
)
db_pool_connections = Gauge(
    "db_pool_connections", "DB pool connections", ["state"], registry=registry
)
celery_tasks_total = Counter(
    "celery_tasks_total", "Celery task outcomes", ["task", "state"], registry=registry
)
