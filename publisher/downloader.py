"""
Download Lantmateriet Geotorget orders.

Adapted from dtcc-geodb's download_order.py - contains the essential
functionality for downloading order files from Geotorget.
"""

import json
import requests
from pathlib import Path
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Callable

BASE_URL = "https://download-geotorget.lantmateriet.se/download"
DEFAULT_OUTPUT_DIR = Path.home() / "Downloads" / "geotorget"


def get_file_list(order_id: str) -> list[dict]:
    """
    Fetch the list of files for an order from Geotorget.

    Args:
        order_id: UUID of the order

    Returns:
        List of file metadata dicts with 'title', 'href', 'length', etc.
    """
    url = f"{BASE_URL}/{order_id}/files"
    response = requests.get(url, timeout=30)
    response.raise_for_status()
    return response.json()


def format_size(size_bytes: int) -> str:
    """Format byte size to human readable string."""
    if size_bytes < 1024:
        return f"{size_bytes} B"
    elif size_bytes < 1024 * 1024:
        return f"{size_bytes / 1024:.1f} KB"
    elif size_bytes < 1024 * 1024 * 1024:
        return f"{size_bytes / (1024 * 1024):.1f} MB"
    else:
        return f"{size_bytes / (1024 * 1024 * 1024):.2f} GB"


def download_file(
    file_info: dict,
    output_dir: Path,
    on_progress: Callable[[int], None] | None = None
) -> tuple[str, bool, str]:
    """
    Download a single file.

    Args:
        file_info: File metadata dict with 'title', 'href', 'length'
        output_dir: Directory to save the file
        on_progress: Optional callback for progress updates (bytes downloaded)

    Returns:
        Tuple of (filename, success, message)
    """
    title = file_info["title"]
    href = file_info["href"]
    total_size = file_info.get("length", 0)
    display_size = file_info.get("displaySize", "unknown size")
    output_path = output_dir / title

    if output_path.exists():
        if on_progress:
            on_progress(total_size)
        return (title, True, "already exists, skipped")

    try:
        response = requests.get(href, stream=True, timeout=300)
        response.raise_for_status()

        with open(output_path, "wb") as f:
            for chunk in response.iter_content(chunk_size=8192):
                if chunk:
                    f.write(chunk)
                    if on_progress:
                        on_progress(len(chunk))

        return (title, True, f"downloaded ({display_size})")
    except Exception as e:
        return (title, False, str(e))


def save_order_metadata(order_id: str, order_dir: Path, files: list[dict]) -> None:
    """Save order metadata for later reference."""
    metadata = {
        "order_id": order_id,
        "download_date": datetime.now().isoformat(),
        "files": files,
    }
    meta_path = order_dir / "order_metadata.json"
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2)


def download_order(
    order_id: str,
    output_dir: Path | None = None,
    max_workers: int = 4,
    on_file_complete: Callable[[str, bool, str], None] | None = None,
    on_progress: Callable[[int, int], None] | None = None,
) -> Path:
    """
    Download all files for a Geotorget order.

    Args:
        order_id: UUID of the order
        output_dir: Base directory for downloads (default: ~/Downloads/geotorget)
        max_workers: Number of parallel download threads
        on_file_complete: Callback when a file completes (filename, success, message)
        on_progress: Callback for overall progress (bytes_done, bytes_total)

    Returns:
        Path to the order directory containing downloaded files
    """
    if output_dir is None:
        output_dir = DEFAULT_OUTPUT_DIR

    order_dir = output_dir / order_id
    order_dir.mkdir(parents=True, exist_ok=True)

    # Get file list
    print(f"Fetching file list for order {order_id[:8]}...")
    files = get_file_list(order_id)

    if not files:
        raise ValueError(f"No files found for order {order_id}")

    total_size = sum(f.get("length", 0) for f in files)
    print(f"Found {len(files)} files, total size: {format_size(total_size)}")

    # Track progress
    bytes_downloaded = 0

    def track_progress(chunk_size: int):
        nonlocal bytes_downloaded
        bytes_downloaded += chunk_size
        if on_progress:
            on_progress(bytes_downloaded, total_size)

    # Download files in parallel
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {
            executor.submit(download_file, f, order_dir, track_progress): f
            for f in files
        }

        for future in as_completed(futures):
            file_info = futures[future]
            try:
                filename, success, message = future.result()
                if on_file_complete:
                    on_file_complete(filename, success, message)
                else:
                    status = "OK" if success else "FAILED"
                    print(f"  [{status}] {filename}: {message}")
            except Exception as e:
                filename = file_info.get("title", "unknown")
                if on_file_complete:
                    on_file_complete(filename, False, str(e))
                else:
                    print(f"  [FAILED] {filename}: {e}")

    # Save metadata
    save_order_metadata(order_id, order_dir, files)

    print(f"Download complete: {order_dir}")
    return order_dir
