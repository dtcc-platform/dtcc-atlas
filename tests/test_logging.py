"""Guard: server.dtcc_logging must import and expose five level functions.

This fails at import time if tests/conftest.py's dtcc_core mock stops
returning a 5-tuple from get_logger (tuple-unpack would raise ValueError).
"""
import subprocess
import sys
from pathlib import Path

import pytest

from server import dtcc_logging as server_logging

_REPO_ROOT = Path(__file__).resolve().parent.parent


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


def test_module_imports_against_real_dtcc_core():
    # Clean subprocess: no conftest mocks, real installed dtcc_core.
    result = subprocess.run(
        [
            sys.executable,
            "-c",
            "from server.dtcc_logging import debug, info, warning, error, critical; "
            "assert all(callable(f) for f in (debug, info, warning, error, critical))",
        ],
        cwd=_REPO_ROOT,
        capture_output=True,
        text=True,
        timeout=60,
    )
    assert result.returncode == 0, result.stderr


def test_stdlib_logging_not_shadowed_with_server_on_path():
    # Running e.g. `python server/main.py` puts server/ first on sys.path;
    # a module named server/logging.py would shadow the stdlib there.
    result = subprocess.run(
        [
            sys.executable,
            "-c",
            "import sys; sys.path.insert(0, 'server'); import logging; "
            "assert hasattr(logging, 'getLogger'), logging.__file__",
        ],
        cwd=_REPO_ROOT,
        capture_output=True,
        text=True,
        timeout=60,
    )
    assert result.returncode == 0, result.stderr
