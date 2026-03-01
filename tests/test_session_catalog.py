"""Tests for session management in UploadCatalog."""

import json
import time
from pathlib import Path

from server.upload.catalog import UploadCatalog


def test_create_and_get_session(tmp_path: Path):
    """Create a session and verify the ID length and round-trip fields."""
    catalog = UploadCatalog(tmp_path / "catalog.db")

    session_id = catalog.create_session()

    # ID should be 8 characters (secrets.token_urlsafe(6) produces 8 chars)
    assert isinstance(session_id, str)
    assert len(session_id) == 8

    session = catalog.get_session(session_id)
    assert session is not None
    assert session["id"] == session_id
    assert session["created_at"] is not None
    assert session["last_accessed"] is not None
    assert json.loads(session["state_json"]) == {}
    assert json.loads(session["bookmarks_json"]) == []


def test_get_nonexistent_session(tmp_path: Path):
    """Getting a session that does not exist returns None."""
    catalog = UploadCatalog(tmp_path / "catalog.db")

    result = catalog.get_session("no-such-id")
    assert result is None


def test_update_session_state(tmp_path: Path):
    """Update state_json and verify the round-trip."""
    catalog = UploadCatalog(tmp_path / "catalog.db")
    session_id = catalog.create_session()

    state = {"step": 2, "selected": ["a", "b"]}
    catalog.update_session_state(session_id, state)

    session = catalog.get_session(session_id)
    assert json.loads(session["state_json"]) == state


def test_update_session_bookmarks(tmp_path: Path):
    """Update bookmarks_json and verify the round-trip."""
    catalog = UploadCatalog(tmp_path / "catalog.db")
    session_id = catalog.create_session()

    bookmarks = [{"lat": 57.7, "lng": 11.97, "label": "Gothenburg"}]
    catalog.update_session_bookmarks(session_id, bookmarks)

    session = catalog.get_session(session_id)
    assert json.loads(session["bookmarks_json"]) == bookmarks


def test_session_last_accessed_updates(tmp_path: Path):
    """touch_session should advance the last_accessed timestamp."""
    catalog = UploadCatalog(tmp_path / "catalog.db")
    session_id = catalog.create_session()

    session_before = catalog.get_session(session_id)
    ts_before = session_before["last_accessed"]

    # Small delay to guarantee the timestamp differs
    time.sleep(0.05)

    catalog.touch_session(session_id)

    session_after = catalog.get_session(session_id)
    ts_after = session_after["last_accessed"]

    assert ts_after > ts_before


def test_session_id_uniqueness(tmp_path: Path):
    """Creating 20 sessions should yield 20 unique IDs."""
    catalog = UploadCatalog(tmp_path / "catalog.db")

    ids = {catalog.create_session() for _ in range(20)}
    assert len(ids) == 20


# ------------------------------------------------------------------
# Task 2: session_id on upload_batches
# ------------------------------------------------------------------


def _make_batch(catalog: UploadCatalog, batch_id: str, **kwargs) -> None:
    """Helper to create a minimal batch with sensible defaults."""
    catalog.create_batch(
        batch_id=batch_id,
        name=kwargs.get("name", "Test Batch"),
        root_dir=kwargs.get("root_dir", "/tmp/fake"),
        file_count=kwargs.get("file_count", 0),
        total_bytes=kwargs.get("total_bytes", 0),
        status=kwargs.get("status", "uploaded"),
        session_id=kwargs.get("session_id"),
    )


def test_create_batch_with_session(tmp_path: Path):
    """Creating a batch with session_id stores the value correctly."""
    catalog = UploadCatalog(tmp_path / "catalog.db")

    session_id = catalog.create_session()
    _make_batch(catalog, "batch-s1", session_id=session_id)

    batch = catalog.get_batch("batch-s1")
    assert batch is not None
    assert batch["session_id"] == session_id


def test_list_batches_by_session(tmp_path: Path):
    """list_batches_by_session returns only batches belonging to that session."""
    catalog = UploadCatalog(tmp_path / "catalog.db")

    s1 = catalog.create_session()
    s2 = catalog.create_session()

    _make_batch(catalog, "b1", session_id=s1)
    _make_batch(catalog, "b2", session_id=s1)
    _make_batch(catalog, "b3", session_id=s2)

    s1_batches = catalog.list_batches_by_session(s1)
    s2_batches = catalog.list_batches_by_session(s2)

    assert len(s1_batches) == 2
    assert len(s2_batches) == 1

    s1_ids = {b["id"] for b in s1_batches}
    assert s1_ids == {"b1", "b2"}
    assert s2_batches[0]["id"] == "b3"

    # Results should be ordered by created_at DESC (most recent first).
    # b2 was created after b1, so it should appear first.
    assert s1_batches[0]["id"] == "b2"
    assert s1_batches[1]["id"] == "b1"


def test_create_batch_without_session_backward_compat(tmp_path: Path):
    """Creating a batch without session_id defaults to None (backward compat)."""
    catalog = UploadCatalog(tmp_path / "catalog.db")

    catalog.create_batch(
        batch_id="batch-no-session",
        name="Legacy Batch",
        root_dir="/tmp/fake",
        file_count=1,
        total_bytes=42,
    )

    batch = catalog.get_batch("batch-no-session")
    assert batch is not None
    assert batch["session_id"] is None
