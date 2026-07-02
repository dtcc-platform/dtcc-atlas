"""
Discovery of published vector datasets.

Scans the published directory for datasets and their metadata.
"""

import json
from pathlib import Path
from typing import Optional

from server.config import PUBLISHED_DATASETS_DIR
from server.datasets.manifest_v2 import ManifestV2Error, load_manifest_v2, manifest_v2_summary


def discover_published_datasets(published_dir: Path | None = None) -> list[dict]:
    """
    Discover all published vector datasets.

    Reads the datasets.json index file if available, otherwise scans
    subdirectories for metadata.json files.

    Args:
        published_dir: Directory containing published datasets

    Returns:
        List of dataset info dicts with name, title, type, source, path
    """
    if published_dir is None:
        published_dir = PUBLISHED_DATASETS_DIR

    published_dir = Path(published_dir)

    if not published_dir.exists():
        return []

    # Try reading the index file first
    index_path = published_dir / "datasets.json"
    if index_path.exists():
        try:
            with open(index_path, "r", encoding="utf-8") as f:
                index = json.load(f)
            return index.get("datasets", [])
        except (json.JSONDecodeError, IOError):
            pass

    # Fall back to scanning directories
    datasets = []
    for subdir in published_dir.iterdir():
        if not subdir.is_dir():
            continue

        manifest_path = subdir / "manifest.json"
        if manifest_path.exists():
            try:
                summary = manifest_v2_summary(load_manifest_v2(manifest_path))
                identity = summary["identity"]
                datasets.append({
                    "name": identity.get("name") or subdir.name,
                    "title": summary.get("title") or identity.get("name") or subdir.name,
                    "type": "dataset_manifest_v2",
                    "source": "dtcc-upload",
                    "path": f"{subdir.name}/",
                    "bounds": summary.get("bounds"),
                    "manifest": "manifest.json",
                    "artifacts": summary["artifacts"],
                    "display_artifact": summary["display_artifact"],
                    "metadata": summary["metadata"],
                    "presentation": summary["presentation"],
                    "request": summary["request"],
                })
                continue
            except ManifestV2Error:
                continue

        metadata_path = subdir / "metadata.json"
        if metadata_path.exists():
            try:
                with open(metadata_path, "r", encoding="utf-8") as f:
                    metadata = json.load(f)
                datasets.append({
                    "name": metadata.get("name", subdir.name),
                    "title": metadata.get("title", subdir.name),
                    "type": "vector",
                    "source": metadata.get("source", "lm-geotorget"),
                    "path": f"{subdir.name}/",
                    "bounds": metadata.get("bounds"),
                })
            except (json.JSONDecodeError, IOError):
                continue

    return datasets


def get_dataset_metadata(dataset_name: str, published_dir: Path | None = None) -> Optional[dict]:
    """
    Get full metadata for a specific dataset.

    Args:
        dataset_name: Name of the dataset
        published_dir: Directory containing published datasets

    Returns:
        Metadata dict or None if not found
    """
    if published_dir is None:
        published_dir = PUBLISHED_DATASETS_DIR

    published_dir = Path(published_dir)
    metadata_path = published_dir / dataset_name / "metadata.json"

    if not metadata_path.exists():
        return None

    try:
        with open(metadata_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, IOError):
        return None


def get_dataset_geojson_path(dataset_name: str, published_dir: Path | None = None) -> Optional[Path]:
    """
    Get path to the GeoJSON data file for a dataset.

    Args:
        dataset_name: Name of the dataset
        published_dir: Directory containing published datasets

    Returns:
        Path to data.geojson or None if not found
    """
    if published_dir is None:
        published_dir = PUBLISHED_DATASETS_DIR

    published_dir = Path(published_dir)
    geojson_path = published_dir / dataset_name / "data.geojson"

    if geojson_path.exists():
        return geojson_path

    return None
