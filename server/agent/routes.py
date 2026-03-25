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

        try:
            while True:
                data = await ws.receive_json()
                msg_type = data.get("type")

                if msg_type == "new_chat":
                    logger.info("[%s] Clearing conversation", session_id)
                    service.clear_sdk_session(session_id)
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

                await _stream_agent_response(
                    ws, service, session_id, user_text, context_str,
                )

                await ws.send_json({"type": "done"})

        except WebSocketDisconnect:
            logger.info("[%s] Client disconnected", session_id)

    return router


async def _stream_agent_response(
    ws: WebSocket,
    service: AgentService,
    session_id: str,
    user_text: str,
    context_str: str,
) -> None:
    """Stream Agent SDK response over WebSocket with keepalive."""
    try:
        from claude_agent_sdk import (
            ClaudeSDKClient,
            ClaudeAgentOptions,
            AssistantMessage,
            UserMessage,
            ResultMessage,
            TextBlock,
            ToolUseBlock,
            ToolResultBlock,
        )
    except ImportError:
        await ws.send_json({
            "type": "error",
            "content": "Agent SDK not installed. Install claude-agent-sdk to use chat.",
        })
        return

    sdk_session_id = service.get_sdk_session(session_id)
    system_prompt = service.build_system_prompt(context_str)

    options = ClaudeAgentOptions(
        system_prompt=system_prompt,
        mcp_servers=service.get_mcp_config(),
        permission_mode="bypassPermissions",
        model="claude-sonnet-4-5",
    )
    if sdk_session_id:
        options.resume = sdk_session_id
        logger.info("[%s] Resuming SDK session %s", session_id, sdk_session_id)

    try:
        async with ClaudeSDKClient(options=options) as client:
            await client.query(user_text)

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
                        if msg.session_id:
                            service.set_sdk_session(session_id, msg.session_id)
                        break
            finally:
                keepalive_task.cancel()
                try:
                    await keepalive_task
                except asyncio.CancelledError:
                    pass

    except Exception:
        logger.exception("[%s] Agent SDK error", session_id)
        if sdk_session_id:
            logger.info("[%s] Retrying with fresh session", session_id)
            service.clear_sdk_session(session_id)
            try:
                options_fresh = ClaudeAgentOptions(
                    system_prompt=system_prompt,
                    mcp_servers=service.get_mcp_config(),
                    permission_mode="bypassPermissions",
                    model="claude-sonnet-4-5",
                )
                async with ClaudeSDKClient(options=options_fresh) as client:
                    await client.query(user_text)
                    async for msg in client.receive_response():
                        if isinstance(msg, AssistantMessage):
                            for block in msg.content:
                                if isinstance(block, TextBlock):
                                    await ws.send_json({
                                        "type": "text",
                                        "content": block.text,
                                    })
                        elif isinstance(msg, ResultMessage):
                            if msg.session_id:
                                service.set_sdk_session(session_id, msg.session_id)
                            break
            except Exception:
                logger.exception("[%s] Fresh session also failed", session_id)
                await ws.send_json({
                    "type": "error",
                    "content": "Sorry, an error occurred. Please try starting a new chat.",
                })
        else:
            await ws.send_json({
                "type": "error",
                "content": "Sorry, an error occurred. Check server logs for details.",
            })


async def _keepalive_loop(ws: WebSocket) -> None:
    """Send periodic keepalive frames to prevent idle disconnects."""
    while True:
        await asyncio.sleep(KEEPALIVE_INTERVAL)
        try:
            await ws.send_json({"type": "keepalive"})
        except Exception:
            break
