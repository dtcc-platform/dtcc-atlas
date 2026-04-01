"""Build context string for agent system prompt from Atlas session state."""

from __future__ import annotations

from typing import Any, TYPE_CHECKING

if TYPE_CHECKING:
    from server.upload.catalog import UploadCatalog


def build_context(
    client_context: dict,
    available_datasets: list[str],
    catalog: "UploadCatalog | None" = None,
) -> str:
    """Build a context block to append to the agent system prompt.

    Args:
        client_context: Dict from WebSocket message with keys:
            - bbox: list[float] | None (EPSG:3006 coordinates)
            - activeDataset: str | None
            - mapLayers: list[str] | None (names of layers on the map)
        available_datasets: List of dataset names from dtcc_core.datasets.list()
        catalog: Optional upload catalog for querying ingested GeoJSON files.

    Returns:
        Multi-line context string for system prompt injection.
    """
    lines = ["Current Atlas session context:"]

    bbox = client_context.get("bbox")
    if bbox and isinstance(bbox, list) and len(bbox) == 4:
        lines.append(f"- Bounding box: [{', '.join(str(v) for v in bbox)}] (EPSG:3006)")

    active = client_context.get("activeDataset")
    if active:
        lines.append(f"- Active dataset in UI: {active}")

    map_layers = client_context.get("mapLayers")
    if map_layers and isinstance(map_layers, list) and len(map_layers) > 0:
        lines.append(f"- Map layers visible: {', '.join(map_layers)}")

    if available_datasets:
        names = ", ".join(available_datasets)
        lines.append(f"- Available datasets: [{names}]")

    # Query catalog for uploaded GeoJSON files
    geojson_files = _get_uploaded_geojson_files(catalog)
    if geojson_files:
        lines.append("- Uploaded GeoJSON files available for analysis (use load_geojson tool with file_path):")
        for name, path in geojson_files:
            lines.append(f"  - {name}: {path}")

    return "\n".join(lines)


def _get_uploaded_geojson_files(
    catalog: "UploadCatalog | None",
) -> list[tuple[str, str]]:
    """Query the catalog for ingested GeoJSON datasets.

    Returns list of (dataset_name, absolute_file_path) tuples.
    """
    if catalog is None:
        return []
    try:
        datasets = catalog.list_uploaded_datasets(latest_only=True)
    except Exception:
        return []

    results = []
    for ds in datasets:
        if ds.get("detected_format") != "geojson":
            continue
        primary_file = ds.get("primary_file", "")
        if primary_file:
            results.append((ds["dataset_name"], primary_file))
    return results
