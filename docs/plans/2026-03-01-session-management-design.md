# Session Management via Hash

**Date:** 2026-03-01
**Status:** Approved

## Problem

DTCC Atlas is fully stateless. Users lose all context (upload batches, job history, bookmarks, map position) when they close the browser or switch devices. There is no user management system and none is wanted — but sessions should be resumable.

## Solution

Every visitor gets an 8-character alphanumeric session hash. The hash appears in the URL (`/s/a3f8b2c1`). Users resume by revisiting the URL. All workspace state — uploads, jobs, bookmarks, map position, UI preferences — is tied to the session on the server.

## Requirements

| Decision | Choice |
|----------|--------|
| Scope | Full workspace (uploads, jobs, bookmarks, datasets, map state) |
| UX | URL parameter `/s/{hash}` |
| Expiration | Never expire |
| New visitors | Auto-create session, redirect to `/s/{hash}` |
| Hash format | 8-char alphanumeric (via `secrets.token_urlsafe(6)`) |
| Storage | SQLite (existing `atlas_catalog.db`) |
| Migration | Clean slate — existing data not retroactively linked |

## Architecture: Server-Side Session Store

All session state lives in SQLite. Every API call is scoped to a session via an `X-Session-Id` header. This gives full cross-device resume from a single hash.

### Data Model

New `sessions` table in `atlas_catalog.db`:

```sql
CREATE TABLE sessions (
    id            TEXT PRIMARY KEY,   -- 8-char hash, e.g. "a3f8b2c1"
    created_at    TEXT NOT NULL,      -- ISO timestamp
    last_accessed TEXT NOT NULL,      -- ISO timestamp, updated on each API call
    state_json    TEXT DEFAULT '{}',  -- UI state (map position, active panel, 3D mode)
    bookmarks_json TEXT DEFAULT '[]'  -- Saved bookmarks array
);
```

Modified existing tables — add `session_id` column:

- `upload_batches` gains `session_id TEXT` (FK to sessions.id, nullable for backward compat)
- Jobs gain session scoping via in-memory `session_id` field (jobs are already ephemeral)

No changes to `upload_files`, `upload_candidates`, `uploaded_datasets` — they are linked via `batch_id`.

### Hash Generation

```python
import secrets

def generate_session_id() -> str:
    """Generate 8-char URL-safe session hash. Check DB for collisions."""
    while True:
        sid = secrets.token_urlsafe(6)  # produces 8-char string
        if not session_exists(sid):
            return sid
```

No cryptographic signing needed. The hash is an identifier, not an authorization proof.

### URL Scheme

```
https://atlas.example.com/s/a3f8b2c1
```

- Svelte SPA handles routing: `/s/:sessionId`
- FastAPI catch-all already serves `index.html` for client-side routes
- On bare visit (`/`), frontend calls `POST /api/v1/sessions`, then redirects to `/s/{hash}`

### API Changes

**New endpoints:**

```
POST   /api/v1/sessions              -- Create new session → {id, created_at}
GET    /api/v1/sessions/:id          -- Get session (state, bookmarks, linked batches/jobs)
PATCH  /api/v1/sessions/:id/state    -- Update UI state (debounced from frontend)
```

**Modified endpoints** — accept `X-Session-Id` header:

| Endpoint | Change |
|----------|--------|
| `POST /api/v1/uploads/batches` | Links new batch to session |
| `GET /api/v1/uploads/batches` | New — list batches for this session |
| `POST /api/v1/jobs/submit` | Tags job with session |
| `GET /api/v1/jobs/list` | Filters by session |
| `GET /api/v1/jobs/events` | SSE scoped to session's jobs |

### Frontend Flow

```
User visits /           → POST /api/v1/sessions → redirect to /s/{hash}
User visits /s/{hash}   → GET /api/v1/sessions/{hash}
                         → Found: restore state (map, bookmarks, panels)
                         → Not found: show error + offer to create new session
```

**Key changes:**

- New Svelte store: `sessionId` holds the current hash
- All API calls include `X-Session-Id` header via a shared fetch wrapper
- UI state debounce-saved to server every ~5 seconds on change
- Bookmarks saved to server on change (replacing LocalStorage)
- SSE connection includes session context

### Session State JSON Structure

```json
{
  "map": {
    "center": [11.97, 57.71],
    "zoom": 14,
    "pitch": 0,
    "bearing": 0,
    "is3D": false
  },
  "ui": {
    "activePanel": "datasets",
    "searchOpen": false
  }
}
```

### Error Handling

- Invalid/unknown session hash → "Session not found" screen with "Start new session" button
- DB write failures for state sync → silent retry, non-blocking (UI state is best-effort)
- Hash collision on creation → regenerate (loop in `generate_session_id`)

### What This Does NOT Include

- User accounts or authentication
- Session expiration or cleanup (sessions never expire)
- Retroactive migration of existing upload batches
- Access control between sessions (any session hash = full access to that session's data)
