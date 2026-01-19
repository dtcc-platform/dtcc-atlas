"""
Vector dataset discovery and serving module.

Discovers published vector datasets and serves them with spatial filtering.
"""

from .discovery import discover_published_datasets, get_dataset_metadata, get_dataset_geojson_path
from .routes import create_vector_router

__all__ = [
    "discover_published_datasets",
    "get_dataset_metadata",
    "get_dataset_geojson_path",
    "create_vector_router",
]
