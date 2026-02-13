"""Tests for SelectiveGZipMiddleware in server/middleware/selective_gzip.py."""

import gzip

import pytest
from starlette.applications import Starlette
from starlette.responses import PlainTextResponse, Response, StreamingResponse
from starlette.routing import Route
from starlette.testclient import TestClient

from server.middleware.selective_gzip import SelectiveGZipMiddleware


def _make_app():
    """Build a mini Starlette app for testing the middleware."""

    async def small_response(request):
        return PlainTextResponse("short")

    async def large_response(request):
        body = "x" * 20000
        return PlainTextResponse(body)

    async def sse_response(request):
        async def event_stream():
            yield "data: hello\n\n"

        return StreamingResponse(event_stream(), media_type="text/event-stream")

    async def skip_path_response(request):
        return PlainTextResponse("x" * 20000)

    async def pre_encoded(request):
        body = gzip.compress(b"already compressed content")
        return Response(
            content=body,
            media_type="application/octet-stream",
            headers={"Content-Encoding": "gzip"},
        )

    app = Starlette(
        routes=[
            Route("/small", small_response),
            Route("/large", large_response),
            Route("/sse", sse_response),
            Route("/skip", skip_path_response),
            Route("/pre-encoded", pre_encoded),
        ],
    )
    app.add_middleware(
        SelectiveGZipMiddleware,
        minimum_size=500,
        skip_paths=("/skip",),
    )
    return app


@pytest.fixture
def client():
    return TestClient(_make_app())


class TestSelectiveGZipMiddleware:
    def test_small_not_compressed(self, client):
        resp = client.get("/small", headers={"Accept-Encoding": "gzip"})
        assert resp.status_code == 200
        assert "content-encoding" not in resp.headers

    def test_large_compressed(self, client):
        resp = client.get("/large", headers={"Accept-Encoding": "gzip"})
        assert resp.status_code == 200
        assert resp.headers.get("content-encoding") == "gzip"

    def test_sse_not_compressed(self, client):
        resp = client.get("/sse", headers={"Accept-Encoding": "gzip"})
        assert resp.status_code == 200
        assert resp.headers.get("content-encoding") != "gzip"

    def test_skip_paths_not_compressed(self, client):
        resp = client.get("/skip", headers={"Accept-Encoding": "gzip"})
        assert resp.status_code == 200
        assert "content-encoding" not in resp.headers

    def test_no_accept_encoding_skips_gzip(self, client):
        # Send Accept-Encoding: identity (no gzip) to verify middleware skips compression
        resp = client.get("/large", headers={"Accept-Encoding": "identity"})
        assert resp.status_code == 200
        # Middleware only compresses when "gzip" is in Accept-Encoding
        assert resp.headers.get("content-encoding") != "gzip"

    def test_pre_encoded_not_double_compressed(self, client):
        # Response already has Content-Encoding: gzip — middleware should pass through
        resp = client.get("/pre-encoded", headers={"Accept-Encoding": "gzip"})
        assert resp.status_code == 200
        # httpx auto-decompresses gzip, so verify we get the original content back
        assert resp.content == b"already compressed content"
