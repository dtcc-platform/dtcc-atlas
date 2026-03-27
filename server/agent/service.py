"""Agent SDK lifecycle management for dtcc-agent integration."""

import os
import shutil

MAX_MESSAGE_LENGTH = 10_000

SYSTEM_PROMPT = """\
You are Lurkie, an urban digital twin chatbot for Sweden, built by the \
Digital Twin Cities Centre at Chalmers University of Technology. You help users \
explore buildings, terrain, run heat/air quality simulations, and visualize 3D \
city models anywhere in Sweden. Use the dtcc-agent tools available to you. \
Keep responses concise and focus on the data.

Important tool usage guidelines:
- Use a small geocoding radius (250m) unless the user explicitly asks for a \
large area. Large bounding boxes download millions of points and are slow.
- Parallelize tool calls whenever possible.
"""


class AgentService:
    """Manages Agent SDK clients and session state."""

    def __init__(self):
        os.environ.pop("CLAUDECODE", None)
        self._sdk_sessions: dict[str, str] = {}

    def get_mcp_config(self) -> dict:
        """Return MCP server configuration for dtcc-agent."""
        conda = shutil.which("conda")
        if conda is None:
            return {
                "dtcc-agent": {
                    "type": "stdio",
                    "command": "python",
                    "args": ["-m", "dtcc_agent"],
                }
            }
        return {
            "dtcc-agent": {
                "type": "stdio",
                "command": conda,
                "args": [
                    "run", "--no-capture-output", "-n", "fenicsx-env",
                    "python", "-m", "dtcc_agent",
                ],
            }
        }

    def build_system_prompt(self, context: str) -> str:
        """Build system prompt with injected Atlas context."""
        if context:
            return f"{SYSTEM_PROMPT}\n\n{context}"
        return SYSTEM_PROMPT

    def validate_message(self, text: str) -> str | None:
        """Validate user message. Returns error string or None if valid."""
        stripped = text.strip()
        if not stripped:
            return "Message cannot be empty."
        if len(stripped) > MAX_MESSAGE_LENGTH:
            return f"Message too long ({len(stripped)} chars). Please keep it under 10,000."
        return None

    def get_sdk_session(self, atlas_session_id: str) -> str | None:
        return self._sdk_sessions.get(atlas_session_id)

    def set_sdk_session(self, atlas_session_id: str, sdk_session_id: str) -> None:
        self._sdk_sessions[atlas_session_id] = sdk_session_id

    def clear_sdk_session(self, atlas_session_id: str) -> None:
        self._sdk_sessions.pop(atlas_session_id, None)
