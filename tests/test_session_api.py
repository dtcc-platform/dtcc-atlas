"""Tests for session API routes (Task 3)."""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from server.upload.catalog import UploadCatalog


@pytest.fixture()
def catalog(tmp_path: Path):
    return UploadCatalog(tmp_path / "catalog.db")


@pytest.fixture()
def client(catalog: UploadCatalog):
    from server.session.routes import create_session_router

    app = FastAPI()
    router = create_session_router(catalog)
    app.include_router(router, prefix="/api/v1")
    return TestClient(app)


def test_create_session(client: TestClient):
    """POST /api/v1/sessions returns 200 with an 8-char id and created_at."""
    resp = client.post("/api/v1/sessions")
    assert resp.status_code == 200
    data = resp.json()
    assert "id" in data
    assert len(data["id"]) == 8
    assert "created_at" in data


def test_get_session(client: TestClient):
    """Create then GET returns session with id, state, bookmarks, batches."""
    create_resp = client.post("/api/v1/sessions")
    session_id = create_resp.json()["id"]

    resp = client.get(f"/api/v1/sessions/{session_id}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == session_id
    assert "created_at" in data
    assert "last_accessed" in data
    assert data["state"] == {}
    assert data["bookmarks"] == []
    assert data["batches"] == []


def test_get_nonexistent_session(client: TestClient):
    """GET with an unknown session id returns 404."""
    resp = client.get("/api/v1/sessions/no-exist")
    assert resp.status_code == 404
    assert "not found" in resp.json()["detail"].lower()


def test_update_session_state(client: TestClient):
    """Create, PATCH state, then GET returns the updated state."""
    create_resp = client.post("/api/v1/sessions")
    session_id = create_resp.json()["id"]

    new_state = {"step": 3, "zoom": 12, "center": [57.7, 11.97]}
    patch_resp = client.patch(
        f"/api/v1/sessions/{session_id}/state", json=new_state
    )
    assert patch_resp.status_code == 200
    assert patch_resp.json() == {"ok": True}

    get_resp = client.get(f"/api/v1/sessions/{session_id}")
    assert get_resp.json()["state"] == new_state


def test_update_session_bookmarks(client: TestClient):
    """Create, PATCH bookmarks, then GET returns the updated bookmarks."""
    create_resp = client.post("/api/v1/sessions")
    session_id = create_resp.json()["id"]

    new_bookmarks = [
        {"lat": 57.7, "lng": 11.97, "label": "Gothenburg"},
        {"lat": 59.33, "lng": 18.07, "label": "Stockholm"},
    ]
    patch_resp = client.patch(
        f"/api/v1/sessions/{session_id}/bookmarks", json=new_bookmarks
    )
    assert patch_resp.status_code == 200
    assert patch_resp.json() == {"ok": True}

    get_resp = client.get(f"/api/v1/sessions/{session_id}")
    assert get_resp.json()["bookmarks"] == new_bookmarks


def test_update_state_nonexistent_session(client: TestClient):
    """PATCH state on a nonexistent session returns 404."""
    resp = client.patch("/api/v1/sessions/no-exist/state", json={"a": 1})
    assert resp.status_code == 404


def test_update_bookmarks_nonexistent_session(client: TestClient):
    """PATCH bookmarks on a nonexistent session returns 404."""
    resp = client.patch("/api/v1/sessions/no-exist/bookmarks", json=[])
    assert resp.status_code == 404
