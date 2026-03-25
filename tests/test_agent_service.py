"""Tests for server.agent.service -- Agent SDK lifecycle management."""

import os
from unittest.mock import patch

import pytest

from server.agent.service import AgentService, MAX_MESSAGE_LENGTH


def test_get_mcp_config_with_conda():
    service = AgentService()
    with patch("shutil.which", return_value="/usr/bin/conda"):
        config = service.get_mcp_config()
    assert "dtcc-agent" in config
    assert config["dtcc-agent"]["command"] == "/usr/bin/conda"
    assert "fenicsx-env" in config["dtcc-agent"]["args"]


def test_get_mcp_config_without_conda():
    service = AgentService()
    with patch("shutil.which", return_value=None):
        config = service.get_mcp_config()
    assert config["dtcc-agent"]["command"] == "python"
    assert config["dtcc-agent"]["args"] == ["-m", "dtcc_agent"]


def test_validate_message_accepts_normal_text():
    service = AgentService()
    assert service.validate_message("Hello, run a simulation") is None


def test_validate_message_rejects_empty():
    service = AgentService()
    assert service.validate_message("") is not None
    assert service.validate_message("   ") is not None


def test_validate_message_rejects_too_long():
    service = AgentService()
    long_msg = "x" * (MAX_MESSAGE_LENGTH + 1)
    error = service.validate_message(long_msg)
    assert error is not None
    assert "10,000" in error


def test_session_tracking():
    service = AgentService()
    assert service.get_sdk_session("sess-1") is None
    service.set_sdk_session("sess-1", "sdk-abc")
    assert service.get_sdk_session("sess-1") == "sdk-abc"
    service.clear_sdk_session("sess-1")
    assert service.get_sdk_session("sess-1") is None


def test_claudecode_env_cleared():
    os.environ["CLAUDECODE"] = "1"
    _ = AgentService()
    assert "CLAUDECODE" not in os.environ
