"""
FastAPI routes for vector dataset serving.

Provides endpoints for:
- Listing published datasets
- Getting dataset schemas
- Extracting vector data by bounds
"""

import json
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

from server.config import PUBLISHED_DATASETS_DIR
from .discovery import (
    discover_published_datasets,
    get_dataset_metadata,
    get_dataset_geojson_path,
)


class VectorRequest(BaseModel):
    """Request model for vector data extraction."""
    bounds: list[float]  # [minX, minY, maxX, maxY]
    format: str = "geojson"


def bbox_intersects(feature_bbox: list[float], query_bbox: list[float]) -> bool:
    """
    Check if two bounding boxes intersect.

    Args:
        feature_bbox: [minX, minY, maxX, maxY] of the feature
        query_bbox: [minX, minY, maxX, maxY] of the query

    Returns:
        True if bounding boxes intersect
    """
    # feature_bbox: [minX, minY, maxX, maxY]
    # query_bbox: [minX, minY, maxX, maxY]
    return not (
        feature_bbox[2] < query_bbox[0] or  # feature max_x < query min_x
        feature_bbox[0] > query_bbox[2] or  # feature min_x > query max_x
        feature_bbox[3] < query_bbox[1] or  # feature max_y < query min_y
        feature_bbox[1] > query_bbox[3]     # feature min_y > query max_y
    )


def get_geometry_bbox(geometry: dict) -> list[float] | None:
    """
    Calculate bounding box for a GeoJSON geometry.

    Args:
        geometry: GeoJSON geometry dict

    Returns:
        [minX, minY, maxX, maxY] or None if geometry is empty
    """
    coords = _extract_coords(geometry)
    if not coords:
        return None

    xs = [c[0] for c in coords]
    ys = [c[1] for c in coords]

    return [min(xs), min(ys), max(xs), max(ys)]


def _extract_coords(geometry: dict) -> list[list[float]]:
    """Extract all coordinate pairs from a geometry."""
    geom_type = geometry.get("type", "")
    coords = geometry.get("coordinates", [])

    if geom_type == "Point":
        return [coords] if coords else []
    elif geom_type == "LineString":
        return coords
    elif geom_type == "Polygon":
        return [c for ring in coords for c in ring]
    elif geom_type == "MultiPoint":
        return coords
    elif geom_type == "MultiLineString":
        return [c for line in coords for c in line]
    elif geom_type == "MultiPolygon":
        return [c for poly in coords for ring in poly for c in ring]
    elif geom_type == "GeometryCollection":
        result = []
        for geom in geometry.get("geometries", []):
            result.extend(_extract_coords(geom))
        return result
    else:
        return []


def clip_features_to_bounds(geojson: dict, bounds: list[float]) -> dict:
    """
    Filter GeoJSON features to those intersecting the given bounds.

    This performs a simple bounding-box filter, not actual geometry clipping.

    Args:
        geojson: GeoJSON FeatureCollection
        bounds: [minX, minY, maxX, maxY]

    Returns:
        Filtered GeoJSON FeatureCollection
    """
    features = geojson.get("features", [])
    filtered = []

    for feature in features:
        geometry = feature.get("geometry")
        if not geometry:
            continue

        feature_bbox = get_geometry_bbox(geometry)
        if feature_bbox and bbox_intersects(feature_bbox, bounds):
            filtered.append(feature)

    return {
        "type": "FeatureCollection",
        "features": filtered,
        "bbox": bounds,
    }


def create_vector_router() -> APIRouter:
    """
    Create the vector datasets router.

    Returns:
        FastAPI router with vector endpoints
    """
    router = APIRouter(prefix="/vector", tags=["vector"])

    @router.get("/datasets")
    async def list_vector_datasets():
        """List all published vector datasets."""
        datasets = discover_published_datasets()
        return {"datasets": datasets}

    @router.get("/datasets/{dataset_name}/schema")
    async def get_vector_schema(dataset_name: str):
        """Get the schema for a vector dataset."""
        metadata = get_dataset_metadata(dataset_name)
        if not metadata:
            raise HTTPException(status_code=404, detail=f"Dataset '{dataset_name}' not found")

        return metadata.get("schema", {})

    @router.get("/datasets/{dataset_name}/metadata")
    async def get_vector_metadata(dataset_name: str):
        """Get full metadata for a vector dataset."""
        metadata = get_dataset_metadata(dataset_name)
        if not metadata:
            raise HTTPException(status_code=404, detail=f"Dataset '{dataset_name}' not found")

        return metadata

    @router.post("/datasets/{dataset_name}")
    async def get_vector_data(dataset_name: str, request: VectorRequest):
        """
        Extract vector data for a dataset within the given bounds.

        Performs bounding-box filtering on the GeoJSON features.
        """
        # Check dataset exists
        geojson_path = get_dataset_geojson_path(dataset_name)
        if not geojson_path:
            raise HTTPException(status_code=404, detail=f"Dataset '{dataset_name}' not found")

        # Validate bounds
        if len(request.bounds) != 4:
            raise HTTPException(status_code=422, detail="Bounds must be [minX, minY, maxX, maxY]")

        # Load and filter GeoJSON
        try:
            with open(geojson_path, "r", encoding="utf-8") as f:
                geojson = json.load(f)
        except (json.JSONDecodeError, IOError) as e:
            raise HTTPException(status_code=500, detail=f"Error reading dataset: {e}")

        # Filter features to bounds
        filtered = clip_features_to_bounds(geojson, request.bounds)

        # Return as GeoJSON
        return Response(
            content=json.dumps(filtered),
            media_type="application/geo+json",
            headers={
                "Content-Disposition": f'attachment; filename="{dataset_name}.geojson"'
            }
        )

    return router
