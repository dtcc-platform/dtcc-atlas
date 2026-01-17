"""Worker function for processing jobs in separate processes."""

from typing import Dict, Any, Tuple
import json
import re


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


def process_dataset_job(
    dataset_name: str,
    params: Dict[str, Any],
) -> Tuple[bytes, str, str]:
    """
    Process a dataset generation job.

    This function runs in a separate process via ProcessPoolExecutor.
    It imports dtcc_core here to ensure it's available in the worker process.

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

    try:
        import dtcc_lod2_roofer
    except ImportError:
        pass

    available_datasets = datasets.list()

    if dataset_name not in available_datasets:
        raise ValueError(f"Dataset '{dataset_name}' not found")

    dataset = available_datasets[dataset_name]

    try:
        # Validate and generate dataset
        _ = dataset.ArgsModel(**params)
        data = dataset(**params)
    except Exception as e:
        # Re-raise with cleaned error message
        clean_message = extract_error_message(e)
        raise RuntimeError(clean_message) from None

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
    }
    content_type = content_type_map.get(file_format, "application/octet-stream")

    # Handle cityjson extension
    extension = "city.json" if file_format == "cityjson" else file_format

    return (data, extension, content_type)
