"""
Server configuration.

Configuration values can be overridden via environment variables.
"""

import os
from pathlib import Path

# Base directory (project root)
BASE_DIR = Path(__file__).parent.parent

# Published datasets directory
# Can be overridden with PUBLISHED_DATASETS_DIR environment variable
PUBLISHED_DATASETS_DIR = Path(
    os.getenv("PUBLISHED_DATASETS_DIR", BASE_DIR / "data" / "published")
)

# Job manager settings
JOB_MAX_WORKERS = int(os.getenv("JOB_MAX_WORKERS", "4"))
JOB_TIMEOUT = float(os.getenv("JOB_TIMEOUT", "120.0"))
