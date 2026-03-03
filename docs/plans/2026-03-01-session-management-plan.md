# Session Management Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add hash-based session management so users can resume their full workspace (uploads, jobs, bookmarks, map state) by revisiting a URL like `/s/a3f8b2c1`.

**Architecture:** Server-side session store in SQLite. New `sessions` table with 8-char hash IDs. All API calls scoped via `X-Session-Id` header. Frontend auto-creates sessions on first visit, redirects to `/s/{hash}`, and restores state on return. Existing upload_batches table gains a `session_id` FK. Jobs scoped in-memory.

**Tech Stack:** Python/FastAPI (backend), Svelte 5/TypeScript (frontend), SQLite (storage), `secrets.token_urlsafe` (hash generation)

**Design doc:** `docs/plans/2026-03-01-session-management-design.md`

---

## Task 1: Add `sessions` table to UploadCatalog

**Files:**
- Modify: `server/upload/catalog.py:31-126` (schema + migrations)
- Test: `tests/test_session_catalog.py` (create new)

**Step 1: Write the failing test**

Create `tests/test_session_catalog.py`:

```python
"""Tests for session management in SQLite catalog."""

import json
from pathlib import Path

from server.upload.catalog import UploadCatalog


def test_create_and_get_session(tmp_path: Path):
    catalog = UploadCatalog(tmp_path / "catalog.db")

    session_id = catalog.create_session()
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
    catalog = UploadCatalog(tmp_path / "catalog.db")
    assert catalog.get_session("nonexist") is None


def test_update_session_state(tmp_path: Path):
    catalog = UploadCatalog(tmp_path / "catalog.db")

    session_id = catalog.create_session()
    state = {"map": {"center": [11.97, 57.71], "zoom": 14}, "ui": {"activePanel": "datasets"}}
    catalog.update_session_state(session_id, state)

    session = catalog.get_session(session_id)
    assert json.loads(session["state_json"]) == state


def test_update_session_bookmarks(tmp_path: Path):
    catalog = UploadCatalog(tmp_path / "catalog.db")

    session_id = catalog.create_session()
    bookmarks = [{"id": "b1", "name": "Test", "bbox": {"minX": 0, "minY": 0, "maxX": 1, "maxY": 1}}]
    catalog.update_session_bookmarks(session_id, bookmarks)

    session = catalog.get_session(session_id)
    assert json.loads(session["bookmarks_json"]) == bookmarks


def test_session_last_accessed_updates(tmp_path: Path):
    catalog = UploadCatalog(tmp_path / "catalog.db")

    session_id = catalog.create_session()
    session1 = catalog.get_session(session_id)

    catalog.touch_session(session_id)
    session2 = catalog.get_session(session_id)

    assert session2["last_accessed"] >= session1["last_accessed"]


def test_session_id_uniqueness(tmp_path: Path):
    catalog = UploadCatalog(tmp_path / "catalog.db")
    ids = {catalog.create_session() for _ in range(20)}
    assert len(ids) == 20  # All unique
```

**Step 2: Run test to verify it fails**

Run: `pytest tests/test_session_catalog.py -v`
Expected: FAIL — `UploadCatalog` has no `create_session` method.

**Step 3: Implement session methods in UploadCatalog**

In `server/upload/catalog.py`, add to the schema in `_init_schema()` (after the `uploaded_datasets` CREATE TABLE, around line 100):

```python
CREATE TABLE IF NOT EXISTS sessions (
    id             TEXT PRIMARY KEY,
    created_at     TEXT NOT NULL,
    last_accessed  TEXT NOT NULL,
    state_json     TEXT NOT NULL DEFAULT '{}',
    bookmarks_json TEXT NOT NULL DEFAULT '[]'
);
```

Add these methods to the `UploadCatalog` class (after the existing methods):

```python
def create_session(self) -> str:
    """Create a new session with a unique 8-char hash. Returns the session ID."""
    import secrets

    while True:
        session_id = secrets.token_urlsafe(6)  # 8 chars
        with self._lock, self._connect() as conn:
            existing = conn.execute(
                "SELECT 1 FROM sessions WHERE id = ?", (session_id,)
            ).fetchone()
            if existing:
                continue
            now = _utc_now_iso()
            conn.execute(
                """
                INSERT INTO sessions (id, created_at, last_accessed, state_json, bookmarks_json)
                VALUES (?, ?, ?, '{}', '[]')
                """,
                (session_id, now, now),
            )
            return session_id

def get_session(self, session_id: str) -> dict[str, Any] | None:
    """Fetch a session by ID. Returns None if not found."""
    with self._connect() as conn:
        row = conn.execute(
            "SELECT * FROM sessions WHERE id = ?", (session_id,)
        ).fetchone()
    return dict(row) if row else None

def touch_session(self, session_id: str) -> None:
    """Update last_accessed timestamp."""
    with self._lock, self._connect() as conn:
        conn.execute(
            "UPDATE sessions SET last_accessed = ? WHERE id = ?",
            (_utc_now_iso(), session_id),
        )

def update_session_state(self, session_id: str, state: Any) -> None:
    """Update the UI state JSON blob."""
    with self._lock, self._connect() as conn:
        conn.execute(
            "UPDATE sessions SET state_json = ?, last_accessed = ? WHERE id = ?",
            (json.dumps(state), _utc_now_iso(), session_id),
        )

def update_session_bookmarks(self, session_id: str, bookmarks: Any) -> None:
    """Update the bookmarks JSON blob."""
    with self._lock, self._connect() as conn:
        conn.execute(
            "UPDATE sessions SET bookmarks_json = ?, last_accessed = ? WHERE id = ?",
            (json.dumps(bookmarks), _utc_now_iso(), session_id),
        )
```

**Step 4: Run test to verify it passes**

Run: `pytest tests/test_session_catalog.py -v`
Expected: All 6 tests PASS.

**Step 5: Commit**

```bash
git add server/upload/catalog.py tests/test_session_catalog.py
git commit -m "feat: add sessions table and CRUD methods to UploadCatalog"
```

---

## Task 2: Add `session_id` column to `upload_batches`

**Files:**
- Modify: `server/upload/catalog.py:111-126` (migration block)
- Modify: `server/upload/catalog.py:128-146` (`create_batch` method)
- Test: `tests/test_session_catalog.py` (add tests)

**Step 1: Write the failing test**

Append to `tests/test_session_catalog.py`:

```python
def test_create_batch_with_session(tmp_path: Path):
    catalog = UploadCatalog(tmp_path / "catalog.db")
    session_id = catalog.create_session()

    catalog.create_batch(
        batch_id="batch-s1",
        name="Session Batch",
        root_dir=str(tmp_path),
        file_count=1,
        total_bytes=100,
        session_id=session_id,
    )

    batch = catalog.get_batch("batch-s1")
    assert batch["session_id"] == session_id


def test_list_batches_by_session(tmp_path: Path):
    catalog = UploadCatalog(tmp_path / "catalog.db")
    s1 = catalog.create_session()
    s2 = catalog.create_session()

    catalog.create_batch(batch_id="b1", name="B1", root_dir=str(tmp_path), file_count=0, total_bytes=0, session_id=s1)
    catalog.create_batch(batch_id="b2", name="B2", root_dir=str(tmp_path), file_count=0, total_bytes=0, session_id=s2)
    catalog.create_batch(batch_id="b3", name="B3", root_dir=str(tmp_path), file_count=0, total_bytes=0, session_id=s1)

    batches = catalog.list_batches_by_session(s1)
    assert len(batches) == 2
    assert {b["id"] for b in batches} == {"b1", "b3"}


def test_create_batch_without_session_backward_compat(tmp_path: Path):
    catalog = UploadCatalog(tmp_path / "catalog.db")

    catalog.create_batch(
        batch_id="batch-noSession",
        name="No Session",
        root_dir=str(tmp_path),
        file_count=0,
        total_bytes=0,
    )

    batch = catalog.get_batch("batch-noSession")
    assert batch["session_id"] is None
```

**Step 2: Run test to verify it fails**

Run: `pytest tests/test_session_catalog.py::test_create_batch_with_session -v`
Expected: FAIL — `create_batch()` doesn't accept `session_id`.

**Step 3: Implement**

1. Add migration in `_init_schema()` (append to `_migrations` list around line 121):
```python
"ALTER TABLE upload_batches ADD COLUMN session_id TEXT",
```

2. Modify `create_batch()` signature and INSERT:
```python
def create_batch(
    self,
    batch_id: str,
    name: str | None,
    root_dir: str,
    file_count: int,
    total_bytes: int,
    status: str = "uploaded",
    session_id: str | None = None,
) -> None:
    created_at = _utc_now_iso()
    with self._lock, self._connect() as conn:
        conn.execute(
            """
            INSERT INTO upload_batches
            (id, name, created_at, status, root_dir, file_count, total_bytes, session_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (batch_id, name, created_at, status, root_dir, file_count, total_bytes, session_id),
        )
```

3. Add `list_batches_by_session()` method:
```python
def list_batches_by_session(self, session_id: str) -> list[dict[str, Any]]:
    """List all batches belonging to a session, newest first."""
    with self._connect() as conn:
        rows = conn.execute(
            "SELECT * FROM upload_batches WHERE session_id = ? ORDER BY created_at DESC",
            (session_id,),
        ).fetchall()
    return [dict(r) for r in rows]
```

**Step 4: Run tests**

Run: `pytest tests/test_session_catalog.py -v`
Expected: All tests PASS.

Also run existing catalog tests to verify backward compat:
Run: `pytest tests/test_upload_catalog.py -v`
Expected: All existing tests still PASS (they don't pass session_id, so it defaults to None).

**Step 5: Commit**

```bash
git add server/upload/catalog.py tests/test_session_catalog.py
git commit -m "feat: add session_id column to upload_batches with migration"
```

---

## Task 3: Create session API routes

**Files:**
- Create: `server/session/__init__.py`
- Create: `server/session/routes.py`
- Test: `tests/test_session_api.py` (create new)

**Step 1: Write the failing test**

Create `tests/test_session_api.py`:

```python
"""Tests for session API endpoints."""

from unittest.mock import patch
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


def test_create_session(client):
    resp = client.post("/api/v1/sessions")
    assert resp.status_code == 200
    data = resp.json()
    assert "id" in data
    assert len(data["id"]) == 8
    assert "created_at" in data


def test_get_session(client):
    create_resp = client.post("/api/v1/sessions")
    session_id = create_resp.json()["id"]

    resp = client.get(f"/api/v1/sessions/{session_id}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == session_id
    assert "state" in data
    assert "bookmarks" in data
    assert "batches" in data


def test_get_nonexistent_session(client):
    resp = client.get("/api/v1/sessions/nonexist")
    assert resp.status_code == 404


def test_update_session_state(client):
    create_resp = client.post("/api/v1/sessions")
    session_id = create_resp.json()["id"]

    state = {"map": {"center": [11.97, 57.71], "zoom": 14}}
    resp = client.patch(f"/api/v1/sessions/{session_id}/state", json=state)
    assert resp.status_code == 200

    get_resp = client.get(f"/api/v1/sessions/{session_id}")
    assert get_resp.json()["state"] == state
```

**Step 2: Run test to verify it fails**

Run: `pytest tests/test_session_api.py -v`
Expected: FAIL — `server.session` module doesn't exist.

**Step 3: Implement session routes**

Create `server/session/__init__.py`:
```python
"""Session management routes."""

from .routes import create_session_router

__all__ = ["create_session_router"]
```

Create `server/session/routes.py`:
```python
"""FastAPI routes for session management."""

from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from server.upload.catalog import UploadCatalog


def create_session_router(catalog: UploadCatalog) -> APIRouter:
    router = APIRouter(prefix="/sessions", tags=["sessions"])

    @router.post("")
    async def create_session():
        """Create a new session and return its hash."""
        session_id = catalog.create_session()
        session = catalog.get_session(session_id)
        return {"id": session_id, "created_at": session["created_at"]}

    @router.get("/{session_id}")
    async def get_session(session_id: str):
        """Get full session state including linked batches."""
        session = catalog.get_session(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        catalog.touch_session(session_id)
        batches = catalog.list_batches_by_session(session_id)

        return {
            "id": session["id"],
            "created_at": session["created_at"],
            "last_accessed": session["last_accessed"],
            "state": json.loads(session["state_json"]),
            "bookmarks": json.loads(session["bookmarks_json"]),
            "batches": batches,
        }

    @router.patch("/{session_id}/state")
    async def update_state(session_id: str, request: Request):
        """Update UI state (map position, active panel, etc.)."""
        session = catalog.get_session(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        state = await request.json()
        catalog.update_session_state(session_id, state)
        return {"ok": True}

    @router.patch("/{session_id}/bookmarks")
    async def update_bookmarks(session_id: str, request: Request):
        """Update bookmarks array."""
        session = catalog.get_session(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        bookmarks = await request.json()
        catalog.update_session_bookmarks(session_id, bookmarks)
        return {"ok": True}

    return router
```

**Step 4: Run tests**

Run: `pytest tests/test_session_api.py -v`
Expected: All 4 tests PASS.

**Step 5: Commit**

```bash
git add server/session/__init__.py server/session/routes.py tests/test_session_api.py
git commit -m "feat: add session API routes (create, get, update state/bookmarks)"
```

---

## Task 4: Wire session router into FastAPI app + pass session_id through uploads

**Files:**
- Modify: `server/main.py:23-34` (imports), `server/main.py:402-419` (router mounting)
- Modify: `server/upload/routes.py:60-180` (pass session_id to create_batch)
- Modify: `server/upload/service.py:16-23` (expose catalog to session router)
- Test: `tests/test_session_api.py` (add integration test)

**Step 1: Write the failing test**

Append to `tests/test_session_api.py`:

```python
def test_upload_batch_linked_to_session(client, catalog):
    # Create session
    create_resp = client.post("/api/v1/sessions")
    session_id = create_resp.json()["id"]

    # Simulate creating a batch with session_id
    catalog.create_batch(
        batch_id="test-batch",
        name="Test",
        root_dir="/tmp",
        file_count=0,
        total_bytes=0,
        session_id=session_id,
    )

    # Verify batch appears in session
    resp = client.get(f"/api/v1/sessions/{session_id}")
    data = resp.json()
    assert len(data["batches"]) == 1
    assert data["batches"][0]["id"] == "test-batch"
```

**Step 2: Run test to verify it passes (this one should already work)**

Run: `pytest tests/test_session_api.py::test_upload_batch_linked_to_session -v`
Expected: PASS (catalog methods already support this).

**Step 3: Wire into main.py**

In `server/main.py`, add import (around line 27):
```python
from server.session import create_session_router
```

Add router mounting (after upload router, around line 419):
```python
# Mount session router
session_router = create_session_router(get_catalog())
app.include_router(session_router, prefix="/api/v1")
print("Session router mounted at /api/v1/sessions")
```

This requires importing `get_catalog` from `server.upload.service` — add to the import block at line 27:
```python
from server.upload import (
    create_upload_router,
    ensure_catalog_directories,
    list_uploaded_datasets_for_api,
    uploaded_dataset_schema,
    process_uploaded_dataset_download,
    get_catalog,
)
```

Note: `get_catalog` is already exported from `server/upload/service.py` — verify it's in `server/upload/__init__.py`.

**Step 4: Modify upload routes to accept X-Session-Id header**

In `server/upload/routes.py`, modify `create_batch` endpoint to read session header:

```python
from fastapi import APIRouter, File, Form, Header, HTTPException, UploadFile

# ... inside create_upload_router():

@router.post("/batches")
async def create_batch(
    batch_name: str | None = Form(default=None),
    files: list[UploadFile] = File(...),
    x_session_id: str | None = Header(default=None),
):
    # ... existing logic unchanged ...

    catalog.create_batch(
        batch_id=batch_id,
        name=clean_batch_name,
        root_dir=str(batch_root.resolve()),
        file_count=len(file_records),
        total_bytes=total_bytes,
        status="uploaded",
        session_id=x_session_id,
    )
```

**Step 5: Run all tests**

Run: `pytest tests/ -v`
Expected: All tests PASS.

**Step 6: Commit**

```bash
git add server/main.py server/upload/routes.py server/upload/__init__.py
git commit -m "feat: wire session router into app, pass session_id from upload header"
```

---

## Task 5: Add session_id scoping to jobs

**Files:**
- Modify: `server/jobs/models.py:17-45` (add session_id field to Job)
- Modify: `server/jobs/manager.py:69-102` (accept session_id in submit)
- Modify: `server/jobs/routes.py:53-72` (read X-Session-Id header)
- Modify: `server/jobs/routes.py:146-191` (scope SSE to session)
- Modify: `server/jobs/routes.py:193-211` (filter list by session)
- Test: `tests/test_session_jobs.py` (create new)

**Step 1: Write the failing test**

Create `tests/test_session_jobs.py`:

```python
"""Tests for session-scoped job management."""

from server.jobs.models import Job


def test_job_has_session_id():
    job = Job(dataset="test", session_id="abc123")
    assert job.session_id == "abc123"
    d = job.to_dict()
    assert d["session_id"] == "abc123"


def test_job_session_id_defaults_none():
    job = Job(dataset="test")
    assert job.session_id is None
```

**Step 2: Run test to verify it fails**

Run: `pytest tests/test_session_jobs.py -v`
Expected: FAIL — Job doesn't accept `session_id`.

**Step 3: Implement**

In `server/jobs/models.py`, add field to `Job` dataclass (after `progress` field):
```python
session_id: Optional[str] = None
```

And add to `to_dict()` return:
```python
"session_id": self.session_id,
```

In `server/jobs/manager.py`, modify `submit()` to accept `session_id`:
```python
async def submit(
    self,
    dataset: str,
    params: Dict[str, Any],
    filename: Optional[str] = None,
    session_id: Optional[str] = None,
) -> Job:
    job = Job(dataset=dataset, params=params, filename=filename or dataset, session_id=session_id)
    # ... rest unchanged
```

Add `list_jobs_by_session()` method to `JobManager`:
```python
def list_jobs_by_session(self, session_id: str) -> list[Job]:
    """Return jobs for a given session, newest first."""
    with self._lock:
        return sorted(
            [j for j in self._jobs.values() if j.session_id == session_id],
            key=lambda j: j.created_at,
            reverse=True,
        )
```

In `server/jobs/routes.py`, modify `submit_job` to read session header:
```python
from fastapi import APIRouter, Header, HTTPException, Request

@router.post("/submit", response_model=JobSubmitResponse)
async def submit_job(request: JobSubmitRequest, x_session_id: str | None = Header(default=None)):
    params = {"bounds": request.bounds, **request.parameters}
    job = await job_manager.submit(
        dataset=request.dataset,
        params=params,
        filename=request.filename,
        session_id=x_session_id,
    )
    return JobSubmitResponse(job_id=job.id, status=job.status.value)
```

Modify `list` endpoint to filter by session:
```python
@router.get("/list")
async def list_jobs(x_session_id: str | None = Header(default=None)):
    if x_session_id:
        jobs = job_manager.list_jobs_by_session(x_session_id)
    else:
        jobs = job_manager.list_recent_jobs()
    # ... rest of formatting unchanged
```

Modify SSE `events` endpoint to scope by session:
```python
@router.get("/events")
async def job_events(request: Request, x_session_id: str | None = Header(default=None)):
    async def event_generator():
        queue = job_manager.subscribe()
        try:
            yield f"event: connected\ndata: {{\"status\": \"connected\"}}\n\n"
            while True:
                if await request.is_disconnected():
                    break
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=30.0)
                    # Filter events by session if header present
                    event_session = event["data"].get("session_id")
                    if x_session_id and event_session and event_session != x_session_id:
                        continue
                    event_type = event["type"]
                    event_data = json.dumps(event["data"])
                    yield f"event: {event_type}\ndata: {event_data}\n\n"
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"
        finally:
            job_manager.unsubscribe(queue)
    # ... StreamingResponse unchanged
```

**Step 4: Run tests**

Run: `pytest tests/test_session_jobs.py tests/test_job_models.py -v`
Expected: All PASS.

**Step 5: Commit**

```bash
git add server/jobs/models.py server/jobs/manager.py server/jobs/routes.py tests/test_session_jobs.py
git commit -m "feat: add session_id scoping to jobs (submit, list, SSE filter)"
```

---

## Task 6: Create frontend session store and API client

**Files:**
- Create: `frontend/src/lib/stores/session.ts`
- Create: `frontend/src/lib/api/session-api.ts`

**Step 1: Create session API client**

Create `frontend/src/lib/api/session-api.ts`:

```typescript
import { API_BASE_URL } from '../config'

export interface SessionData {
  id: string
  created_at: string
  last_accessed: string
  state: {
    map?: {
      center?: [number, number]
      zoom?: number
      pitch?: number
      bearing?: number
      is3D?: boolean
    }
    ui?: {
      activePanel?: string | null
    }
  }
  bookmarks: Array<{
    id: string
    name: string
    bbox: { minX: number; minY: number; maxX: number; maxY: number; crs: string }
    createdAt: number
    color?: string
  }>
  batches: Array<Record<string, unknown>>
}

export async function createSession(): Promise<{ id: string; created_at: string }> {
  const resp = await fetch(`${API_BASE_URL}/sessions`, { method: 'POST' })
  if (!resp.ok) throw new Error(`Failed to create session: ${resp.status}`)
  return resp.json()
}

export async function getSession(sessionId: string): Promise<SessionData | null> {
  const resp = await fetch(`${API_BASE_URL}/sessions/${sessionId}`)
  if (resp.status === 404) return null
  if (!resp.ok) throw new Error(`Failed to get session: ${resp.status}`)
  return resp.json()
}

export async function updateSessionState(sessionId: string, state: Record<string, unknown>): Promise<void> {
  await fetch(`${API_BASE_URL}/sessions/${sessionId}/state`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(state),
  })
}

export async function updateSessionBookmarks(sessionId: string, bookmarks: unknown[]): Promise<void> {
  await fetch(`${API_BASE_URL}/sessions/${sessionId}/bookmarks`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(bookmarks),
  })
}
```

**Step 2: Create session store**

Create `frontend/src/lib/stores/session.ts`:

```typescript
import { writable } from 'svelte/store'

/**
 * The current session ID extracted from the URL /s/{hash}.
 * Set during app initialization, used by all API calls.
 */
export const sessionId = writable<string | null>(null)
```

**Step 3: Commit**

```bash
git add frontend/src/lib/api/session-api.ts frontend/src/lib/stores/session.ts
git commit -m "feat: add frontend session store and API client"
```

---

## Task 7: Add X-Session-Id header to all frontend API calls

**Files:**
- Create: `frontend/src/lib/api/fetch.ts` (shared fetch wrapper)
- Modify: `frontend/src/lib/api/upload-api.ts` (use wrapper)
- Modify: `frontend/src/lib/services/job-service.ts:134-184` (pass session header to SSE)

**Step 1: Create shared fetch wrapper**

Create `frontend/src/lib/api/fetch.ts`:

```typescript
import { get } from 'svelte/store'
import { sessionId } from '../stores/session'

/**
 * Fetch wrapper that injects X-Session-Id header on all requests.
 */
export function sessionFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const sid = get(sessionId)
  const headers = new Headers(init?.headers)
  if (sid) {
    headers.set('X-Session-Id', sid)
  }
  return fetch(input, { ...init, headers })
}
```

**Step 2: Update upload-api.ts to use session header**

In `frontend/src/lib/api/upload-api.ts`, the `createUploadBatch` function uses `XMLHttpRequest` (line 78). Add the session header:

After `xhr.open('POST', ...)`, add:
```typescript
import { get } from 'svelte/store'
import { sessionId } from '../stores/session'

// Inside createUploadBatch, after xhr.open():
const sid = get(sessionId)
if (sid) {
  xhr.setRequestHeader('X-Session-Id', sid)
}
```

For other fetch-based functions in upload-api.ts, replace `fetch()` calls with `sessionFetch()`.

**Step 3: Update job-service.ts SSE connection**

In `frontend/src/lib/services/job-service.ts`, the SSE `EventSource` API doesn't support custom headers. Instead, pass session as a query parameter:

Modify `connectSSE()`:
```typescript
connectSSE(): void {
  if (this.eventSource || this.isConnecting) return
  this.isConnecting = true

  const sid = get(sessionId)
  const url = sid
    ? `${API_BASE_URL}/jobs/events?session_id=${sid}`
    : `${API_BASE_URL}/jobs/events`

  this.eventSource = new EventSource(url)
  // ... rest unchanged
```

Correspondingly, update the backend SSE endpoint to also accept `session_id` as query param:
```python
@router.get("/events")
async def job_events(request: Request, x_session_id: str | None = Header(default=None), session_id: str | None = None):
    effective_session = x_session_id or session_id
    # ... use effective_session for filtering
```

For `submitJob`, `cancelJob`, `listJobs`, `getJobStatus` — replace `fetch()` with the `sessionFetch` wrapper.

**Step 4: Commit**

```bash
git add frontend/src/lib/api/fetch.ts frontend/src/lib/api/upload-api.ts frontend/src/lib/services/job-service.ts server/jobs/routes.py
git commit -m "feat: inject X-Session-Id header in all frontend API calls"
```

---

## Task 8: Implement frontend session initialization and URL routing

**Files:**
- Modify: `frontend/src/App.svelte` (session init logic)
- Modify: `frontend/src/lib/stores/session.ts` (add URL parsing helpers)

**Step 1: Add URL parsing to session store**

Update `frontend/src/lib/stores/session.ts`:

```typescript
import { writable } from 'svelte/store'

export const sessionId = writable<string | null>(null)
export const sessionLoading = writable(true)

/**
 * Extract session ID from URL path /s/{hash}
 */
export function getSessionIdFromUrl(): string | null {
  const match = window.location.pathname.match(/^\/s\/([A-Za-z0-9_-]{6,12})$/)
  return match ? match[1] : null
}

/**
 * Navigate to session URL without full page reload.
 */
export function navigateToSession(id: string): void {
  window.history.replaceState({}, '', `/s/${id}`)
}
```

**Step 2: Update App.svelte with session initialization**

In `frontend/src/App.svelte`, add session init at the top of `onMount`:

```typescript
import { sessionId, sessionLoading, getSessionIdFromUrl, navigateToSession } from './lib/stores/session'
import { createSession, getSession, updateSessionState, updateSessionBookmarks } from './lib/api/session-api'

onMount(async () => {
  // --- Session initialization ---
  const urlSessionId = getSessionIdFromUrl()

  if (urlSessionId) {
    // Try to resume existing session
    const session = await getSession(urlSessionId)
    if (session) {
      sessionId.set(session.id)

      // Restore UI state
      if (session.state?.ui?.activePanel) {
        activePanel.set(session.state.ui.activePanel as PanelView)
      }
      if (session.state?.map) {
        // Map state will be applied by MapView after it mounts
      }

      // Restore bookmarks from server (overrides localStorage)
      if (session.bookmarks?.length) {
        bookmarks.set(session.bookmarks)
      }
    } else {
      // Session not found — create new
      const newSession = await createSession()
      sessionId.set(newSession.id)
      navigateToSession(newSession.id)
    }
  } else {
    // No session in URL — create new and redirect
    const newSession = await createSession()
    sessionId.set(newSession.id)
    navigateToSession(newSession.id)
  }
  sessionLoading.set(false)

  // --- Rest of existing onMount logic (bookmarks, SSE, jobs) ---
  await bookmarkMgr.initialize()
  // ...
})
```

**Step 3: Add debounced state sync**

Add a state syncing mechanism that saves UI state to server on changes:

```typescript
import { derived } from 'svelte/store'

// Debounced state sync to server
let stateSyncTimer: ReturnType<typeof setTimeout> | null = null

function syncStateToServer() {
  if (stateSyncTimer) clearTimeout(stateSyncTimer)
  stateSyncTimer = setTimeout(async () => {
    const sid = get(sessionId)
    if (!sid) return
    const state = {
      ui: { activePanel: get(activePanel) },
      map: { is3D: get(is3D) }
    }
    try {
      await updateSessionState(sid, state)
    } catch (e) {
      console.warn('Failed to sync state:', e)
    }
  }, 5000) // 5-second debounce
}

// Subscribe to store changes
$effect(() => {
  $activePanel  // track
  $is3D         // track
  syncStateToServer()
})
```

**Step 4: Commit**

```bash
git add frontend/src/App.svelte frontend/src/lib/stores/session.ts
git commit -m "feat: session initialization, URL routing, and debounced state sync"
```

---

## Task 9: Migrate bookmarks from LocalStorage to server-side sessions

**Files:**
- Modify: `frontend/src/App.svelte` (bookmark save/delete → server sync)
- Modify: `frontend/src/lib/bookmarks/bookmark-manager.ts` (optional: add server backend)

**Step 1: Wire bookmark changes to server sync**

The simplest approach: keep `BookmarkManager` for in-memory management, but after every change, push the full bookmarks array to the server.

In `App.svelte`, modify the bookmark change handler:

```typescript
function onBookmarksChanged() {
  const allBookmarks = bookmarkMgr.getAllBookmarks()
  bookmarks.set(allBookmarks)

  // Sync to server
  const sid = get(sessionId)
  if (sid) {
    updateSessionBookmarks(sid, allBookmarks).catch(e =>
      console.warn('Failed to sync bookmarks:', e)
    )
  }
}
```

On session restore (in `onMount`), if server bookmarks exist, load them into the BookmarkManager instead of LocalStorage:

```typescript
if (session.bookmarks?.length) {
  // Server bookmarks override local
  for (const bm of session.bookmarks) {
    bookmarkStorage.save(bm) // sync to localStorage as backup
  }
  bookmarks.set(session.bookmarks)
} else {
  // First time — use existing localStorage bookmarks and push to server
  await bookmarkMgr.initialize()
  bookmarks.set(bookmarkMgr.getAllBookmarks())
  const sid = get(sessionId)
  if (sid) {
    await updateSessionBookmarks(sid, bookmarkMgr.getAllBookmarks())
  }
}
```

**Step 2: Commit**

```bash
git add frontend/src/App.svelte
git commit -m "feat: sync bookmarks to server session on changes"
```

---

## Task 10: Add map state save/restore

**Files:**
- Modify: `frontend/src/lib/components/MapView.svelte` (expose getState/setState)
- Modify: `frontend/src/App.svelte` (save/restore map position)

**Step 1: Add getMapState/setMapState to MapView**

In `MapView.svelte`, add methods to get/set the current map state (center, zoom, pitch, bearing):

```typescript
export function getMapState() {
  if (!map) return null
  return {
    center: map.getCenter().toArray(),
    zoom: map.getZoom(),
    pitch: map.getPitch(),
    bearing: map.getBearing(),
  }
}

export function setMapState(state: { center?: number[]; zoom?: number; pitch?: number; bearing?: number }) {
  if (!map) return
  if (state.center && state.zoom !== undefined) {
    map.jumpTo({
      center: state.center as [number, number],
      zoom: state.zoom,
      pitch: state.pitch ?? 0,
      bearing: state.bearing ?? 0,
    })
  }
}
```

**Step 2: Use in App.svelte session restore**

In the session restore block:
```typescript
if (session.state?.map) {
  // Apply after map has mounted (via a short delay or callback)
  setTimeout(() => mapView?.setMapState(session.state.map), 100)
}
```

In the state sync function, include map state:
```typescript
const mapState = mapView?.getMapState()
const state = {
  ui: { activePanel: get(activePanel) },
  map: mapState ? { ...mapState, is3D: get(is3D) } : { is3D: get(is3D) }
}
```

**Step 3: Commit**

```bash
git add frontend/src/lib/components/MapView.svelte frontend/src/App.svelte
git commit -m "feat: save and restore map state in session"
```

---

## Task 11: Add CORS header for X-Session-Id

**Files:**
- Modify: `server/main.py:57-65` (CORS config)

**Step 1: Add X-Session-Id to allowed headers**

The CORS config already has `allow_headers=["*"]` (line 63), so all headers are allowed. But we need to expose it in responses so the frontend can read it.

Verify `expose_headers` includes it:
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition", "X-Session-Id"],
)
```

**Step 2: Commit**

```bash
git add server/main.py
git commit -m "feat: expose X-Session-Id in CORS headers"
```

---

## Task 12: Final integration test

**Files:**
- Test: `tests/test_session_integration.py` (create new)

**Step 1: Write integration test**

```python
"""End-to-end integration test for session workflow."""

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
    """Test: create session → update state → add batch → resume → verify all state."""
    # 1. Create session
    resp = client.post("/api/v1/sessions")
    assert resp.status_code == 200
    session_id = resp.json()["id"]

    # 2. Update state
    state = {"map": {"center": [11.97, 57.71], "zoom": 14}, "ui": {"activePanel": "uploads"}}
    client.patch(f"/api/v1/sessions/{session_id}/state", json=state)

    # 3. Update bookmarks
    bookmarks = [{"id": "bm1", "name": "Home", "bbox": {"minX": 0, "minY": 0, "maxX": 1, "maxY": 1}}]
    client.patch(f"/api/v1/sessions/{session_id}/bookmarks", json=bookmarks)

    # 4. Create a batch linked to session
    catalog.create_batch(
        batch_id="batch-int",
        name="Integration",
        root_dir="/tmp",
        file_count=0,
        total_bytes=0,
        session_id=session_id,
    )

    # 5. Resume session (simulating new browser visit)
    resp = client.get(f"/api/v1/sessions/{session_id}")
    data = resp.json()

    assert data["id"] == session_id
    assert data["state"]["map"]["center"] == [11.97, 57.71]
    assert data["state"]["ui"]["activePanel"] == "uploads"
    assert len(data["bookmarks"]) == 1
    assert data["bookmarks"][0]["name"] == "Home"
    assert len(data["batches"]) == 1
    assert data["batches"][0]["id"] == "batch-int"
```

**Step 2: Run all tests**

Run: `pytest tests/ -v`
Expected: All tests PASS, including existing ones (backward compatibility).

**Step 3: Commit**

```bash
git add tests/test_session_integration.py
git commit -m "test: add end-to-end session lifecycle integration test"
```

---

## Task 13: Update `__init__.py` exports and verify full server startup

**Files:**
- Modify: `server/upload/__init__.py` (verify get_catalog export)
- Manual verification: start the dev server and test the flow

**Step 1: Verify exports**

Read `server/upload/__init__.py` and ensure `get_catalog` is exported. If not, add it.

**Step 2: Start dev server and manual test**

Run: `./start_dev.sh`

Test flow:
1. Visit `http://localhost:3000/` → should redirect to `/s/{hash}`
2. Copy the hash, close browser
3. Visit `http://localhost:3000/s/{hash}` → should restore session
4. Upload files → batch should be linked to session
5. Visit session URL from another browser → should see same batches

**Step 3: Final commit**

```bash
git add -A
git commit -m "feat: complete session management feature"
```

---

## Summary

| Task | Component | Commits |
|------|-----------|---------|
| 1 | Sessions table + CRUD | 1 |
| 2 | session_id on upload_batches | 1 |
| 3 | Session API routes | 1 |
| 4 | Wire into FastAPI app | 1 |
| 5 | Session-scoped jobs | 1 |
| 6 | Frontend session store + API | 1 |
| 7 | X-Session-Id header injection | 1 |
| 8 | URL routing + session init | 1 |
| 9 | Bookmarks server sync | 1 |
| 10 | Map state save/restore | 1 |
| 11 | CORS header | 1 |
| 12 | Integration test | 1 |
| 13 | Exports + manual verification | 1 |

**Total: 13 tasks, ~13 commits**
