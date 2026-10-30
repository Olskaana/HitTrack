from fastapi import FastAPI
from fastapi.testclient import TestClient

from monitoring import HTTP_REQUESTS_IN_PROGRESS, collect_http_metrics, metrics_app


def create_monitoring_client():
    app = FastAPI()
    app.middleware("http")(collect_http_metrics)
    app.mount("/metrics", metrics_app)

    @app.get("/health")
    def health():
        return {"status": "ok"}

    @app.get("/explode")
    def explode():
        raise RuntimeError("expected test error")

    return TestClient(app, raise_server_exceptions=False)


def test_http_requests_are_counted_and_exposed_with_bounded_route_labels():
    with create_monitoring_client() as client:
        response = client.get("/health")
        scrape = client.get("/metrics")
        repeated_scrape = client.get("/metrics")

    assert response.status_code == 200
    assert scrape.status_code == 200
    assert repeated_scrape.status_code == 200
    assert (
        'hittrack_http_requests_total{method="GET",path="/health",status="200"}'
        in scrape.text
    )
    assert (
        'hittrack_http_request_duration_seconds_count{method="GET",path="/health"} 1.0'
        in scrape.text
    )
    assert "hittrack_http_requests_in_progress 0.0" in scrape.text
    assert 'path="/metrics"' not in repeated_scrape.text
    assert HTTP_REQUESTS_IN_PROGRESS._value.get() == 0


def test_http_errors_are_counted_and_in_progress_gauge_is_restored():
    with create_monitoring_client() as client:
        response = client.get("/explode")
        scrape = client.get("/metrics")

    assert response.status_code == 500
    assert (
        'hittrack_http_requests_total{method="GET",path="/explode",status="500"}'
        in scrape.text
    )
    assert HTTP_REQUESTS_IN_PROGRESS._value.get() == 0


def test_not_found_responses_are_counted():
    with create_monitoring_client() as client:
        response = client.get("/does-not-exist")
        scrape = client.get("/metrics")

    assert response.status_code == 404
    assert (
        'hittrack_http_requests_total{method="GET",path="unmatched",status="404"}'
        in scrape.text
    )
