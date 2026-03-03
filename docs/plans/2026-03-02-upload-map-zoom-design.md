# Upload-to-Map Zoom with Label

**Date:** 2026-03-02
**Status:** Approved

## Problem

After uploading data, the map does not reflect the uploaded dataset. Users have no visual confirmation of where their data covers. They must manually draw a bbox to discover their newly-uploaded datasets.

## Solution

After ingestion completes, the map automatically zooms to the uploaded data's extent, draws the same orange rectangle used by the bbox drawer, and places a small filename label at the top-left corner of the extent.

## Requirements

| Decision | Choice |
|----------|--------|
| Trigger | Auto-zoom immediately after ingestion completes |
| Multi-file handling | Combined extent (union of all ingested datasets' bounds) |
| CRS handling | Server-side reprojection to EPSG:3006 during ingest response |
| Label position | Small chip at top-left of extent rectangle |
| Label persistence | Clears when bbox is cleared or redrawn |
| Label content | Batch name |

## Architecture: Approach A — Extend Ingest + BBoxDrawer Label

### Server Changes

The `POST /uploads/batches/{batch_id}/ingest` endpoint computes a union bounding box across all successfully ingested datasets:

1. For each ingested candidate, read `bounds_json` and `crs` from the freshly-inserted `uploaded_datasets` row.
2. Reproject each dataset's bounds to EPSG:3006 using pyproj (if not already in 3006).
3. Compute the union: `min(all minX), min(all minY), max(all maxX), max(all maxY)`.
4. Include `batch_name` from the batch record.
5. Return new fields in the ingest response:

```json
{
  "batch_id": "...",
  "ingested_count": 2,
  "combined_bounds": {
    "minX": 319500, "minY": 6397200,
    "maxX": 321800, "maxY": 6399100,
    "crs": "EPSG:3006"
  },
  "batch_name": "my_upload",
  "ingested": [...]
}
```

If no datasets have valid bounds, `combined_bounds` is `null`.

**Files modified:**
- `server/upload/routes.py` — add bounds union logic to ingest endpoint
- `server/upload/catalog.py` — helper to get bounds for recently-ingested datasets (may already exist)

### Frontend Changes

#### UploadWizard → App.svelte Event

UploadWizard gains a callback prop `onIngested(bounds, label)`:

- Called after successful ingestion if `combined_bounds` is present in the response.
- Passes the bounds as a `BoundingBox` object and the batch name as the label.

**Files modified:**
- `frontend/src/lib/components/UploadWizard.svelte` — add `onIngested` prop, call it after ingest
- `frontend/src/App.svelte` — wire `onIngested` to MapView

#### App.svelte Handler

Receives the bounds + label and calls `MapView.loadBbox(bounds, label)`.

This reuses the existing flow: draws the orange extent rectangle, sets `bbox` store, fetches datasets, opens the datasets panel.

#### BBoxDrawer Label Layer

BBoxDrawer adds an optional text label:

1. New GeoJSON source: `'bbox-label-source'` — a single Point feature at the top-left corner of the extent.
2. New symbol layer: `'bbox-label'` — renders the label text as a white-on-navy pill.
3. `loadExtent(bbox, label?)` gains an optional second parameter. When provided, the label source is updated.
4. `clearBoundingBox()` also clears the label source.
5. Hand-drawn bboxes (no label) show no label.

**Files modified:**
- `frontend/src/lib/map/bbox-drawer.ts` — add label source, label layer, update loadExtent signature
- `frontend/src/lib/components/MapView.svelte` — pass label through loadBbox

### Data Flow

```
Ingest completes
  → Server computes combined_bounds (EPSG:3006) + batch_name
  → Frontend receives ingest response
  → UploadWizard calls onIngested(bounds, batchName)
  → App.svelte calls MapView.loadBbox(bounds, batchName)
  → MapView calls drawer.loadExtent(bbox, label)
  → BBoxDrawer draws extent rectangle + label at top-left
  → bbox store updated → datasets fetched → panel opens
```

### What This Does NOT Include

- Individual per-dataset extents (only combined union)
- Persistent labels after bbox clear
- Label editing or customization
- Client-side CRS reprojection
