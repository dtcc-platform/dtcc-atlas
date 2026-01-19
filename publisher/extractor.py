"""
Extract GeoPackage data and convert to GeoJSON for publishing.

Handles the conversion pipeline from downloaded Geotorget orders
to published GeoJSON files that can be discovered by the server.
"""

import json
import zipfile
import tempfile
import shutil
from pathlib import Path
from datetime import datetime
from typing import Iterator

from .gpkg_reader import GeoPackageReader, Feature
from .wkb_parser import wkb_to_geojson


DEFAULT_PUBLISHED_DIR = Path("data/published")


def find_gpkg_in_order(order_dir: Path) -> list[tuple[Path, str]]:
    """
    Find all GeoPackage files in an order directory.

    Scans ZIP files for .gpkg files.

    Args:
        order_dir: Path to the downloaded order directory

    Returns:
        List of (zip_path, inner_gpkg_path) tuples
    """
    gpkg_files = []

    for zip_path in order_dir.glob("*.zip"):
        try:
            with zipfile.ZipFile(zip_path, "r") as zf:
                for info in zf.infolist():
                    if info.filename.lower().endswith(".gpkg"):
                        gpkg_files.append((zip_path, info.filename))
        except zipfile.BadZipFile:
            continue

    return gpkg_files


def extract_gpkg_from_zip(zip_path: Path, inner_path: str, output_dir: Path) -> Path:
    """
    Extract a GeoPackage file from a ZIP archive.

    Args:
        zip_path: Path to the ZIP file
        inner_path: Path to the .gpkg within the ZIP
        output_dir: Directory to extract to

    Returns:
        Path to the extracted .gpkg file
    """
    with zipfile.ZipFile(zip_path, "r") as zf:
        zf.extract(inner_path, output_dir)

    return output_dir / inner_path


def layer_to_geojson(
    reader: GeoPackageReader,
    layer: str,
    include_properties: bool = True
) -> dict:
    """
    Convert a GeoPackage layer to GeoJSON FeatureCollection.

    Args:
        reader: GeoPackageReader instance
        layer: Layer name
        include_properties: Whether to include feature properties

    Returns:
        GeoJSON FeatureCollection dict
    """
    info = reader.get_layer_info(layer)
    extent = reader.get_extent(layer)

    features = []
    for feature in reader.read_layer(layer):
        if feature.geometry is None:
            continue

        try:
            geom = wkb_to_geojson(feature.geometry)
        except (ValueError, Exception) as e:
            # Skip features with invalid geometry
            continue

        gj_feature = {
            "type": "Feature",
            "id": feature.fid,
            "geometry": geom,
            "properties": feature.properties if include_properties else {}
        }
        features.append(gj_feature)

    return {
        "type": "FeatureCollection",
        "features": features,
        "bbox": list(extent),
        "crs": {
            "type": "name",
            "properties": {"name": f"EPSG:{info.srid}"}
        }
    }


def create_metadata(
    layer_name: str,
    info,  # LayerInfo
    extent: tuple[float, float, float, float],
    feature_count: int,
    source_order_id: str | None = None
) -> dict:
    """
    Create metadata.json content for a published dataset.

    Args:
        layer_name: Name of the layer/dataset
        info: LayerInfo from GeoPackageReader
        extent: Bounding box (min_x, min_y, max_x, max_y)
        feature_count: Number of features
        source_order_id: Original Geotorget order ID

    Returns:
        Metadata dict
    """
    return {
        "name": layer_name,
        "title": layer_name.replace("_", " ").title(),
        "description": f"Vector data from Lantmateriet Geotorget",
        "source": "lm-geotorget",
        "type": "vector",
        "format": "geojson",
        "geometry_type": info.geometry_type,
        "crs": f"EPSG:{info.srid}",
        "bounds": list(extent),
        "feature_count": feature_count,
        "updated": datetime.now().isoformat(),
        "source_order_id": source_order_id,
        "schema": {
            "type": "object",
            "properties": {
                "bounds": {
                    "type": "array",
                    "description": "Bounding box [minX, minY, maxX, maxY]",
                    "items": {"type": "number"},
                    "minItems": 4,
                    "maxItems": 4
                },
                "format": {
                    "type": "string",
                    "enum": ["geojson"],
                    "default": "geojson"
                }
            },
            "required": ["bounds"]
        },
        "columns": [{"name": col[0], "type": col[1]} for col in info.columns]
    }


def update_datasets_index(published_dir: Path, dataset_name: str, metadata: dict) -> None:
    """
    Update the master datasets.json index with a new dataset.

    Args:
        published_dir: Root published directory
        dataset_name: Name of the dataset
        metadata: Dataset metadata
    """
    index_path = published_dir / "datasets.json"

    if index_path.exists():
        with open(index_path, "r", encoding="utf-8") as f:
            index = json.load(f)
    else:
        index = {
            "version": "1.0",
            "updated": datetime.now().isoformat(),
            "datasets": []
        }

    # Find and update or append dataset entry
    dataset_entry = {
        "name": dataset_name,
        "title": metadata.get("title", dataset_name),
        "type": "vector",
        "source": "lm-geotorget",
        "path": f"{dataset_name}/"
    }

    # Remove existing entry with same name if present
    index["datasets"] = [d for d in index["datasets"] if d["name"] != dataset_name]
    index["datasets"].append(dataset_entry)
    index["updated"] = datetime.now().isoformat()

    with open(index_path, "w", encoding="utf-8") as f:
        json.dump(index, f, indent=2)


def extract_and_publish(
    order_dir: Path,
    published_dir: Path | None = None,
    layers: list[str] | None = None,
    on_progress: callable = None
) -> list[str]:
    """
    Extract GeoPackage data from an order and publish as GeoJSON.

    Args:
        order_dir: Path to the downloaded order directory
        published_dir: Where to publish (default: data/published)
        layers: Specific layers to extract (default: all)
        on_progress: Callback for progress updates

    Returns:
        List of published dataset names
    """
    if published_dir is None:
        published_dir = DEFAULT_PUBLISHED_DIR

    published_dir = Path(published_dir)
    published_dir.mkdir(parents=True, exist_ok=True)

    # Find GeoPackage files
    gpkg_files = find_gpkg_in_order(order_dir)
    if not gpkg_files:
        raise ValueError(f"No GeoPackage files found in {order_dir}")

    order_id = order_dir.name
    published_datasets = []

    # Process each GeoPackage
    with tempfile.TemporaryDirectory() as temp_dir:
        temp_path = Path(temp_dir)

        for zip_path, inner_path in gpkg_files:
            if on_progress:
                on_progress(f"Extracting {inner_path}...")

            # Extract GeoPackage from ZIP
            gpkg_path = extract_gpkg_from_zip(zip_path, inner_path, temp_path)

            # Read and convert layers
            with GeoPackageReader(gpkg_path) as reader:
                available_layers = reader.list_layers()

                if layers:
                    # Filter to requested layers
                    process_layers = [l for l in layers if l in available_layers]
                else:
                    process_layers = available_layers

                for layer_name in process_layers:
                    if on_progress:
                        on_progress(f"Processing layer: {layer_name}")

                    # Get layer info
                    info = reader.get_layer_info(layer_name)
                    extent = reader.get_extent(layer_name)

                    # Convert to GeoJSON
                    geojson = layer_to_geojson(reader, layer_name)
                    feature_count = len(geojson["features"])

                    if feature_count == 0:
                        if on_progress:
                            on_progress(f"  Skipping {layer_name}: no features")
                        continue

                    # Create output directory
                    dataset_dir = published_dir / layer_name
                    dataset_dir.mkdir(parents=True, exist_ok=True)

                    # Write GeoJSON
                    geojson_path = dataset_dir / "data.geojson"
                    with open(geojson_path, "w", encoding="utf-8") as f:
                        json.dump(geojson, f)

                    # Write metadata
                    metadata = create_metadata(
                        layer_name, info, extent, feature_count, order_id
                    )
                    metadata_path = dataset_dir / "metadata.json"
                    with open(metadata_path, "w", encoding="utf-8") as f:
                        json.dump(metadata, f, indent=2)

                    # Update index
                    update_datasets_index(published_dir, layer_name, metadata)

                    published_datasets.append(layer_name)

                    if on_progress:
                        on_progress(f"  Published {layer_name}: {feature_count} features")

    return published_datasets


def list_published_datasets(published_dir: Path | None = None) -> list[dict]:
    """
    List all published datasets.

    Args:
        published_dir: Published directory (default: data/published)

    Returns:
        List of dataset info dicts
    """
    if published_dir is None:
        published_dir = DEFAULT_PUBLISHED_DIR

    published_dir = Path(published_dir)
    index_path = published_dir / "datasets.json"

    if not index_path.exists():
        return []

    with open(index_path, "r", encoding="utf-8") as f:
        index = json.load(f)

    return index.get("datasets", [])
