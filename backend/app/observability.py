"""Wire Sentry + OpenTelemetry only when their env vars are set. Inert otherwise."""

from __future__ import annotations

from app.core.config import settings
from app.core.logging import get_logger

log = get_logger("app.obs")


def init_observability() -> None:
    _init_sentry()
    _init_otel()


def _init_sentry() -> None:
    if not settings.SENTRY_DSN:
        return
    import sentry_sdk

    sentry_sdk.init(
        dsn=settings.SENTRY_DSN,
        environment=settings.ENVIRONMENT.value,
        traces_sample_rate=0.1,
        send_default_pii=False,
    )
    log.info("sentry_enabled")


def _init_otel() -> None:
    if not settings.OTEL_EXPORTER_OTLP_ENDPOINT:
        return
    try:
        from opentelemetry import trace
        from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
        from opentelemetry.sdk.resources import Resource
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor

        provider = TracerProvider(resource=Resource.create({"service.name": "acme-api"}))
        provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter()))
        trace.set_tracer_provider(provider)
        log.info("otel_enabled")
    except Exception as exc:  # pragma: no cover
        log.warning("otel_init_failed", error=str(exc))
