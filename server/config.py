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

# Upload raw staging directory
UPLOAD_RAW_DIR = Path(
    os.getenv("UPLOAD_RAW_DIR", BASE_DIR / "data" / "uploads" / "raw")
)

# Catalog root directory
CATALOG_DIR = Path(
    os.getenv("CATALOG_DIR", BASE_DIR / "data" / "catalog")
)

# Uploaded datasets storage root
CATALOG_DATASETS_DIR = Path(
    os.getenv("CATALOG_DATASETS_DIR", CATALOG_DIR / "datasets")
)

# SQLite catalog path
CATALOG_DB_PATH = Path(
    os.getenv("CATALOG_DB_PATH", CATALOG_DIR / "atlas_catalog.db")
)

# Job manager settings
JOB_MAX_WORKERS = int(os.getenv("JOB_MAX_WORKERS", "4"))
JOB_TIMEOUT = float(os.getenv("JOB_TIMEOUT", "120.0"))

# Remote dataset services
REMOTE_SERVICES = [
    url.strip()
    for url in os.environ.get("DTCC_REMOTE_SERVICES", "").split(",")
    if url.strip()
]
SHARED_RESULTS_DIR = Path(
    os.getenv("SHARED_RESULTS_DIR", BASE_DIR / "data" / "shared-results")
)
REMOTE_DISCOVERY_INTERVAL = int(os.getenv("REMOTE_DISCOVERY_INTERVAL", "60"))

# Optional external Lurkie/dtcc-agent service. When set, Atlas proxies chat
# WebSocket traffic to this service instead of launching dtcc-agent in-process.
AGENT_SERVICE_URL = os.getenv("DTCC_AGENT_SERVICE_URL", "").rstrip("/")
