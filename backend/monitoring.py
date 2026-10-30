import time

from prometheus_client import CollectorRegistry, Counter, Gauge, Histogram, make_asgi_app
from starlette.middleware.base import RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response


REGISTRY = CollectorRegistry(auto_describe=True)
HTTP_REQUESTS = Counter(
    "hittrack_http_requests_total",
    "Total HTTP requests handled by HitTrack",
    labelnames=("method", "path", "status"),
    registry=REGISTRY,
)
HTTP_REQUEST_DURATION = Histogram(
    "hittrack_http_request_duration_seconds",
    "HTTP request duration in seconds",
    labelnames=("method", "path"),
    registry=REGISTRY,
)
HTTP_REQUESTS_IN_PROGRESS = Gauge(
    "hittrack_http_requests_in_progress",
    "HTTP requests currently being handled by HitTrack",
    registry=REGISTRY,
)


async def collect_http_metrics(
    request: Request, call_next: RequestResponseEndpoint
) -> Response:
    root_path = request.scope.get("root_path", "").rstrip("/")
    if request.url.path.rstrip("/") == "/metrics" or root_path.endswith("/metrics"):
        return await call_next(request)

    HTTP_REQUESTS_IN_PROGRESS.inc()
    status = "500"
    started_at = time.perf_counter()
    try:
        response = await call_next(request)
        status = str(response.status_code)
        return response
    finally:
        route = request.scope.get("route")
        path = getattr(route, "path", "unmatched")
        HTTP_REQUESTS.labels(request.method, path, status).inc()
        HTTP_REQUEST_DURATION.labels(request.method, path).observe(time.perf_counter() - started_at)
        HTTP_REQUESTS_IN_PROGRESS.dec()


metrics_app = make_asgi_app(registry=REGISTRY)
