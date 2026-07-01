"""FastAPI routes for session management."""

from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, HTTPException, Request

from server.upload.catalog import UploadCatalog


def create_session_router(catalog: UploadCatalog) -> APIRouter:
    """Create a router for session CRUD endpoints.

    The *catalog* instance is injected at startup so every endpoint
    shares the same DB connection pool.
    """
    router = APIRouter(prefix="/sessions", tags=["sessions"])

    @router.post("")
    async def create_session() -> dict[str, Any]:
        session_id = catalog.create_session()
        session = catalog.get_session(session_id)
        return {"id": session_id, "created_at": session["created_at"]}

    @router.get("/{session_id}")
    async def get_session(session_id: str) -> dict[str, Any]:
        session = catalog.get_session(session_id)
        if session is None:
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
    async def update_session_state(session_id: str, request: Request) -> dict[str, Any]:
        session = catalog.get_session(session_id)
        if session is None:
            raise HTTPException(status_code=404, detail="Session not found")

        body = await request.json()
        catalog.update_session_state(session_id, body)
        return {"ok": True}

    @router.patch("/{session_id}/bookmarks")
    async def update_session_bookmarks(session_id: str, request: Request) -> dict[str, Any]:
        session = catalog.get_session(session_id)
        if session is None:
            raise HTTPException(status_code=404, detail="Session not found")

        body = await request.json()
        catalog.update_session_bookmarks(session_id, body)
        return {"ok": True}

    return router
