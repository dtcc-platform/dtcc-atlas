"""Tests for server.agent.routes -- WebSocket chat endpoint."""

import sys
from unittest.mock import AsyncMock, MagicMock

# Build mock SDK types that support isinstance() checks
MockAssistantMessage = type("AssistantMessage", (), {})
MockTextBlock = type("TextBlock", (), {})
MockResultMessage = type("ResultMessage", (), {})
MockUserMessage = type("UserMessage", (), {})
MockToolUseBlock = type("ToolUseBlock", (), {})
MockToolResultBlock = type("ToolResultBlock", (), {})

mock_sdk = MagicMock()
mock_sdk.AssistantMessage = MockAssistantMessage
mock_sdk.UserMessage = MockUserMessage
mock_sdk.ResultMessage = MockResultMessage
mock_sdk.TextBlock = MockTextBlock
mock_sdk.ToolUseBlock = MockToolUseBlock
mock_sdk.ToolResultBlock = MockToolResultBlock

mock_client = MagicMock()
mock_client.connect = AsyncMock()
mock_client.disconnect = AsyncMock()
mock_client.query = AsyncMock()


async def _empty_async_iter():
    return
    yield


mock_client.receive_response = MagicMock(return_value=_empty_async_iter())
mock_sdk.ClaudeSDKClient.return_value = mock_client
sys.modules["claude_agent_sdk"] = mock_sdk

from fastapi import FastAPI
from fastapi.testclient import TestClient

from server.agent import create_agent_router
from server.agent.routes import _agent_service_ws_url, _rewrite_remote_payload


def _make_client():
    app = FastAPI()
    router = create_agent_router(available_datasets=["point_cloud", "buildings"])
    app.include_router(router, prefix="/api/v1")
    return TestClient(app)


def _make_response(*messages):
    """Build an async iterator of SDK messages for mock responses."""
    async def _iter():
        for msg in messages:
            yield msg
    mock_client.receive_response = MagicMock(return_value=_iter())


def test_websocket_connect_and_init():
    _make_response()
    client = _make_client()
    with client.websocket_connect("/api/v1/agent/chat") as ws:
        ws.send_json({"type": "init", "session_id": "test-123"})
        response = ws.receive_json()
        assert response["type"] == "session"
        assert response["session_id"] == "test-123"


def test_websocket_rejects_empty_message():
    _make_response()
    client = _make_client()
    with client.websocket_connect("/api/v1/agent/chat") as ws:
        ws.send_json({"type": "init", "session_id": "test-123"})
        ws.receive_json()
        ws.send_json({"type": "message", "content": "", "context": {}})
        response = ws.receive_json()
        assert response["type"] == "error"
        assert "empty" in response["content"].lower()


def test_websocket_rejects_oversized_message():
    _make_response()
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


def test_websocket_new_chat_reconnects_client():
    _make_response()
    client = _make_client()
    with client.websocket_connect("/api/v1/agent/chat") as ws:
        ws.send_json({"type": "init", "session_id": "test-123"})
        ws.receive_json()
        ws.send_json({"type": "new_chat"})
        # Should not crash -- client is disconnected and reconnected


def test_websocket_message_happy_path():
    """Valid message produces status -> text -> done sequence."""
    text_block = MockTextBlock()
    text_block.text = "Hello from Lurkie!"

    assistant_msg = MockAssistantMessage()
    assistant_msg.content = [text_block]

    result_msg = MockResultMessage()

    _make_response(assistant_msg, result_msg)
    client = _make_client()
    with client.websocket_connect("/api/v1/agent/chat") as ws:
        ws.send_json({"type": "init", "session_id": "test-123"})
        ws.receive_json()  # session ack

        ws.send_json({
            "type": "message",
            "content": "Hello",
            "context": {"bbox": [1.0, 2.0, 3.0, 4.0], "activeDataset": "buildings"},
        })

        status = ws.receive_json()
        assert status["type"] == "status"
        assert status["content"] == "thinking"

        text = ws.receive_json()
        assert text["type"] == "text"
        assert text["content"] == "Hello from Lurkie!"

        done = ws.receive_json()
        assert done["type"] == "done"


def test_agent_service_ws_url_from_http():
    assert _agent_service_ws_url("http://localhost:8050") == "ws://localhost:8050/chat"


def test_agent_service_ws_url_preserves_path():
    assert (
        _agent_service_ws_url("https://example.com/lurkie")
        == "wss://example.com/lurkie/chat"
    )


def test_rewrite_remote_payload_for_atlas_frontend():
    payload = {"type": "tool_call", "status": "done", "name": "render_object"}
    _rewrite_remote_payload(payload)
    assert payload["status"] == "complete"

    image = {"type": "image", "url": "/renders/example.png"}
    _rewrite_remote_payload(image)
    assert image["url"] == "/api/v1/agent/renders/example.png"
