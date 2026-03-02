# Interactive BBox Editing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add coordinate text input, drag-to-move, and corner-resize to the bounding box drawing system.

**Architecture:** Extend BBoxDrawer with an explicit interaction state machine (idle/drawing/editing/moving/resizing), corner handle circle layers, and mouse event handlers for drag-move and resize. Add a CoordinateInputDialog component triggered by a new Toolbar button.

**Tech Stack:** Svelte 5 (runes), MapLibre GL JS, TypeScript, proj4

---

### Task 1: BBoxDrawer — Add Interaction State and Corner Handles Layer

**Files:**
- Modify: `frontend/src/lib/map/bbox-drawer.ts`

**Context:** The BBoxDrawer currently uses implicit state (`firstCorner` being set or null). We need to formalize this into an explicit state enum and add a new GeoJSON source + circle layer for the 4 corner handles. Handles are only visible when a bbox exists and drawing is active (EDITING state).

**Step 1: Add InteractionState type and handle constants**

At the top of `bbox-drawer.ts`, after the imports (line 4), add:

```typescript
type InteractionState = 'idle' | 'drawing' | 'editing' | 'moving' | 'resizing';
```

Inside the class, after the existing layer constants (line 29), add:

```typescript
  private readonly BBOX_HANDLES_SOURCE = 'bbox-handles-source';
  private readonly BBOX_HANDLES_LAYER = 'bbox-handles';
  private interactionState: InteractionState = 'idle';
  private activeCorner: string | null = null;
  private dragStart: { lng: number; lat: number } | null = null;
  private anchorCorner: [number, number] | null = null;
  // Current bbox corners in lon/lat for real-time manipulation
  private displayCorners: { minLon: number; minLat: number; maxLon: number; maxLat: number } | null = null;
```

**Step 2: Add handles source and layer in `setupLayers()`**

After the label layer `addLayer` call (after line 105), add:

```typescript
      // Add corner handles source
      this.map.addSource(this.BBOX_HANDLES_SOURCE, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      // Add corner handles layer (circles)
      this.map.addLayer({
        id: this.BBOX_HANDLES_LAYER,
        type: 'circle',
        source: this.BBOX_HANDLES_SOURCE,
        paint: {
          'circle-radius': [
            'case',
            ['boolean', ['feature-state', 'hover'], false],
            6,
            5,
          ],
          'circle-color': '#ffffff',
          'circle-stroke-color': '#E35A1D',
          'circle-stroke-width': 2,
        },
      });
```

**Step 3: Add `updateHandles` and `clearHandles` private methods**

After the `clearLabelDisplay()` method (after line 195), add:

```typescript
  private updateHandles(minLon: number, minLat: number, maxLon: number, maxLat: number): void {
    const source = this.map.getSource(this.BBOX_HANDLES_SOURCE) as maplibregl.GeoJSONSource;
    if (!source) return;
    source.setData({
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: { corner: 'sw' }, geometry: { type: 'Point', coordinates: [minLon, minLat] } },
        { type: 'Feature', properties: { corner: 'se' }, geometry: { type: 'Point', coordinates: [maxLon, minLat] } },
        { type: 'Feature', properties: { corner: 'ne' }, geometry: { type: 'Point', coordinates: [maxLon, maxLat] } },
        { type: 'Feature', properties: { corner: 'nw' }, geometry: { type: 'Point', coordinates: [minLon, maxLat] } },
      ],
    });
  }

  private clearHandles(): void {
    const source = this.map.getSource(this.BBOX_HANDLES_SOURCE) as maplibregl.GeoJSONSource;
    if (!source) return;
    source.setData({ type: 'FeatureCollection', features: [] });
  }
```

**Step 4: Update `clearBboxDisplay` to also clear handles**

In `clearBboxDisplay()` (line 167), add `this.clearHandles();` after `this.clearLabelDisplay();` (line 175):

```typescript
  private clearBboxDisplay(): void {
    const source = this.map.getSource(this.BBOX_SOURCE) as maplibregl.GeoJSONSource;
    if (!source) return;
    source.setData({
      type: 'FeatureCollection',
      features: [],
    });
    this.clearLabelDisplay();
    this.clearHandles();
  }
```

**Step 5: Verify frontend builds**

Run: `cd frontend && npx vite build 2>&1 | tail -5`
Expected: Build succeeds (new code is added but not yet wired into interactions)

**Step 6: Commit**

```bash
git add frontend/src/lib/map/bbox-drawer.ts
git commit -m "feat: add interaction state and corner handles layer to BBoxDrawer"
```

---

### Task 2: BBoxDrawer — Implement EDITING State Transition

**Files:**
- Modify: `frontend/src/lib/map/bbox-drawer.ts`

**Context:** Currently, after the second click completes the bbox, the drawer resets `firstCorner` and waits for another draw. We need to instead transition to EDITING state: show corner handles, keep the bbox interactive. The `onBBoxDrawn` callback still fires (so datasets refresh), but `drawingActive` store should NOT be set to false — the MapView callback needs adjusting too. However, in this task we only change the drawer; MapView changes come in Task 6.

**Step 1: Update `enableDrawing()` to use state**

Replace the body of `enableDrawing()` (lines 328-348):

```typescript
  enableDrawing(): void {
    if (this.isDrawingActive) {
      console.debug('Drawing already enabled, skipping');
      return;
    }

    // Clear any existing box when starting a new draw
    this.clearBboxDisplay();
    this.currentBbox = null;
    this.firstCorner = null;
    this.displayCorners = null;
    this.interactionState = 'idle';

    this.isDrawingActive = true;
    this.map.getCanvas().style.cursor = 'crosshair';

    // Add event listeners
    this.map.on('click', this.onClick);
    this.map.on('mousemove', this.onMouseMove);
    this.map.getCanvas().addEventListener('mouseleave', this.onMouseLeave);

    console.log('Bounding box drawing enabled (click-click mode)');
  }
```

**Step 2: Update `disableDrawing()` to reset state**

Replace the body of `disableDrawing()` (lines 382-399):

```typescript
  disableDrawing(): void {
    if (!this.isDrawingActive) {
      console.debug('Drawing already disabled, skipping');
      return;
    }

    this.isDrawingActive = false;
    this.firstCorner = null;
    this.interactionState = 'idle';
    this.activeCorner = null;
    this.dragStart = null;
    this.anchorCorner = null;
    this.displayCorners = null;
    this.map.getCanvas().style.cursor = '';

    // Remove event listeners
    this.map.off('click', this.onClick);
    this.map.off('mousemove', this.onMouseMove);
    this.map.getCanvas().removeEventListener('mouseleave', this.onMouseLeave);

    // Hide handles when draw mode is off
    this.clearHandles();

    this.tooltip.classList.add('hidden');
    console.log('Bounding box drawing disabled');
  }
```

**Step 3: Update `onClick` to transition to EDITING after second click**

Replace the second-click branch in `onClick` (lines 233-277). After the `this.callback` call and before the end of the else block, instead of just resetting `firstCorner`, enter EDITING state and show handles:

```typescript
  private onClick = (e: maplibregl.MapMouseEvent): void => {
    if (!this.isDrawingActive) return;

    const { lng, lat } = e.lngLat;

    // If in EDITING state, clicking empty space starts a new draw
    if (this.interactionState === 'editing') {
      // Check if click is on the bbox fill or handles — if so, ignore (handled by move/resize)
      const features = this.map.queryRenderedFeatures(e.point, {
        layers: [this.BBOX_FILL_LAYER, this.BBOX_HANDLES_LAYER],
      });
      if (features.length > 0) return;

      // Click on empty space → start new draw
      this.clearBboxDisplay();
      this.currentBbox = null;
      this.displayCorners = null;
      this.interactionState = 'idle';
    }

    if (this.interactionState === 'moving' || this.interactionState === 'resizing') return;

    if (!this.firstCorner) {
      // First click - set the first corner
      this.firstCorner = [lng, lat];
      this.interactionState = 'drawing';
      this.map.getCanvas().style.cursor = 'crosshair';
    } else {
      // Second click - complete the bbox
      const [lon1, lat1] = this.firstCorner;
      const minLon = Math.min(lon1, lng);
      const maxLon = Math.max(lon1, lng);
      const minLat = Math.min(lat1, lat);
      const maxLat = Math.max(lat1, lat);

      // Calculate area and validate
      const areaM2 = this.calculateArea(minLon, minLat, maxLon, maxLat);

      if (areaM2 < MIN_BBOX_AREA_M2) {
        console.warn(`Area is too small (minimum ${MIN_BBOX_AREA_M2} m²). Please draw a larger area.`);
        return;
      }

      if (areaM2 > MAX_BBOX_AREA_M2) {
        console.warn(`Area exceeds ${MAX_BBOX_AREA_KM2} km² limit. Please draw a smaller area.`);
        return;
      }

      // Convert to EPSG:3006 for the callback
      const [minX, minY] = this.toEPSG3006(minLon, minLat);
      const [maxX, maxY] = this.toEPSG3006(maxLon, maxLat);

      this.currentBbox = {
        minX: Math.min(minX, maxX),
        minY: Math.min(minY, maxY),
        maxX: Math.max(minX, maxX),
        maxY: Math.max(minY, maxY),
        crs: 'EPSG:3006',
      };

      // Update display with final bbox
      this.updateBboxDisplay(minLon, minLat, maxLon, maxLat);

      // Store display corners for move/resize
      this.displayCorners = { minLon, minLat, maxLon, maxLat };

      // Show corner handles (enter EDITING state)
      this.updateHandles(minLon, minLat, maxLon, maxLat);
      this.interactionState = 'editing';
      this.firstCorner = null;
      this.map.getCanvas().style.cursor = '';

      // Call the callback
      if (this.callback) {
        this.callback(this.currentBbox);
      }
    }
  };
```

**Step 4: Verify frontend builds**

Run: `cd frontend && npx vite build 2>&1 | tail -5`
Expected: Build succeeds

**Step 5: Commit**

```bash
git add frontend/src/lib/map/bbox-drawer.ts
git commit -m "feat: implement EDITING state transition with corner handles"
```

---

### Task 3: BBoxDrawer — Implement Drag-to-Move

**Files:**
- Modify: `frontend/src/lib/map/bbox-drawer.ts`

**Context:** When the user mousedowns on the bbox fill layer in EDITING state, we transition to MOVING state. During MOVING, we track the mouse delta and translate the entire bbox polygon + handles. On mouseup, we finalize by converting back to EPSG:3006, validating, and firing the callback.

**Step 1: Add `onMouseDown` handler for move and resize**

Add this new method to the class (after `onMouseLeave`):

```typescript
  private onMouseDown = (e: maplibregl.MapMouseEvent): void => {
    if (!this.isDrawingActive || !this.displayCorners) return;
    if (this.interactionState !== 'editing') return;

    // Check if clicking on a handle (resize takes priority)
    const handleFeatures = this.map.queryRenderedFeatures(e.point, {
      layers: [this.BBOX_HANDLES_LAYER],
    });
    if (handleFeatures.length > 0) {
      this.startResize(e, handleFeatures[0].properties?.corner as string);
      return;
    }

    // Check if clicking on the fill (move)
    const fillFeatures = this.map.queryRenderedFeatures(e.point, {
      layers: [this.BBOX_FILL_LAYER],
    });
    if (fillFeatures.length > 0) {
      this.startMove(e);
      return;
    }
  };

  private startMove(e: maplibregl.MapMouseEvent): void {
    this.interactionState = 'moving';
    this.dragStart = { lng: e.lngLat.lng, lat: e.lngLat.lat };
    this.map.getCanvas().style.cursor = 'grabbing';

    // Disable map drag while we're moving the bbox
    this.map.dragPan.disable();

    e.preventDefault();
  }

  private startResize(e: maplibregl.MapMouseEvent, corner: string): void {
    if (!this.displayCorners) return;

    this.interactionState = 'resizing';
    this.activeCorner = corner;
    this.dragStart = { lng: e.lngLat.lng, lat: e.lngLat.lat };

    // The anchor is the opposite corner
    const { minLon, minLat, maxLon, maxLat } = this.displayCorners;
    const opposites: Record<string, [number, number]> = {
      sw: [maxLon, maxLat],
      se: [minLon, maxLat],
      ne: [minLon, minLat],
      nw: [maxLon, minLat],
    };
    this.anchorCorner = opposites[corner] || [minLon, minLat];

    // Set resize cursor
    const cursors: Record<string, string> = {
      sw: 'nesw-resize', se: 'nwse-resize',
      ne: 'nesw-resize', nw: 'nwse-resize',
    };
    this.map.getCanvas().style.cursor = cursors[corner] || 'nwse-resize';

    // Disable map drag while we're resizing the bbox
    this.map.dragPan.disable();

    e.preventDefault();
  }
```

**Step 2: Add `onGlobalMouseMove` handler for drag tracking**

This needs to be a separate handler from `onMouseMove` because during drag we want to track mouse even when not on the map layers:

```typescript
  private onGlobalMouseMove = (e: maplibregl.MapMouseEvent): void => {
    if (this.interactionState === 'moving' && this.dragStart && this.displayCorners) {
      const dLng = e.lngLat.lng - this.dragStart.lng;
      const dLat = e.lngLat.lat - this.dragStart.lat;

      const newMinLon = this.displayCorners.minLon + dLng;
      const newMaxLon = this.displayCorners.maxLon + dLng;
      const newMinLat = this.displayCorners.minLat + dLat;
      const newMaxLat = this.displayCorners.maxLat + dLat;

      this.updateBboxDisplay(newMinLon, newMinLat, newMaxLon, newMaxLat);
      this.updateHandles(newMinLon, newMinLat, newMaxLon, newMaxLat);

      // Update tooltip
      const areaM2 = this.calculateArea(newMinLon, newMinLat, newMaxLon, newMaxLat);
      this.updateTooltipContent(areaM2);
      this.tooltip.style.left = `${e.originalEvent.clientX + 15}px`;
      this.tooltip.style.top = `${e.originalEvent.clientY + 15}px`;
      this.tooltip.classList.remove('hidden');
    } else if (this.interactionState === 'resizing' && this.anchorCorner) {
      const [anchorLon, anchorLat] = this.anchorCorner;
      const movingLon = e.lngLat.lng;
      const movingLat = e.lngLat.lat;

      const newMinLon = Math.min(anchorLon, movingLon);
      const newMaxLon = Math.max(anchorLon, movingLon);
      const newMinLat = Math.min(anchorLat, movingLat);
      const newMaxLat = Math.max(anchorLat, movingLat);

      this.updateBboxDisplay(newMinLon, newMinLat, newMaxLon, newMaxLat);
      this.updateHandles(newMinLon, newMinLat, newMaxLon, newMaxLat);

      // Update tooltip with area
      const areaM2 = this.calculateArea(newMinLon, newMinLat, newMaxLon, newMaxLat);
      this.updateTooltipContent(areaM2);
      this.tooltip.style.left = `${e.originalEvent.clientX + 15}px`;
      this.tooltip.style.top = `${e.originalEvent.clientY + 15}px`;
      this.tooltip.classList.remove('hidden');
    }
  };
```

**Step 3: Add `onGlobalMouseUp` handler to finalize move/resize**

```typescript
  private onGlobalMouseUp = (e: maplibregl.MapMouseEvent): void => {
    if (this.interactionState === 'moving' && this.dragStart && this.displayCorners) {
      const dLng = e.lngLat.lng - this.dragStart.lng;
      const dLat = e.lngLat.lat - this.dragStart.lat;

      const newMinLon = this.displayCorners.minLon + dLng;
      const newMaxLon = this.displayCorners.maxLon + dLng;
      const newMinLat = this.displayCorners.minLat + dLat;
      const newMaxLat = this.displayCorners.maxLat + dLat;

      this.finalizeBbox(newMinLon, newMinLat, newMaxLon, newMaxLat);
    } else if (this.interactionState === 'resizing' && this.anchorCorner) {
      const [anchorLon, anchorLat] = this.anchorCorner;
      const movingLon = e.lngLat.lng;
      const movingLat = e.lngLat.lat;

      const newMinLon = Math.min(anchorLon, movingLon);
      const newMaxLon = Math.max(anchorLon, movingLon);
      const newMinLat = Math.min(anchorLat, movingLat);
      const newMaxLat = Math.max(anchorLat, movingLat);

      this.finalizeBbox(newMinLon, newMinLat, newMaxLon, newMaxLat);
    }
  };

  private finalizeBbox(minLon: number, minLat: number, maxLon: number, maxLat: number): void {
    // Validate area
    const areaM2 = this.calculateArea(minLon, minLat, maxLon, maxLat);
    if (areaM2 < MIN_BBOX_AREA_M2 || areaM2 > MAX_BBOX_AREA_M2) {
      // Revert to previous display
      if (this.displayCorners) {
        const { minLon: oMinLon, minLat: oMinLat, maxLon: oMaxLon, maxLat: oMaxLat } = this.displayCorners;
        this.updateBboxDisplay(oMinLon, oMinLat, oMaxLon, oMaxLat);
        this.updateHandles(oMinLon, oMinLat, oMaxLon, oMaxLat);
      }
      this.interactionState = 'editing';
      this.map.dragPan.enable();
      this.map.getCanvas().style.cursor = '';
      this.dragStart = null;
      this.activeCorner = null;
      this.anchorCorner = null;
      return;
    }

    // Convert to EPSG:3006
    const [minX, minY] = this.toEPSG3006(minLon, minLat);
    const [maxX, maxY] = this.toEPSG3006(maxLon, maxLat);

    this.currentBbox = {
      minX: Math.min(minX, maxX),
      minY: Math.min(minY, maxY),
      maxX: Math.max(minX, maxX),
      maxY: Math.max(minY, maxY),
      crs: 'EPSG:3006',
    };

    // Update display corners
    this.displayCorners = { minLon, minLat, maxLon, maxLat };
    this.updateBboxDisplay(minLon, minLat, maxLon, maxLat);
    this.updateHandles(minLon, minLat, maxLon, maxLat);

    // Back to editing
    this.interactionState = 'editing';
    this.map.dragPan.enable();
    this.map.getCanvas().style.cursor = '';
    this.dragStart = null;
    this.activeCorner = null;
    this.anchorCorner = null;

    // Fire callback
    if (this.callback) {
      this.callback(this.currentBbox);
    }
  }
```

**Step 4: Wire up the new event listeners in `enableDrawing()` and `disableDrawing()`**

In `enableDrawing()`, after the existing `this.map.on('mousemove', this.onMouseMove);` line, add:

```typescript
    this.map.on('mousedown', this.onMouseDown);
    this.map.on('mousemove', this.onGlobalMouseMove);
    this.map.on('mouseup', this.onGlobalMouseUp);
```

In `disableDrawing()`, after the existing `this.map.off('mousemove', this.onMouseMove);` line, add:

```typescript
    this.map.off('mousedown', this.onMouseDown);
    this.map.off('mousemove', this.onGlobalMouseMove);
    this.map.off('mouseup', this.onGlobalMouseUp);
    this.map.dragPan.enable();
```

**Step 5: Update `onMouseMove` to show cursor feedback in EDITING state**

In the existing `onMouseMove` handler, after the tooltip position update (line 285-286) and before the drawing check, add a cursor section for EDITING state:

```typescript
    // Cursor feedback in editing state
    if (this.interactionState === 'editing') {
      const handleFeatures = this.map.queryRenderedFeatures(e.point, {
        layers: [this.BBOX_HANDLES_LAYER],
      });
      if (handleFeatures.length > 0) {
        const corner = handleFeatures[0].properties?.corner;
        const cursors: Record<string, string> = {
          sw: 'nesw-resize', se: 'nwse-resize',
          ne: 'nesw-resize', nw: 'nwse-resize',
        };
        this.map.getCanvas().style.cursor = cursors[corner] || 'nwse-resize';
        return;
      }
      const fillFeatures = this.map.queryRenderedFeatures(e.point, {
        layers: [this.BBOX_FILL_LAYER],
      });
      if (fillFeatures.length > 0) {
        this.map.getCanvas().style.cursor = 'grab';
        return;
      }
      this.map.getCanvas().style.cursor = 'crosshair';
    }
```

**Step 6: Verify frontend builds**

Run: `cd frontend && npx vite build 2>&1 | tail -5`
Expected: Build succeeds

**Step 7: Commit**

```bash
git add frontend/src/lib/map/bbox-drawer.ts
git commit -m "feat: implement drag-to-move and corner-resize in BBoxDrawer"
```

---

### Task 4: CoordinateInputDialog Component

**Files:**
- Create: `frontend/src/lib/components/CoordinateInputDialog.svelte`

**Context:** A modal dialog with 4 numeric input fields for EPSG:3006 coordinates. Follows the same pattern as `SaveBookmarkDialog.svelte`: backdrop blur, centered card, focus trap, Escape to close. Pre-populates from current bbox if available.

**Step 1: Create the component**

Create `frontend/src/lib/components/CoordinateInputDialog.svelte`:

```svelte
<script lang="ts">
  import { bbox } from '../stores/map'
  import { MIN_BBOX_AREA_M2, MAX_BBOX_AREA_M2, MAX_BBOX_AREA_KM2 } from '../config'
  import type { BoundingBox } from '../types'

  interface Props {
    open: boolean
    onApply?: (bbox: BoundingBox) => void
  }

  let { open = $bindable(), onApply }: Props = $props()

  let minX = $state('')
  let minY = $state('')
  let maxX = $state('')
  let maxY = $state('')
  let error = $state('')
  let firstInput: HTMLInputElement | undefined = $state(undefined)

  // Pre-populate from current bbox when dialog opens
  $effect(() => {
    if (open) {
      const current = $bbox
      if (current) {
        minX = current.minX.toFixed(1)
        minY = current.minY.toFixed(1)
        maxX = current.maxX.toFixed(1)
        maxY = current.maxY.toFixed(1)
      } else {
        minX = ''
        minY = ''
        maxX = ''
        maxY = ''
      }
      error = ''
      setTimeout(() => firstInput?.focus(), 50)
    }
  })

  function validate(): BoundingBox | null {
    const values = {
      minX: parseFloat(minX),
      minY: parseFloat(minY),
      maxX: parseFloat(maxX),
      maxY: parseFloat(maxY),
    }

    if (Object.values(values).some(v => isNaN(v))) {
      error = 'All fields must be valid numbers.'
      return null
    }

    if (values.minX >= values.maxX) {
      error = 'Min X must be less than Max X.'
      return null
    }

    if (values.minY >= values.maxY) {
      error = 'Min Y must be less than Max Y.'
      return null
    }

    const width = values.maxX - values.minX
    const height = values.maxY - values.minY
    const areaM2 = width * height

    if (areaM2 < MIN_BBOX_AREA_M2) {
      error = `Area too small (minimum ${MIN_BBOX_AREA_M2} m²).`
      return null
    }

    if (areaM2 > MAX_BBOX_AREA_M2) {
      error = `Area exceeds ${MAX_BBOX_AREA_KM2} km² limit.`
      return null
    }

    return { ...values, crs: 'EPSG:3006' }
  }

  function handleApply() {
    const result = validate()
    if (result) {
      onApply?.(result)
      open = false
    }
  }

  function trapFocus(e: KeyboardEvent) {
    if (e.key === 'Escape') { open = false; return }
    if (e.key !== 'Tab') return
    const dialog = e.currentTarget as HTMLElement
    const focusable = dialog.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
    if (!focusable.length) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }
</script>

{#if open}
  <!-- svelte-ignore a11y_consider_explicit_label -->
  <button class="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm cursor-default focus-visible:ring-2 focus-visible:ring-dtcc-orange/50 focus-visible:outline-none" aria-label="Close dialog" onclick={() => open = false}></button>
  <div class="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50
    w-[360px] bg-white rounded-xl shadow-2xl p-5"
    role="dialog"
    aria-modal="true"
    onkeydown={trapFocus}>
    <h3 class="text-[16px] font-semibold text-dtcc-navy mb-1">Enter Coordinates</h3>
    <p class="text-[12px] text-dtcc-muted mb-4">EPSG:3006 (SWEREF99 TM) in meters</p>

    <div class="grid grid-cols-2 gap-3 mb-3">
      <label class="block">
        <span class="text-[11px] font-medium text-dtcc-muted uppercase tracking-wide">Min X (Easting)</span>
        <input
          bind:this={firstInput}
          bind:value={minX}
          type="number"
          step="any"
          placeholder="e.g. 319500"
          class="w-full h-9 px-3 mt-1 rounded-lg border border-dtcc-border-light text-[13px]
            focus:outline-none focus:ring-2 focus:ring-dtcc-orange/30 focus:border-dtcc-orange"
          onkeydown={(e) => e.key === 'Enter' && handleApply()}
        />
      </label>
      <label class="block">
        <span class="text-[11px] font-medium text-dtcc-muted uppercase tracking-wide">Min Y (Northing)</span>
        <input
          bind:value={minY}
          type="number"
          step="any"
          placeholder="e.g. 6397200"
          class="w-full h-9 px-3 mt-1 rounded-lg border border-dtcc-border-light text-[13px]
            focus:outline-none focus:ring-2 focus:ring-dtcc-orange/30 focus:border-dtcc-orange"
          onkeydown={(e) => e.key === 'Enter' && handleApply()}
        />
      </label>
      <label class="block">
        <span class="text-[11px] font-medium text-dtcc-muted uppercase tracking-wide">Max X (Easting)</span>
        <input
          bind:value={maxX}
          type="number"
          step="any"
          placeholder="e.g. 321800"
          class="w-full h-9 px-3 mt-1 rounded-lg border border-dtcc-border-light text-[13px]
            focus:outline-none focus:ring-2 focus:ring-dtcc-orange/30 focus:border-dtcc-orange"
          onkeydown={(e) => e.key === 'Enter' && handleApply()}
        />
      </label>
      <label class="block">
        <span class="text-[11px] font-medium text-dtcc-muted uppercase tracking-wide">Max Y (Northing)</span>
        <input
          bind:value={maxY}
          type="number"
          step="any"
          placeholder="e.g. 6399100"
          class="w-full h-9 px-3 mt-1 rounded-lg border border-dtcc-border-light text-[13px]
            focus:outline-none focus:ring-2 focus:ring-dtcc-orange/30 focus:border-dtcc-orange"
          onkeydown={(e) => e.key === 'Enter' && handleApply()}
        />
      </label>
    </div>

    {#if error}
      <p class="text-[12px] text-red-500 mb-3">{error}</p>
    {/if}

    <div class="flex gap-2 justify-end">
      <button class="px-4 h-9 rounded-lg text-[13px] text-dtcc-muted hover:bg-black/5 cursor-pointer focus-visible:ring-2 focus-visible:ring-dtcc-orange/50 focus-visible:outline-none" onclick={() => open = false}>Cancel</button>
      <button
        class="px-4 h-9 rounded-lg bg-dtcc-orange text-white text-[13px] font-semibold hover:bg-dtcc-orange-dark cursor-pointer focus-visible:ring-2 focus-visible:ring-dtcc-orange/50 focus-visible:outline-none"
        onclick={handleApply}
      >Apply</button>
    </div>
  </div>
{/if}
```

**Step 2: Verify frontend builds**

Run: `cd frontend && npx vite build 2>&1 | tail -5`
Expected: Build succeeds (component created but not yet wired)

**Step 3: Commit**

```bash
git add frontend/src/lib/components/CoordinateInputDialog.svelte
git commit -m "feat: add CoordinateInputDialog component"
```

---

### Task 5: Toolbar — Add "Enter coordinates" Button and Icon

**Files:**
- Modify: `frontend/src/lib/ui/icons.ts`
- Modify: `frontend/src/lib/components/Toolbar.svelte`

**Context:** Add a new icon and button in the Toolbar actions group, right after the "Draw area" button. The button opens the CoordinateInputDialog via a callback prop.

**Step 1: Add icon to `icons.ts`**

After the `draw` entry (line 6), add a new `coords` icon — a map-pin with keyboard/number connotation. Use the Heroicons "map-pin" outline:

```typescript
  coords: `<svg aria-hidden="true" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" /><path stroke-linecap="round" stroke-linejoin="round" d="M7.5 15.5h2m5-3h2" /></svg>`,
```

Actually, let's use a simpler, more recognizable icon — the Heroicons "hashtag" which suggests coordinates/numbers:

```typescript
  coords: `<svg aria-hidden="true" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M5.25 8.25h15m-16.5 7.5h15m-1.8-13.5l-3.9 19.5m-2.1-19.5l-3.9 19.5" /></svg>`,
```

**Step 2: Add `onCoordInput` prop and button to Toolbar**

In `Toolbar.svelte`, update the Props interface (line 12-16):

```typescript
  interface Props {
    onClear?: () => void
    onSave?: () => void
    onToggle3D?: () => void
    onCoordInput?: () => void
  }

  let { onClear, onSave, onToggle3D, onCoordInput }: Props = $props()
```

After the "Draw area" ToolbarButton (after line 47), add:

```svelte
  <ToolbarButton
    icon={Icons.coords}
    label="Enter coordinates"
    onclick={onCoordInput}
  />
```

**Step 3: Verify frontend builds**

Run: `cd frontend && npx vite build 2>&1 | tail -5`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add frontend/src/lib/ui/icons.ts frontend/src/lib/components/Toolbar.svelte
git commit -m "feat: add Enter coordinates button to Toolbar"
```

---

### Task 6: Wire Everything in App.svelte and MapView

**Files:**
- Modify: `frontend/src/App.svelte`
- Modify: `frontend/src/lib/components/MapView.svelte`

**Context:** Wire the CoordinateInputDialog into App.svelte (open/close state, onApply handler). Also update MapView's `onBBoxDrawn` callback to NOT set `drawingActive = false` — instead, let the BBoxDrawer stay in editing state within draw mode. The user exits draw mode by clicking the Draw button again.

**Step 1: Update MapView callback**

In `MapView.svelte`, the `onBBoxDrawn` callback (lines 20-29) currently sets `drawingActive.set(false)`. Remove that line so the drawer stays in draw/editing mode after completing a bbox:

```typescript
    drawer.onBBoxDrawn((drawnBbox: BoundingBox) => {
      bbox.set(drawnBbox)

      // Auto-fetch datasets and open panel
      fetchDatasetList().then((list) => {
        datasets.set(list)
        activePanel.set('datasets')
      })
    })
```

**Step 2: Wire CoordinateInputDialog in App.svelte**

Add the import at the top of `<script>` (after line 15):

```typescript
  import CoordinateInputDialog from './lib/components/CoordinateInputDialog.svelte'
```

Add state variable (after `sessionDialogOpen` on line 36):

```typescript
  let coordDialogOpen = $state(false)
```

Add the `onCoordInput` prop to Toolbar (add to the `<Toolbar>` element around line 244):

```svelte
    <Toolbar
      onClear={handleClear}
      onSave={() => saveDialogOpen = true}
      onToggle3D={handleToggle3D}
      onCoordInput={() => coordDialogOpen = true}
    />
```

Add the dialog component in the template, after `<SessionDialog>` (after line 263):

```svelte
    <CoordinateInputDialog bind:open={coordDialogOpen} onApply={(b) => mapView?.loadBbox(b)} />
```

**Step 3: Verify frontend builds**

Run: `cd frontend && npx vite build 2>&1 | tail -5`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add frontend/src/App.svelte frontend/src/lib/components/MapView.svelte
git commit -m "feat: wire CoordinateInputDialog and keep draw mode active after bbox"
```

---

### Task 7: Manual Integration Test

**Files:** None (testing only)

**Step 1: Start dev server**

Run: `cd frontend && npm run start` (in a separate terminal or background)

**Step 2: Test coordinate input**

1. Open `http://localhost:3000`
2. Click the new "Enter coordinates" button (hashtag icon) in the toolbar
3. Enter: minX=319500, minY=6397200, maxX=321800, maxY=6399100
4. Click "Apply"
5. **Expected:** Map zooms to Gothenburg area, orange rectangle appears, datasets panel opens

**Step 3: Test draw → edit → move**

1. Click "Draw area" to enter draw mode
2. Click two points to draw a bbox
3. **Expected:** Corner handles (white circles with orange border) appear at each corner
4. Hover over the bbox fill — cursor should change to `grab`
5. Click and drag the fill
6. **Expected:** Entire bbox translates with the mouse, tooltip shows area
7. Release mouse
8. **Expected:** Bbox finalizes at new position, datasets refresh

**Step 4: Test draw → edit → resize**

1. While still in draw mode with a bbox, hover over a corner handle
2. **Expected:** Cursor changes to resize arrow
3. Click and drag the handle
4. **Expected:** That corner moves while the opposite corner stays fixed
5. Release mouse
6. **Expected:** Bbox resizes, datasets refresh

**Step 5: Test new draw after edit**

1. While in EDITING state, click on empty map space (not on the bbox)
2. **Expected:** Previous bbox clears, you can start a new draw

**Step 6: Test Escape exits draw mode**

1. Draw a bbox, verify handles appear
2. Press Escape
3. **Expected:** Draw mode deactivates, handles disappear, bbox remains visible

**Step 7: Run existing tests to verify no regressions**

Run: `conda run --no-capture-output -n fenicsx-env pytest tests/ --ignore=tests/test_api_main_endpoints.py -v`
Expected: All tests PASS
