"""WebSocket endpoint for agent chat conversations."""

import asyncio
import json
import logging
from typing import Any
from urllib.parse import urlparse, urlunparse

import httpx
import websockets
from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import Response

from server import config
from server.agent.context import build_context
from server.agent.service import AgentService

logger = logging.getLogger("dtcc-atlas.agent")

KEEPALIVE_INTERVAL = 30


def create_agent_router(
    available_datasets: list[str] | None = None,
    catalog: Any = None,
) -> APIRouter:
    """Create the agent chat router.

    Args:
        available_datasets: List of dataset names for context injection.
        catalog: UploadCatalog instance for querying ingested GeoJSON files.
    """
    router = APIRouter(prefix="/agent", tags=["agent"])
    service = AgentService()
    _datasets = available_datasets or []
    _catalog = catalog

    @router.websocket("/chat")
    async def chat(ws: WebSocket):
        if config.AGENT_SERVICE_URL:
            await _proxy_remote_chat(
                ws=ws,
                service=service,
                service_url=config.AGENT_SERVICE_URL,
                available_datasets=_datasets,
                catalog=_catalog,
            )
            return

        await ws.accept()

        try:
            init = await ws.receive_json()
        except (WebSocketDisconnect, json.JSONDecodeError):
            return

        session_id = init.get("session_id", "anonymous")
        logger.info("[%s] WebSocket connected", session_id)
        await ws.send_json({"type": "session", "session_id": session_id})

        # Create persistent SDK client for this WebSocket session
        try:
            client = await _create_client(service)
        except ImportError:
            await ws.send_json({
                "type": "error",
                "content": "Agent SDK not installed. Install claude-agent-sdk to use chat.",
                "fatal": True,
            })
            return
        except Exception:
            logger.exception("[%s] Failed to create SDK client", session_id)
            await ws.send_json({
                "type": "error",
                "content": "Failed to start agent. Check server logs.",
                "fatal": True,
            })
            return

        try:
            while True:
                data = await ws.receive_json()
                msg_type = data.get("type")

                if msg_type == "new_chat":
                    logger.info("[%s] New chat -- reconnecting client", session_id)
                    await _safe_disconnect(client, session_id)
                    try:
                        client = await _create_client(service)
                    except Exception:
                        logger.exception("[%s] Failed to create new client", session_id)
                        await ws.send_json({
                            "type": "error",
                            "content": "Failed to reset chat. Please refresh the page.",
                            "fatal": True,
                        })
                        return
                    continue

                if msg_type != "message":
                    continue

                user_text = data.get("content", "")
                client_context = data.get("context", {})

                error = service.validate_message(user_text)
                if error:
                    await ws.send_json({"type": "error", "content": error})
                    continue

                user_text = user_text.strip()
                logger.info("[%s] User: %s", session_id, user_text[:200])

                context_str = build_context(client_context, _datasets, catalog=_catalog)
                await ws.send_json({"type": "status", "content": "thinking"})

                try:
                    await _process_message(ws, client, user_text, context_str)
                except Exception:
                    logger.exception("[%s] Error during message -- reconnecting", session_id)
                    await _safe_disconnect(client, session_id)
                    try:
                        client = await _create_client(service)
                        await ws.send_json({
                            "type": "error",
                            "content": "An error occurred. Session has been reset -- please resend your message.",
                        })
                    except Exception:
                        logger.exception("[%s] Reconnect failed", session_id)
                        await ws.send_json({
                            "type": "error",
                            "content": "Sorry, an error occurred. Please try starting a new chat.",
                            "fatal": True,
                        })
                        return
                    continue

                await ws.send_json({"type": "done"})

        except WebSocketDisconnect:
            logger.info("[%s] Client disconnected", session_id)
        finally:
            await _safe_disconnect(client, session_id)

    @router.get("/renders/{render_path:path}")
    async def remote_render(render_path: str):
        """Proxy rendered images from the dtcc-agent mini-service."""
        if not config.AGENT_SERVICE_URL:
            raise HTTPException(status_code=404, detail="Agent service is not configured")

        render_path = render_path.lstrip("/")
        render_url = f"{config.AGENT_SERVICE_URL}/renders/{render_path}"
        try:
            async with httpx.AsyncClient(follow_redirects=True) as client:
                resp = await client.get(render_url, timeout=30)
        except httpx.HTTPError as exc:
            logger.warning("Failed to proxy agent render %s: %s", render_path, exc)
            raise HTTPException(status_code=502, detail="Agent render service unavailable")

        if resp.status_code >= 400:
            raise HTTPException(status_code=resp.status_code, detail=resp.text)

        headers = {
            key: value
            for key, value in resp.headers.items()
            if key.lower() in {"cache-control", "etag", "last-modified"}
        }
        return Response(
            content=resp.content,
            media_type=resp.headers.get("content-type", "application/octet-stream"),
            headers=headers,
        )

    return router


def _agent_service_ws_url(service_url: str) -> str:
    """Convert an HTTP(S) agent service URL into its /chat WebSocket URL."""
    parsed = urlparse(service_url.rstrip("/"))
    if parsed.scheme not in {"http", "https", "ws", "wss"}:
        raise ValueError(f"Unsupported DTCC_AGENT_SERVICE_URL scheme: {parsed.scheme}")

    scheme = {"http": "ws", "https": "wss"}.get(parsed.scheme, parsed.scheme)
    path = f"{parsed.path.rstrip('/')}/chat" if parsed.path else "/chat"
    return urlunparse(
        parsed._replace(scheme=scheme, path=path, params="", query="", fragment="")
    )


async def _proxy_remote_chat(
    ws: WebSocket,
    service: AgentService,
    service_url: str,
    available_datasets: list[str],
    catalog: Any,
) -> None:
    """Proxy the Atlas chat WebSocket to an external dtcc-agent service."""
    await ws.accept()

    try:
        init = await ws.receive_json()
    except (WebSocketDisconnect, json.JSONDecodeError):
        return

    session_id = init.get("session_id", "anonymous")
    remote_url = _agent_service_ws_url(service_url)
    logger.info("[%s] Proxying chat to dtcc-agent at %s", session_id, remote_url)

    try:
        async with websockets.connect(remote_url, max_size=None) as remote:
            await remote.send(json.dumps(init))

            try:
                initial_remote_msg = await asyncio.wait_for(remote.recv(), timeout=10)
            except asyncio.TimeoutError:
                await ws.send_json({
                    "type": "error",
                    "content": "Agent service did not complete session handshake.",
                    "fatal": True,
                })
                return

            await _send_remote_payload(ws, initial_remote_msg)

            client_task = asyncio.create_task(
                _client_to_remote_loop(
                    ws,
                    remote,
                    service,
                    available_datasets,
                    catalog,
                )
            )
            remote_task = asyncio.create_task(_remote_to_client_loop(ws, remote))

            done, pending = await asyncio.wait(
                {client_task, remote_task},
                return_when=asyncio.FIRST_COMPLETED,
            )
            for task in pending:
                task.cancel()
            for task in done:
                exc = task.exception()
                if exc:
                    raise exc

    except WebSocketDisconnect:
        logger.info("[%s] Client disconnected from proxied chat", session_id)
    except websockets.ConnectionClosed:
        logger.info("[%s] Remote agent chat connection closed", session_id)
    except Exception:
        logger.exception("[%s] Agent service proxy failed", session_id)
        try:
            await ws.send_json({
                "type": "error",
                "content": "Agent service unavailable. Check dtcc-agent logs.",
                "fatal": True,
            })
        except Exception:
            pass


async def _client_to_remote_loop(
    ws: WebSocket,
    remote,
    service: AgentService,
    available_datasets: list[str],
    catalog: Any,
) -> None:
    while True:
        try:
            data = await ws.receive_json()
        except WebSocketDisconnect:
            return

        if data.get("type") == "message":
            user_text = data.get("content", "")
            error = service.validate_message(user_text)
            if error:
                await ws.send_json({"type": "error", "content": error})
                continue

            user_text = user_text.strip()
            context_str = build_context(
                data.get("context", {}),
                available_datasets,
                catalog=catalog,
            )
            payload = dict(data)
            payload.pop("context", None)
            payload["content"] = (
                f"[Context: {context_str}]\n\n{user_text}"
                if context_str else user_text
            )
        else:
            payload = data

        await remote.send(json.dumps(payload))


async def _remote_to_client_loop(ws: WebSocket, remote) -> None:
    async for raw in remote:
        await _send_remote_payload(ws, raw)


async def _send_remote_payload(ws: WebSocket, raw: str | bytes) -> None:
    if isinstance(raw, bytes):
        await ws.send_bytes(raw)
        return

    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        await ws.send_text(raw)
        return

    if isinstance(payload, dict):
        _rewrite_remote_payload(payload)
        await ws.send_json(payload)
        return

    await ws.send_text(raw)


def _rewrite_remote_payload(payload: dict[str, Any]) -> None:
    """Normalize remote dtcc-agent messages for the Atlas frontend."""
    if payload.get("type") == "tool_call" and payload.get("status") == "done":
        payload["status"] = "complete"

    if payload.get("type") == "image":
        url = payload.get("url")
        if isinstance(url, str) and url.startswith("/renders/"):
            payload["url"] = f"/api/v1/agent/renders/{url.removeprefix('/renders/')}"


async def _create_client(service: AgentService):
    """Create and connect a persistent ClaudeSDKClient."""
    from claude_agent_sdk import ClaudeSDKClient, ClaudeAgentOptions

    options = ClaudeAgentOptions(
        system_prompt=service.build_system_prompt(),
        mcp_servers=service.get_mcp_config(),
        permission_mode="bypassPermissions",
        model="claude-opus-4-6",
    )
    client = ClaudeSDKClient(options=options)
    await client.connect()
    return client


async def _safe_disconnect(client, session_id: str) -> None:
    """Disconnect a client, swallowing errors."""
    try:
        await client.disconnect()
    except Exception:
        logger.warning("[%s] Error during client disconnect (ignored)", session_id)


async def _process_message(
    ws: WebSocket,
    client,
    user_text: str,
    context_str: str,
) -> None:
    """Send a query on the persistent client and stream the response."""
    from claude_agent_sdk import (
        AssistantMessage,
        UserMessage,
        ResultMessage,
        TextBlock,
        ToolUseBlock,
        ToolResultBlock,
    )

    if context_str:
        query_text = f"[Context: {context_str}]\n\n{user_text}"
    else:
        query_text = user_text

    await client.query(query_text)

    keepalive_task = asyncio.create_task(_keepalive_loop(ws))
    tool_id_to_name: dict[str, str] = {}

    try:
        async for msg in client.receive_response():
            if isinstance(msg, AssistantMessage):
                for block in msg.content:
                    if isinstance(block, TextBlock):
                        await ws.send_json({
                            "type": "text",
                            "content": block.text,
                        })
                    elif isinstance(block, ToolUseBlock):
                        tool_id_to_name[block.id] = block.name
                        await ws.send_json({
                            "type": "tool_call",
                            "name": block.name,
                            "status": "running",
                        })

            elif isinstance(msg, UserMessage):
                for block in msg.content:
                    if isinstance(block, ToolResultBlock):
                        tool_name = tool_id_to_name.get(
                            getattr(block, "tool_use_id", ""), "tool"
                        )
                        await ws.send_json({
                            "type": "tool_call",
                            "name": tool_name,
                            "status": "complete",
                        })

            elif isinstance(msg, ResultMessage):
                break
    finally:
        keepalive_task.cancel()
        try:
            await keepalive_task
        except asyncio.CancelledError:
            pass


async def _keepalive_loop(ws: WebSocket) -> None:
    """Send periodic keepalive frames to prevent idle disconnects."""
    while True:
        await asyncio.sleep(KEEPALIVE_INTERVAL)
        try:
            await ws.send_json({"type": "keepalive"})
        except Exception:
            break
