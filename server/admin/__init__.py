"""
Admin module for managing published datasets and Geotorget orders.

Provides API endpoints for:
- Listing published datasets with metadata
- Downloading orders from Lantmateriet Geotorget
- Publishing downloaded orders to GeoJSON
- Deleting published datasets
"""

from .routes import create_admin_router

__all__ = ["create_admin_router"]
