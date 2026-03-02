# Upload-to-Map Zoom Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** After upload ingestion completes, auto-zoom the map to the uploaded data's extent, draw the same orange rectangle as the bbox drawer, and show a filename label at the top-left corner.

**Architecture:** Server computes a union bounding box (EPSG:3006) across all ingested datasets and returns it in the ingest response. Frontend receives it, flies the map to the extent, draws the orange rectangle via BBoxDrawer, and renders a text label via a new MapLibre symbol layer.

**Tech Stack:** Python (pyproj for CRS reprojection), FastAPI, Svelte 5, MapLibre GL, TypeScript

---

### Task 1: Server — Compute Combined Bounds in Ingest Response

**Files:**
- Modify: `server/upload/routes.py:196-253` (ingest_batch endpoint)
- Modify: `server/upload/ingest.py` (add bounds to per-candidate result)
- Test: `tests/test_upload_ingest.py`

**Context:** The `ingest_batch` endpoint in `routes.py:196-253` loops over candidates, calls `ingest_candidate()` for each, and builds `ingested`/`failed` lists. Each ingested candidate stores `bounds` (in native CRS) and `crs` in the DB via `catalog.insert_uploaded_dataset()`. The ingest result currently returns `candidate_id, success, dataset_name, version, inferred_type, role, warnings` but NOT bounds or crs. We need to:
1. Return `bounds` and `crs` from `ingest_candidate()`.
2. In the endpoint, collect all bounds, reproject to EPSG:3006, compute union, return as `combined_bounds`.

**Step 1: Write the failing test**

Add to `tests/test_upload_ingest.py`:

```python
from server.upload.routes import _compute_combined_bounds


def test_combined_bounds_single_epsg3006():
    ingested = [
        {"bounds": [319500.0, 6397200.0, 321800.0, 6399100.0], "crs": "EPSG:3006"}
    ]
    result = _compute_combined_bounds(ingested)
    assert result is not None
    assert result["crs"] == "EPSG:3006"
    assert result["minX"] == 319500.0
    assert result["minY"] == 6397200.0
    assert result["maxX"] == 321800.0
    assert result["maxY"] == 6399100.0


def test_combined_bounds_union_two_datasets():
    ingested = [
        {"bounds": [319500.0, 6397200.0, 320500.0, 6398200.0], "crs": "EPSG:3006"},
        {"bounds": [320000.0, 6398000.0, 321800.0, 6399100.0], "crs": "EPSG:3006"},
    ]
    result = _compute_combined_bounds(ingested)
    assert result is not None
    assert result["minX"] == 319500.0
    assert result["minY"] == 6397200.0
    assert result["maxX"] == 321800.0
    assert result["maxY"] == 6399100.0


def test_combined_bounds_no_bounds():
    ingested = [
        {"bounds": None, "crs": None},
    ]
    result = _compute_combined_bounds(ingested)
    assert result is None


def test_combined_bounds_mixed_crs():
    """Test that non-3006 bounds get reprojected."""
    # WGS84 point roughly in Gothenburg area
    ingested = [
        {"bounds": [11.9, 57.68, 12.0, 57.72], "crs": "EPSG:4326"},
    ]
    result = _compute_combined_bounds(ingested)
    assert result is not None
    assert result["crs"] == "EPSG:3006"
    # EPSG:3006 coords for Gothenburg area are roughly 318000-322000, 6396000-6401000
    assert 310000 < result["minX"] < 330000
    assert 6390000 < result["minY"] < 6410000
```

**Step 2: Run test to verify it fails**

Run: `conda run --no-capture-output -n fenicsx-env pytest tests/test_upload_ingest.py -v -k "combined_bounds"`
Expected: FAIL with `ImportError: cannot import name '_compute_combined_bounds'`

**Step 3: Implement `_compute_combined_bounds` in routes.py**

Add this function near the top of `server/upload/routes.py` (after imports):

```python
from pyproj import Transformer


def _compute_combined_bounds(
    ingested_results: list[dict],
) -> dict[str, float | str] | None:
    """Compute union bounding box in EPSG:3006 from ingested dataset results."""
    min_x, min_y = float("inf"), float("inf")
    max_x, max_y = float("-inf"), float("-inf")
    found_any = False

    for item in ingested_results:
        bounds = item.get("bounds")
        crs = item.get("crs")
        if not bounds or len(bounds) != 4:
            continue

        bx = [float(v) for v in bounds]

        if crs and crs != "EPSG:3006":
            try:
                transformer = Transformer.from_crs(crs, "EPSG:3006", always_xy=True)
                x1, y1 = transformer.transform(bx[0], bx[1])
                x2, y2 = transformer.transform(bx[2], bx[3])
                bx = [min(x1, x2), min(y1, y2), max(x1, x2), max(y1, y2)]
            except Exception:
                continue

        min_x = min(min_x, bx[0])
        min_y = min(min_y, bx[1])
        max_x = max(max_x, bx[2])
        max_y = max(max_y, bx[3])
        found_any = True

    if not found_any:
        return None

    return {
        "minX": min_x,
        "minY": min_y,
        "maxX": max_x,
        "maxY": max_y,
        "crs": "EPSG:3006",
    }
```

**Step 4: Update `ingest_candidate` return value in `server/upload/ingest.py`**

In the return dict at the end of `ingest_candidate()` (line ~305), add `bounds` and `crs`:

```python
    return {
        "candidate_id": candidate["id"],
        "success": True,
        "dataset_name": dataset_name,
        "version": version,
        "inferred_type": inferred_type,
        "role": role,
        "warnings": warnings,
        "bounds": bounds,    # NEW
        "crs": crs,          # NEW
    }
```

**Step 5: Update `ingest_batch` endpoint to include combined_bounds**

In `server/upload/routes.py`, in the `ingest_batch` endpoint, after building the `ingested` list and before the return statement (around line 247), add the combined bounds computation. Also include `batch_name` in the response:

```python
        combined_bounds = _compute_combined_bounds(ingested)

        return {
            "batch_id": batch_id,
            "batch_name": batch.get("name", ""),
            "ingested_count": len(ingested),
            "failed_count": len(failed),
            "ingested": ingested,
            "failed": failed,
            "combined_bounds": combined_bounds,
        }
```

**Step 6: Run tests to verify they pass**

Run: `conda run --no-capture-output -n fenicsx-env pytest tests/test_upload_ingest.py -v`
Expected: All tests PASS (existing + 4 new)

**Step 7: Commit**

```bash
git add server/upload/routes.py server/upload/ingest.py tests/test_upload_ingest.py
git commit -m "feat: compute combined bounds in ingest response"
```

---

### Task 2: Frontend — Update IngestResponse Type and UploadWizard

**Files:**
- Modify: `frontend/src/lib/api/upload-api.ts:37-43` (IngestResponse interface)
- Modify: `frontend/src/lib/components/UploadWizard.svelte` (add callback prop, call it after ingest)

**Context:** The `IngestResponse` interface at `upload-api.ts:37-43` currently has `batch_id, ingested_count, failed_count, ingested, failed`. We need to add `combined_bounds` and `batch_name`. The `UploadWizard` component calls `ingest()` at line 153, gets the response at line 170, and transitions to `'complete'` at line 177. We need to add an `onIngested` callback prop and call it with the bounds + batch name.

**Step 1: Update IngestResponse in `upload-api.ts`**

```typescript
export interface IngestResponse {
  batch_id: string
  batch_name?: string
  ingested_count: number
  failed_count: number
  ingested: Array<Record<string, unknown>>
  failed: Array<Record<string, unknown>>
  combined_bounds?: {
    minX: number
    minY: number
    maxX: number
    maxY: number
    crs: string
  } | null
}
```

**Step 2: Add `onIngested` callback to UploadWizard**

In `UploadWizard.svelte`, add the import and prop:

At the top of `<script>`, add `BoundingBox` import:
```typescript
import type { BoundingBox } from '../types'
```

Add the interface and props (after existing state declarations, around line 17):
```typescript
interface Props {
  onIngested?: (bounds: BoundingBox, label: string) => void
}

let { onIngested }: Props = $props()
```

**Step 3: Call onIngested after successful ingest**

In the `ingest()` function, after `step = 'complete'` (line 177), add:

```typescript
      // Zoom map to uploaded data extent
      if (resp.combined_bounds) {
        const bounds: BoundingBox = {
          minX: resp.combined_bounds.minX,
          minY: resp.combined_bounds.minY,
          maxX: resp.combined_bounds.maxX,
          maxY: resp.combined_bounds.maxY,
          crs: resp.combined_bounds.crs,
        }
        onIngested?.(bounds, resp.batch_name || uploadBatchName)
      }
```

**Step 4: Verify frontend builds**

Run: `cd frontend && npx vite build 2>&1 | tail -5`
Expected: Build succeeds

**Step 5: Commit**

```bash
git add frontend/src/lib/api/upload-api.ts frontend/src/lib/components/UploadWizard.svelte
git commit -m "feat: add onIngested callback with combined bounds to UploadWizard"
```

---

### Task 3: BBoxDrawer — Add Label Layer

**Files:**
- Modify: `frontend/src/lib/map/bbox-drawer.ts`

**Context:** `BBoxDrawer` manages a GeoJSON source `'bbox-source'` with fill+line layers. The `loadExtent(bbox)` method (line 394) displays a bbox programmatically. We need to:
1. Add a new point GeoJSON source `'bbox-label-source'` for the label position.
2. Add a symbol layer `'bbox-label'` that renders text at that point.
3. Extend `loadExtent(bbox, label?)` to accept an optional label.
4. Clear the label in `clearBboxDisplay()` and `clearBoundingBox()`.

**Step 1: Add label source and layer constants**

In the class, after the existing layer constants (around line 27):

```typescript
  private readonly BBOX_LABEL_SOURCE = 'bbox-label-source';
  private readonly BBOX_LABEL_LAYER = 'bbox-label';
```

**Step 2: Add label source and layer in `setupLayers()`**

After the existing `addLayer` calls for fill and line (after line 78), add:

```typescript
      // Add label point source
      this.map.addSource(this.BBOX_LABEL_SOURCE, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      // Add label layer
      this.map.addLayer({
        id: this.BBOX_LABEL_LAYER,
        type: 'symbol',
        source: this.BBOX_LABEL_SOURCE,
        layout: {
          'text-field': ['get', 'label'],
          'text-size': 12,
          'text-anchor': 'top-left',
          'text-offset': [0.5, 0.5],
          'text-font': ['Open Sans Bold'],
        },
        paint: {
          'text-color': '#ffffff',
          'text-halo-color': '#1a1a2e',
          'text-halo-width': 2,
        },
      });
```

**Step 3: Add private method to update/clear the label**

```typescript
  private updateLabelDisplay(lon: number, lat: number, label: string): void {
    const source = this.map.getSource(this.BBOX_LABEL_SOURCE) as maplibregl.GeoJSONSource;
    if (!source) return;
    source.setData({
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: { label },
        geometry: { type: 'Point', coordinates: [lon, lat] },
      }],
    });
  }

  private clearLabelDisplay(): void {
    const source = this.map.getSource(this.BBOX_LABEL_SOURCE) as maplibregl.GeoJSONSource;
    if (!source) return;
    source.setData({ type: 'FeatureCollection', features: [] });
  }
```

**Step 4: Update `loadExtent` signature to accept optional label**

Change the method signature and body (line 394):

```typescript
  loadExtent(bbox: BoundingBox, label?: string): void {
    // Clear any existing drawing
    this.disableDrawing();

    // Convert from EPSG:3006 to lon/lat for display
    const [minLon, minLat] = this.fromEPSG3006(bbox.minX, bbox.minY);
    const [maxLon, maxLat] = this.fromEPSG3006(bbox.maxX, bbox.maxY);

    this.updateBboxDisplay(minLon, minLat, maxLon, maxLat);
    this.currentBbox = bbox;

    // Show label at top-left corner if provided
    if (label) {
      this.updateLabelDisplay(minLon, maxLat, label);
    } else {
      this.clearLabelDisplay();
    }

    // ... rest of the method unchanged (mousemove listeners, callback)
  }
```

**Step 5: Clear label in `clearBboxDisplay`**

In `clearBboxDisplay()` (around line 140), add at the end:

```typescript
    this.clearLabelDisplay();
```

**Step 6: Verify frontend builds**

Run: `cd frontend && npx vite build 2>&1 | tail -5`
Expected: Build succeeds

**Step 7: Commit**

```bash
git add frontend/src/lib/map/bbox-drawer.ts
git commit -m "feat: add label layer to BBoxDrawer for upload extent labels"
```

---

### Task 4: Wire UploadWizard → MapView in App.svelte

**Files:**
- Modify: `frontend/src/lib/components/MapView.svelte:53-60` (loadBbox method)
- Modify: `frontend/src/App.svelte:249-251` (UploadWizard usage)

**Context:** `MapView.loadBbox(b)` at line 53 calls `drawer.loadExtent(b)` then `bbox.set(b)` and fetches datasets. We need to pass the label through. `App.svelte` renders `<UploadWizard />` at line 250. We need to add the `onIngested` prop.

**Step 1: Update `MapView.loadBbox` to accept optional label**

```typescript
  export function loadBbox(b: BoundingBox, label?: string) {
    drawer?.loadExtent(b, label)
    bbox.set(b)
    fetchDatasetList().then((list) => {
      datasets.set(list)
      activePanel.set('datasets')
    })
  }
```

**Step 2: Add handler in App.svelte and wire to UploadWizard**

Add handler function (after `handleClear` around line 209):

```typescript
  function handleIngested(bounds: BoundingBox, label: string) {
    mapView?.loadBbox(bounds, label)
  }
```

Add import for BoundingBox if not already imported:
```typescript
  import type { BoundingBox } from './lib/types'
```

Update the UploadWizard in the template:

```svelte
<UploadWizard onIngested={handleIngested} />
```

**Step 3: Verify frontend builds**

Run: `cd frontend && npx vite build 2>&1 | tail -5`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add frontend/src/lib/components/MapView.svelte frontend/src/App.svelte
git commit -m "feat: wire upload ingestion to map zoom with label"
```

---

### Task 5: Manual Integration Test

**Files:** None (testing only)

**Step 1: Start both servers**

Terminal 1: `cd frontend && npm run start`
Terminal 2: `conda run --no-capture-output -n fenicsx-env uvicorn server.main:app --host 127.0.0.1 --port 8000 --loop asyncio`

**Step 2: Test upload flow**

1. Open `http://localhost:3000` in browser
2. Click "Uploads" in the toolbar
3. Upload a GeoJSON or Shapefile with known bounds
4. Click "Scan files" → review candidates
5. Click "Ingest selected"
6. **Expected:** Map zooms to the uploaded data's extent, orange rectangle appears, filename label shows at top-left corner, datasets panel opens showing the new dataset

**Step 3: Test clear behavior**

1. Click "Clear" button in toolbar
2. **Expected:** Orange rectangle and label disappear

**Step 4: Test draw after upload**

1. Click "Draw area" and draw a new bbox
2. **Expected:** Old label gone, new rectangle appears, no label on hand-drawn bbox

**Step 5: Run all existing tests to verify no regressions**

Run: `conda run --no-capture-output -n fenicsx-env pytest tests/ --ignore=tests/test_api_main_endpoints.py -v`
Expected: All tests PASS
