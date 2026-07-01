# Interactive BBox Editing

**Date:** 2026-03-02
**Status:** Approved

## Problem

Users can only create bounding boxes by click-click drawing on the map. There is no way to enter exact coordinates, move an existing box, or resize it by dragging corners. This forces users to redraw from scratch whenever they need an adjustment.

## Solution

Three new capabilities for the bounding box system:

1. **Coordinate input** — A dialog to enter EPSG:3006 coordinates directly via a new Toolbar button.
2. **Drag-move** — Click and drag the bbox fill to translate it.
3. **Corner-resize** — Drag corner handles to resize the bbox.

Move and resize are only available in draw mode (when the Draw button is active).

## Requirements

| Decision | Choice |
|----------|--------|
| Coordinate input CRS | EPSG:3006 only |
| Popup trigger | New "Enter coords" button in Toolbar |
| Edit scope | Draw mode only (move/resize) |
| Auto-refresh | Datasets re-fetch on mouseup after move/resize |
| Approach | Custom mouse events on existing MapLibre layers |

## Architecture

### Interaction State Machine

The BBoxDrawer gains an explicit interaction state:

```
IDLE → (click map) → DRAWING → (second click) → EDITING
                                                    │
                          ┌─────────────────────────┤
                          │                         │
                  (mousedown fill)          (mousedown handle)
                          │                         │
                          ▼                         ▼
                       MOVING                   RESIZING
                          │                         │
                      (mouseup)                 (mouseup)
                          │                         │
                          └─────────┬───────────────┘
                                    ▼
                                 EDITING
                            (callback fires,
                             datasets refresh)
```

After completing a draw, the drawer enters EDITING state (handles visible, bbox interactive). Clicking empty map space starts a new draw (back to IDLE). When draw mode is toggled off, state resets and handles hide.

### Corner Handles

A new GeoJSON source `bbox-handles-source` with 4 Point features at each bbox corner. Each has a `corner` property (`nw`, `ne`, `sw`, `se`).

Rendered as a `circle` layer:
- 8px radius, white fill, 2px orange stroke
- Hover: scale to 10px
- Only visible in EDITING state (draw mode on + bbox exists)

### Cursor Feedback

| Context | Cursor |
|---------|--------|
| Hovering bbox fill | `grab` |
| Dragging bbox fill | `grabbing` |
| Hovering NW or SE handle | `nwse-resize` |
| Hovering NE or SW handle | `nesw-resize` |
| Drawing (after first click) | `crosshair` |

### Move Interaction

1. Mousedown on fill → record start lon/lat
2. Mousemove → compute delta, translate all 4 corners of the GeoJSON polygon
3. Mouseup → convert to EPSG:3006, validate area constraints, update `currentBbox`, fire callback

### Resize Interaction

1. Mousedown on handle → identify which corner, anchor = opposite corner
2. Mousemove → move grabbed corner while anchor stays fixed, update polygon + handles
3. Mouseup → normalize coords (ensure min < max), validate area, fire callback

### Coordinate Input Dialog

New component `CoordinateInputDialog.svelte`:
- 4 numeric fields: minX, minY, maxX, maxY
- Label: "EPSG:3006 coordinates (meters)"
- Pre-populated from current bbox if one exists
- Validates: minX < maxX, minY < maxY, area within 25 m² to 25 km²
- On Apply: constructs BoundingBox, calls `MapView.loadBbox(bbox)`

Triggered by new "Enter coordinates" button in Toolbar actions group (after Draw button).

### Data Flow

**Coordinate input:**
```
Toolbar "Enter coords" → CoordinateInputDialog opens
  → User enters values, clicks Apply
  → Validates constraints
  → App.svelte calls mapView.loadBbox(bbox)
  → Map zooms to extent, datasets refresh
```

**Move/resize:**
```
Draw mode active → bbox drawn → EDITING state
  → User drags fill or corner handle
  → BBoxDrawer updates preview in real-time
  → On mouseup: converts to EPSG:3006, validates
  → Fires onBBoxDrawn callback
  → MapView updates bbox store, fetches datasets
```

### Files Modified

- `frontend/src/lib/map/bbox-drawer.ts` — State machine, handle source/layer, move/resize logic
- `frontend/src/lib/components/Toolbar.svelte` — New "Enter coords" button
- `frontend/src/lib/components/CoordinateInputDialog.svelte` — New component
- `frontend/src/lib/components/MapView.svelte` — Minor adjustments for edit flow
- `frontend/src/App.svelte` — Wire coordinate dialog

### What This Does NOT Include

- Rotation of the bounding box
- Edge-drag resizing (only corners)
- Coordinate input in lon/lat (only EPSG:3006)
- Move/resize when draw mode is off
