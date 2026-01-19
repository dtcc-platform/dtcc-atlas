"""
Admin API routes for managing datasets and Geotorget orders.

Provides endpoints for:
- Listing published datasets with full metadata
- Listing downloaded orders
- Downloading new orders from Geotorget
- Publishing downloaded orders
- Deleting published datasets
"""

import json
import os
import shutil
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from server.config import PUBLISHED_DATASETS_DIR, BASE_DIR
from server.vector.discovery import get_dataset_metadata

from publisher import download_order, extract_and_publish


# Directory for downloaded orders (configurable via env var)
ORDERS_DIR = Path(
    os.getenv("ORDERS_DIR", BASE_DIR / "temp" / "dtcc-data")
)


class DownloadRequest(BaseModel):
    """Request model for order download."""
    order_id: str


def get_file_size_mb(path: Path) -> float:
    """Get file size in megabytes."""
    if path.is_file():
        return path.stat().st_size / (1024 * 1024)
    elif path.is_dir():
        total = sum(f.stat().st_size for f in path.rglob("*") if f.is_file())
        return total / (1024 * 1024)
    return 0.0


def create_admin_router() -> APIRouter:
    """
    Create the admin API router.

    Returns:
        FastAPI router with admin endpoints
    """
    router = APIRouter(prefix="/admin", tags=["admin"])

    @router.get("/datasets")
    async def list_datasets():
        """
        List all published datasets with full metadata.

        Returns dataset name, title, feature count, bounds, last updated,
        and size in MB.
        """
        published_dir = Path(PUBLISHED_DATASETS_DIR)
        if not published_dir.exists():
            return {"datasets": [], "total_count": 0, "total_size_mb": 0.0}

        datasets = []
        total_size = 0.0

        # Scan published directory for datasets
        for subdir in sorted(published_dir.iterdir()):
            if not subdir.is_dir():
                continue

            metadata_path = subdir / "metadata.json"
            data_path = subdir / "data.geojson"

            if not metadata_path.exists():
                continue

            try:
                with open(metadata_path, "r", encoding="utf-8") as f:
                    metadata = json.load(f)

                size_mb = get_file_size_mb(subdir)
                total_size += size_mb

                datasets.append({
                    "name": metadata.get("name", subdir.name),
                    "title": metadata.get("title", subdir.name),
                    "feature_count": metadata.get("feature_count", 0),
                    "bounds": metadata.get("bounds", []),
                    "updated": metadata.get("updated", ""),
                    "size_mb": round(size_mb, 2),
                })
            except (json.JSONDecodeError, IOError):
                continue

        return {
            "datasets": datasets,
            "total_count": len(datasets),
            "total_size_mb": round(total_size, 2),
        }

    @router.get("/orders")
    async def list_orders():
        """
        List all downloaded orders from the orders directory.

        Returns order ID, download date, file count, and size.
        """
        orders_dir = Path(ORDERS_DIR)
        if not orders_dir.exists():
            return {"orders": []}

        orders = []

        for subdir in sorted(orders_dir.iterdir(), reverse=True):
            if not subdir.is_dir():
                continue

            # Check for order metadata
            metadata_path = subdir / "order_metadata.json"

            if metadata_path.exists():
                try:
                    with open(metadata_path, "r", encoding="utf-8") as f:
                        metadata = json.load(f)

                    file_count = len(metadata.get("files", []))
                    download_date = metadata.get("download_date", "")
                except (json.JSONDecodeError, IOError):
                    file_count = len(list(subdir.glob("*.zip")))
                    download_date = ""
            else:
                file_count = len(list(subdir.glob("*.zip")))
                download_date = ""

            size_mb = get_file_size_mb(subdir)

            orders.append({
                "order_id": subdir.name,
                "download_date": download_date,
                "file_count": file_count,
                "size_mb": round(size_mb, 2),
            })

        return {"orders": orders}

    @router.post("/orders/download")
    async def download_new_order(request: DownloadRequest):
        """
        Download files for a Geotorget order.

        This performs a synchronous download of all files in the order.
        For large orders, this may take some time.
        """
        order_id = request.order_id.strip()

        if not order_id:
            raise HTTPException(status_code=400, detail="Order ID is required")

        # Validate UUID format (basic check)
        if len(order_id) < 32:
            raise HTTPException(status_code=400, detail="Invalid order ID format")

        orders_dir = Path(ORDERS_DIR)
        orders_dir.mkdir(parents=True, exist_ok=True)

        try:
            # Download the order
            order_path = download_order(
                order_id=order_id,
                output_dir=orders_dir,
                max_workers=4,
            )

            # Get result info
            metadata_path = order_path / "order_metadata.json"
            if metadata_path.exists():
                with open(metadata_path, "r", encoding="utf-8") as f:
                    metadata = json.load(f)
                files_downloaded = len(metadata.get("files", []))
            else:
                files_downloaded = len(list(order_path.glob("*.zip")))

            size_mb = get_file_size_mb(order_path)

            return {
                "success": True,
                "order_id": order_id,
                "files_downloaded": files_downloaded,
                "size_mb": round(size_mb, 2),
            }

        except ValueError as e:
            raise HTTPException(status_code=404, detail=str(e))
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Download failed: {str(e)}")

    @router.post("/orders/{order_id}/publish")
    async def publish_order(order_id: str):
        """
        Publish a downloaded order to GeoJSON datasets.

        Extracts GeoPackage files from the order and converts each layer
        to a published GeoJSON dataset.
        """
        orders_dir = Path(ORDERS_DIR)
        order_path = orders_dir / order_id

        if not order_path.exists():
            raise HTTPException(status_code=404, detail=f"Order '{order_id}' not found")

        try:
            published_datasets = extract_and_publish(
                order_dir=order_path,
                published_dir=PUBLISHED_DATASETS_DIR,
            )

            return {
                "success": True,
                "datasets_published": published_datasets,
                "count": len(published_datasets),
            }

        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Publish failed: {str(e)}")

    @router.delete("/datasets/{name}")
    async def delete_dataset(name: str):
        """
        Delete a published dataset.

        Removes the dataset directory and updates the datasets.json index.
        """
        published_dir = Path(PUBLISHED_DATASETS_DIR)
        dataset_dir = published_dir / name

        if not dataset_dir.exists():
            raise HTTPException(status_code=404, detail=f"Dataset '{name}' not found")

        try:
            # Remove dataset directory
            shutil.rmtree(dataset_dir)

            # Update index
            index_path = published_dir / "datasets.json"
            if index_path.exists():
                with open(index_path, "r", encoding="utf-8") as f:
                    index = json.load(f)

                index["datasets"] = [
                    d for d in index.get("datasets", [])
                    if d.get("name") != name
                ]
                index["updated"] = datetime.now().isoformat()

                with open(index_path, "w", encoding="utf-8") as f:
                    json.dump(index, f, indent=2)

            return {"success": True}

        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Delete failed: {str(e)}")

    return router
