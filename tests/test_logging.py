"""Guard: server.logging must import and expose five level functions.

This fails at import time if tests/conftest.py's dtcc_core mock stops
returning a 5-tuple from get_logger (tuple-unpack would raise ValueError).
"""
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
