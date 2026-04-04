"""
Observability integration: OpenTelemetry tracing + Sentry error tracking.

D9 Observability 7→8: Adds distributed tracing and crash reporting to
complement existing Prometheus metrics and structlog.
"""

import os

import structlog

logger = structlog.get_logger()


def init_sentry() -> bool:
    """Initialize Sentry error tracking if SENTRY_DSN is configured."""
    dsn = os.getenv("SENTRY_DSN", "")
    if not dsn:
        logger.info("sentry_skipped", reason="SENTRY_DSN not set")
        return False

    try:
        import sentry_sdk
        from sentry_sdk.integrations.fastapi import FastApiIntegration
        from sentry_sdk.integrations.starlette import StarletteIntegration

        sentry_sdk.init(
            dsn=dsn,
            environment=os.getenv("ENVIRONMENT", "development"),
            release=f"enterprise-crypto@{os.getenv('APP_VERSION', '1.0.0')}",
            traces_sample_rate=float(os.getenv("SENTRY_TRACES_SAMPLE_RATE", "0.1")),
            profiles_sample_rate=float(os.getenv("SENTRY_PROFILES_SAMPLE_RATE", "0.1")),
            integrations=[
                FastApiIntegration(transaction_style="endpoint"),
                StarletteIntegration(transaction_style="endpoint"),
            ],
            send_default_pii=False,
        )
        logger.info("sentry_initialized", environment=os.getenv("ENVIRONMENT"))
        return True
    except ImportError:
        logger.warning("sentry_import_failed", reason="sentry-sdk not installed")
        return False
    except Exception as e:
        logger.error("sentry_init_failed", error=str(e))
        return False


def init_tracing(app) -> bool:
    """
    Initialize OpenTelemetry tracing for the FastAPI app.
    Exports traces to OTEL_EXPORTER_OTLP_ENDPOINT if configured.
    """
    endpoint = os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT", "")
    service_name = os.getenv("OTEL_SERVICE_NAME", "enterprise-crypto-backend")

    try:
        from opentelemetry import trace
        from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
        from opentelemetry.sdk.resources import SERVICE_NAME, Resource
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor

        resource = Resource.create({SERVICE_NAME: service_name})
        provider = TracerProvider(resource=resource)

        if endpoint:
            from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import (
                OTLPSpanExporter,
            )

            exporter = OTLPSpanExporter(endpoint=endpoint)
            provider.add_span_processor(BatchSpanProcessor(exporter))
            logger.info(
                "otel_otlp_exporter_configured",
                endpoint=endpoint,
                service=service_name,
            )
        else:
            logger.info(
                "otel_tracing_local_only",
                reason="OTEL_EXPORTER_OTLP_ENDPOINT not set",
                service=service_name,
            )

        trace.set_tracer_provider(provider)

        # Instrument FastAPI
        FastAPIInstrumentor.instrument_app(
            app,
            excluded_urls="health,ready,metrics,docs,redoc,openapi.json",
        )

        logger.info("otel_tracing_initialized", service=service_name)
        return True

    except ImportError:
        logger.warning(
            "otel_import_failed", reason="opentelemetry packages not installed"
        )
        return False
    except Exception as e:
        logger.error("otel_init_failed", error=str(e))
        return False
