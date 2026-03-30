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
- When the context lists uploaded GeoJSON files, you can analyze them using \
load_geojson(file_path) to load the data, then query_geojson to filter \
features by property values, and summarize_geojson_property for statistics. \
Always load the file first before querying or summarizing.
"""


class AgentService:
    """Manages Agent SDK clients and session state."""

    def __init__(self):
        os.environ.pop("CLAUDECODE", None)

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

    def build_system_prompt(self) -> str:
        """Return the static system prompt."""
        return SYSTEM_PROMPT

    def validate_message(self, text: str) -> str | None:
        """Validate user message. Returns error string or None if valid."""
        stripped = text.strip()
        if not stripped:
            return "Message cannot be empty."
        if len(stripped) > MAX_MESSAGE_LENGTH:
            return f"Message too long ({len(stripped)} chars). Please keep it under 10,000."
        return None

