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
