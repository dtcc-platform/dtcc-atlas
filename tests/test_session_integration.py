"""End-to-end integration test for session workflow."""

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from server.upload.catalog import UploadCatalog


@pytest.fixture
def catalog(tmp_path: Path):
    return UploadCatalog(tmp_path / "catalog.db")


@pytest.fixture
def client(catalog):
    from server.session.routes import create_session_router
    import fastapi

    app = fastapi.FastAPI()
    router = create_session_router(catalog)
    app.include_router(router, prefix="/api/v1")
    return TestClient(app)


def test_full_session_lifecycle(client, catalog):
    """Test: create session -> update state -> update bookmarks -> add batch -> resume -> verify all state."""
    # 1. Create session
    resp = client.post("/api/v1/sessions")
    assert resp.status_code == 200
    session_id = resp.json()["id"]
    assert len(session_id) == 8

    # 2. Update UI state
    state = {"map": {"center": [11.97, 57.71], "zoom": 14, "pitch": 0, "bearing": 0}, "ui": {"activePanel": "uploads"}}
    resp = client.patch(f"/api/v1/sessions/{session_id}/state", json=state)
    assert resp.status_code == 200

    # 3. Update bookmarks
    bookmarks = [
        {"id": "bm1", "name": "Gothenburg", "bbox": {"minX": 11.0, "minY": 57.0, "maxX": 12.0, "maxY": 58.0, "crs": "EPSG:3006"}, "createdAt": 1700000000}
    ]
    resp = client.patch(f"/api/v1/sessions/{session_id}/bookmarks", json=bookmarks)
    assert resp.status_code == 200

    # 4. Create a batch linked to session
    catalog.create_batch(
        batch_id="batch-integration",
        name="Integration Test Batch",
        root_dir="/tmp/test",
        file_count=2,
        total_bytes=1024,
        session_id=session_id,
    )

    # 5. Resume session (simulating new browser visit)
    resp = client.get(f"/api/v1/sessions/{session_id}")
    assert resp.status_code == 200
    data = resp.json()

    # Verify everything was restored
    assert data["id"] == session_id
    assert data["state"]["map"]["center"] == [11.97, 57.71]
    assert data["state"]["map"]["zoom"] == 14
    assert data["state"]["ui"]["activePanel"] == "uploads"
    assert len(data["bookmarks"]) == 1
    assert data["bookmarks"][0]["name"] == "Gothenburg"
    assert len(data["batches"]) == 1
    assert data["batches"][0]["id"] == "batch-integration"
    assert data["batches"][0]["name"] == "Integration Test Batch"


def test_invalid_session_redirects_to_new(client):
    """Verify 404 for nonexistent session (frontend would create new)."""
    resp = client.get("/api/v1/sessions/nonexist1")
    assert resp.status_code == 404


def test_multiple_sessions_isolated(client, catalog):
    """Two sessions don't see each other's data."""
    # Create two sessions
    s1 = client.post("/api/v1/sessions").json()["id"]
    s2 = client.post("/api/v1/sessions").json()["id"]

    # Add batch to session 1
    catalog.create_batch(batch_id="b1", name="B1", root_dir="/tmp", file_count=0, total_bytes=0, session_id=s1)

    # Add batch to session 2
    catalog.create_batch(batch_id="b2", name="B2", root_dir="/tmp", file_count=0, total_bytes=0, session_id=s2)

    # Verify isolation
    data1 = client.get(f"/api/v1/sessions/{s1}").json()
    data2 = client.get(f"/api/v1/sessions/{s2}").json()

    assert len(data1["batches"]) == 1
    assert data1["batches"][0]["id"] == "b1"
    assert len(data2["batches"]) == 1
    assert data2["batches"][0]["id"] == "b2"
