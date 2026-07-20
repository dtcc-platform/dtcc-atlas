"""Guard: server.logging must import and expose five level functions.

This fails at import time if tests/conftest.py's dtcc_core mock stops
returning a 5-tuple from get_logger (tuple-unpack would raise ValueError).
"""
import pytest

from server import logging as server_logging


def test_logging_exposes_level_functions():
    for fn in (
        server_logging.debug,
        server_logging.info,
        server_logging.warning,
        server_logging.error,
        server_logging.critical,
    ):
        assert callable(fn)


def test_error_and_critical_raise_runtime_error():
    # Real dtcc-core error()/critical() log AND raise (legacy DTCC API);
    # the conftest mock mirrors that so misuse on log-then-continue paths
    # fails loudly in tests.
    with pytest.raises(RuntimeError, match="boom"):
        server_logging.error("boom")
    with pytest.raises(RuntimeError, match="boom"):
        server_logging.critical("boom")
