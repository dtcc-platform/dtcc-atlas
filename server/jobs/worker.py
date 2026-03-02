"""Worker function for processing jobs in separate processes."""

from typing import Dict, Any, Tuple, Callable, Optional
import json
import re
import os
import tempfile
import time
from pathlib import Path


_PROGRESS_MIN_INTERVAL = 0.2
_PROGRESS_MIN_DELTA = 0.5


# NOTE: _patched_export_to_bytes is unused. The original
# DatasetDescriptor.export_to_bytes is used instead.
# The fsync it added is unnecessary (write and read happen in the same process),
# and the monkey-patch was a source of bugs (missing/mismatched save_callable
# parameter). Kept here for reference only.
#
# def _patched_export_to_bytes(obj, format: str, as_text=False, save_callable=None, **save_kwargs):
#     tmpfile = tempfile.NamedTemporaryFile(suffix=f".{format}", delete=False)
#     tmp_path = tmpfile.name
#     tmpfile.close()
#     try:
#         if save_callable is not None:
#             save_callable(obj, tmp_path, **save_kwargs)
#         else:
#             obj.save(tmp_path, **save_kwargs)
#         with open(tmp_path, 'rb') as f:
#             os.fsync(f.fileno())
#             data = f.read()
#         if as_text:
#             return data.decode('utf-8')
#         return data
#     finally:
#         try:
#             os.unlink(tmp_path)
#         except OSError:
#             pass


def extract_error_message(error: Exception) -> str:
    """
    Extract a user-friendly error message from an exception.

    Handles common error formats from dtcc-core and HTTP responses.
    """
    error_str = str(error)

    # Try to extract JSON detail message
    # Pattern: {"detail": "message"} or similar
    json_match = re.search(r'\{[^}]*"detail"\s*:\s*"([^"]+)"[^}]*\}', error_str)
    if json_match:
        return json_match.group(1)

    # Try to parse as JSON directly
    try:
        data = json.loads(error_str)
        if isinstance(data, dict) and "detail" in data:
            return data["detail"]
    except (json.JSONDecodeError, TypeError):
        pass

    # Check for common error patterns and simplify
    if "No lidar tiles intersect" in error_str:
        return "No LiDAR data available for this area"
    if "No buildings found" in error_str or "No building" in error_str:
        return "No building data available for this area"
    if "No data" in error_str.lower():
        return "No data available for the selected area"
    if "404" in error_str:
        return "Data not found for the selected area"
    if "timeout" in error_str.lower():
        return "Request timed out - try a smaller area"
    if "connection" in error_str.lower():
        return "Connection error - please try again"

    # Return original if no pattern matched, but truncate if too long
    if len(error_str) > 200:
        return error_str[:200] + "..."

    return error_str


def _make_progress_emitter(
    on_progress: Optional[Callable[[Dict[str, Any]], None]]
) -> Optional[Callable[[Dict[str, Any]], None]]:
    """Wrap raw progress callbacks with normalization and throttling."""
    if on_progress is None:
        return None

    last_emit_time = 0.0
    last_percent = -1.0

    def emit(state: Dict[str, Any]) -> None:
        nonlocal last_emit_time, last_percent
        if not isinstance(state, dict):
            return

        try:
            percent = float(state.get("percent", 0.0))
        except (TypeError, ValueError):
            percent = 0.0

        percent = max(0.0, min(100.0, percent))
        now = time.monotonic()
        should_emit = (
            percent >= 100.0
            or last_emit_time == 0.0
            or now - last_emit_time >= _PROGRESS_MIN_INTERVAL
            or abs(percent - last_percent) >= _PROGRESS_MIN_DELTA
        )
        if not should_emit:
            return

        payload = {
            "percent": round(percent, 2),
            "message": "" if state.get("message") is None else str(state.get("message")),
            "phase": None if state.get("phase") is None else str(state.get("phase")),
            "eta_formatted": (
                None if state.get("eta_formatted") is None else str(state.get("eta_formatted"))
            ),
            "phases": state.get("phases") if isinstance(state.get("phases"), dict) else None,
        }
        on_progress(payload)
        last_emit_time = now
        last_percent = percent

    return emit


def process_dataset_job(
    dataset_name: str,
    params: Dict[str, Any],
    on_progress: Optional[Callable[[Dict[str, Any]], None]] = None,
) -> Tuple[bytes, str, str]:
    """
    Process a dataset generation job.

    This function runs in a separate process via ProcessPoolExecutor.
    It imports dtcc_core here to ensure it's available in the worker process.

    Handles both dtcc-core datasets (raster) and published vector datasets.

    Args:
        dataset_name: Name of the dataset to generate.
        params: Parameters for the dataset generation.

    Returns:
        Tuple of (data bytes, file extension, content type).

    Raises:
        ValueError: If dataset not found.
        Exception: Any error during dataset generation (with cleaned message).
    """
    from dtcc_core import datasets
    from dtcc_core.datasets.dataset import DatasetDescriptor

    # Monkey-patch removed: the original export_to_bytes works correctly and
    # the patched version caused signature mismatches (see _patched_export_to_bytes above).

    try:
        import dtcc_lod2_roofer
    except ImportError:
        pass

    available_datasets = datasets.list()
    emit_progress = _make_progress_emitter(on_progress)

    # Check if it's a dtcc-core dataset
    if dataset_name in available_datasets:
        return _process_core_dataset(
            dataset_name,
            params,
            available_datasets,
            on_progress=emit_progress,
        )

    # Check if it's a published vector dataset
    from server.vector.discovery import get_dataset_geojson_path
    geojson_path = get_dataset_geojson_path(dataset_name)
    if geojson_path:
        return _process_vector_dataset(
            dataset_name,
            params,
            geojson_path,
            on_progress=emit_progress,
        )

    # Dataset not found in either source
    raise ValueError(f"Dataset '{dataset_name}' not found")


def _process_core_dataset(
    dataset_name: str,
    params: Dict[str, Any],
    available_datasets: Dict,
    on_progress: Optional[Callable[[Dict[str, Any]], None]] = None,
) -> Tuple[bytes, str, str]:
    """Process a dtcc-core dataset."""
    dataset = available_datasets[dataset_name]
    from dtcc_core.common.progress import ProgressTracker, set_progress_callback

    try:
        # Validate and generate dataset
        _ = dataset.ArgsModel(**params)
        if on_progress:
            on_progress(
                {
                    "percent": 0.0,
                    "phase": "prepare",
                    "message": "Preparing dataset request...",
                    "eta_formatted": None,
                    "phases": None,
                }
            )
            set_progress_callback(on_progress)
            try:
                with ProgressTracker(callback=on_progress, mode="callback"):
                    data = dataset(**params)
            finally:
                set_progress_callback(None)
        else:
            data = dataset(**params)
    except Exception as e:
        # Re-raise with cleaned error message
        clean_message = extract_error_message(e)
        raise RuntimeError(clean_message) from None

    # dtcc_core returns bytes when format is specified
    if data is None:
        raise RuntimeError("Dataset returned no data")
    if not isinstance(data, bytes):
        raise RuntimeError(f"Dataset returned unexpected type: {type(data).__name__}")
    if len(data) == 0:
        raise RuntimeError("Dataset returned empty data")

    # Determine file format from parameters
    file_format = params.get("format", "bin")

    # Map format to content type
    content_type_map = {
        "tif": "image/tiff",
        "obj": "model/obj",
        "stl": "model/stl",
        "copc": "application/octet-stream",
        "las": "application/octet-stream",
        "laz": "application/octet-stream",
        "cityjson": "application/json",
        "json": "application/json",
        "geojson": "application/geo+json",
        "gpkg": "application/geopackage+sqlite3",
    }
    content_type = content_type_map.get(file_format, "application/octet-stream")

    # Handle cityjson extension
    extension = "city.json" if file_format == "cityjson" else file_format

    if on_progress:
        on_progress(
            {
                "percent": 100.0,
                "phase": "complete",
                "message": "Dataset ready",
                "eta_formatted": None,
                "phases": None,
            }
        )

    return (data, extension, content_type)


def _process_vector_dataset(
    dataset_name: str,
    params: Dict[str, Any],
    geojson_path: Path,
    on_progress: Optional[Callable[[Dict[str, Any]], None]] = None,
) -> Tuple[bytes, str, str]:
    """Process a published vector dataset."""
    from server.vector.routes import clip_features_to_bounds

    if on_progress:
        on_progress(
            {
                "percent": 5.0,
                "phase": "load",
                "message": "Loading vector dataset...",
                "eta_formatted": None,
                "phases": None,
            }
        )

    bounds = params.get("bounds")
    if not bounds or len(bounds) != 4:
        raise ValueError("Bounds must be [minX, minY, maxX, maxY]")

    try:
        with open(geojson_path, "r", encoding="utf-8") as f:
            geojson = json.load(f)
    except (json.JSONDecodeError, IOError) as e:
        raise RuntimeError(f"Error reading dataset: {e}") from None

    if on_progress:
        on_progress(
            {
                "percent": 35.0,
                "phase": "clip",
                "message": "Clipping features to selected bounds...",
                "eta_formatted": None,
                "phases": None,
            }
        )

    # Filter features to bounds
    filtered = clip_features_to_bounds(geojson, bounds)
    feature_count = len(filtered.get("features", []))
    print(f"[job worker] Vector dataset '{dataset_name}': {feature_count} features within bounds")

    if on_progress:
        on_progress(
            {
                "percent": 80.0,
                "phase": "encode",
                "message": "Preparing GeoJSON download...",
                "eta_formatted": None,
                "phases": None,
            }
        )

    # Convert to bytes
    data = json.dumps(filtered).encode("utf-8")

    if on_progress:
        on_progress(
            {
                "percent": 100.0,
                "phase": "complete",
                "message": "Dataset ready",
                "eta_formatted": None,
                "phases": None,
            }
        )

    return (data, "geojson", "application/geo+json")
