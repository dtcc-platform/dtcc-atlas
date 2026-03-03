"""Tests for _normalize_progress_state in server/jobs/manager.py."""

import pytest

from server.jobs.manager import _normalize_progress_state


class TestNormalizeProgressState:
    def test_valid_state(self):
        state = {
            "percent": 50.0,
            "message": "Processing...",
            "phase": "download",
            "eta_formatted": "2m 30s",
            "phases": {"download": 50, "process": 0},
        }
        result = _normalize_progress_state(state)
        assert result["percent"] == 50.0
        assert result["message"] == "Processing..."
        assert result["phase"] == "download"
        assert result["eta_formatted"] == "2m 30s"
        assert result["phases"] == {"download": 50, "process": 0}

    def test_non_dict_returns_none(self):
        assert _normalize_progress_state("hello") is None
        assert _normalize_progress_state(42) is None
        assert _normalize_progress_state([1, 2]) is None

    def test_none_returns_none(self):
        assert _normalize_progress_state(None) is None

    def test_percent_clamped_low(self):
        result = _normalize_progress_state({"percent": -10})
        assert result["percent"] == 0.0

    def test_percent_clamped_high(self):
        result = _normalize_progress_state({"percent": 150})
        assert result["percent"] == 100.0

    def test_non_numeric_percent_defaults_zero(self):
        result = _normalize_progress_state({"percent": "abc"})
        assert result["percent"] == 0.0

    def test_percent_rounding(self):
        result = _normalize_progress_state({"percent": 33.3333333})
        assert result["percent"] == 33.33

    def test_message_none_becomes_empty_string(self):
        result = _normalize_progress_state({"message": None})
        assert result["message"] == ""

    def test_phase_none_stays_none(self):
        result = _normalize_progress_state({"phase": None})
        assert result["phase"] is None

    def test_eta_formatted_passthrough(self):
        result = _normalize_progress_state({"eta_formatted": "1m 15s"})
        assert result["eta_formatted"] == "1m 15s"

    def test_phases_dict_preserved(self):
        phases = {"step1": 100, "step2": 50}
        result = _normalize_progress_state({"phases": phases})
        assert result["phases"] == phases

    def test_phases_non_dict_becomes_none(self):
        result = _normalize_progress_state({"phases": "not a dict"})
        assert result["phases"] is None

    def test_minimal_empty_dict(self):
        result = _normalize_progress_state({})
        assert result["percent"] == 0.0
        assert result["message"] == ""
        assert result["phase"] is None
        assert result["eta_formatted"] is None
        assert result["phases"] is None
