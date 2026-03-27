"""Tests for server.agent.routes -- WebSocket chat endpoint."""

import json
from unittest.mock import MagicMock

import sys
sys.modules["claude_agent_sdk"] = MagicMock()

from fastapi import FastAPI
from fastapi.testclient import TestClient

from server.agent import create_agent_router


def _make_client():
    app = FastAPI()
    router = create_agent_router(available_datasets=["point_cloud", "buildings"])
    app.include_router(router, prefix="/api/v1")
    return TestClient(app)


def test_websocket_connect_and_init():
    client = _make_client()
    with client.websocket_connect("/api/v1/agent/chat") as ws:
        ws.send_json({"type": "init", "session_id": "test-123"})
        response = ws.receive_json()
        assert response["type"] == "session"
        assert response["session_id"] == "test-123"


def test_websocket_rejects_empty_message():
    client = _make_client()
    with client.websocket_connect("/api/v1/agent/chat") as ws:
        ws.send_json({"type": "init", "session_id": "test-123"})
        ws.receive_json()
        ws.send_json({"type": "message", "content": "", "context": {}})
        response = ws.receive_json()
        assert response["type"] == "error"
        assert "empty" in response["content"].lower()


def test_websocket_rejects_oversized_message():
    client = _make_client()
    with client.websocket_connect("/api/v1/agent/chat") as ws:
        ws.send_json({"type": "init", "session_id": "test-123"})
        ws.receive_json()
        ws.send_json({
            "type": "message",
            "content": "x" * 10_001,
            "context": {},
        })
        response = ws.receive_json()
        assert response["type"] == "error"
        assert "10,000" in response["content"]


def test_websocket_new_chat_clears_session():
    client = _make_client()
    with client.websocket_connect("/api/v1/agent/chat") as ws:
        ws.send_json({"type": "init", "session_id": "test-123"})
        ws.receive_json()
        ws.send_json({"type": "new_chat"})
        # Should not crash -- no response expected for new_chat
