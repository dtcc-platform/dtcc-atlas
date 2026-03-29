"""WebSocket endpoint for agent chat conversations."""

import asyncio
import json
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from server.agent.context import build_context
from server.agent.service import AgentService

logger = logging.getLogger("dtcc-atlas.agent")

KEEPALIVE_INTERVAL = 30


def create_agent_router(available_datasets: list[str] | None = None) -> APIRouter:
    """Create the agent chat router.

    Args:
        available_datasets: List of dataset names for context injection.
    """
    router = APIRouter(prefix="/agent", tags=["agent"])
    service = AgentService()
    _datasets = available_datasets or []

    @router.websocket("/chat")
    async def chat(ws: WebSocket):
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
            })
            return
        except Exception:
            logger.exception("[%s] Failed to create SDK client", session_id)
            await ws.send_json({
                "type": "error",
                "content": "Failed to start agent. Check server logs.",
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

                context_str = build_context(client_context, _datasets)
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
                        })
                        return
                    continue

                await ws.send_json({"type": "done"})

        except WebSocketDisconnect:
            logger.info("[%s] Client disconnected", session_id)
        finally:
            await _safe_disconnect(client, session_id)

    return router


async def _create_client(service: AgentService):
    """Create and connect a persistent ClaudeSDKClient."""
    from claude_agent_sdk import ClaudeSDKClient, ClaudeAgentOptions

    options = ClaudeAgentOptions(
        system_prompt=service.build_system_prompt(),
        mcp_servers=service.get_mcp_config(),
        permission_mode="bypassPermissions",
        model="claude-sonnet-4-5",
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
