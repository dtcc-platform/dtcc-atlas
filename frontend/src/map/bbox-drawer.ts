import Map from 'ol/Map';
import Extent from 'ol/interaction/Extent';
import proj4 from 'proj4';
import { Style, Stroke, Fill } from 'ol/style';
import type { BoundingBox } from '../types';
import { MAX_BBOX_AREA_M2, MAX_BBOX_AREA_KM2 } from '../config';
import type { Extent as ExtentType } from 'ol/extent';

/**
 * BBoxDrawer - Handles drawing and editing axis-aligned bounding boxes on the map
 *
 * Uses OpenLayers' built-in Extent interaction for:
 * - Drawing new bounding boxes
 * - Resizing via corners and edges
 * - Maintaining axis-aligned rectangles automatically
 */
export class BBoxDrawer {
  private map: Map;
  private extentInteraction: Extent;
  private previousExtent: ExtentType | null = null;
  private callback: ((bbox: BoundingBox) => void) | null = null;
  private allowNewExtent: boolean = true;
  private readonly tooltip: HTMLElement;

  constructor(map: Map) {
    this.map = map;

    // Get tooltip element
    this.tooltip = document.getElementById('bbox-tooltip') as HTMLElement;
    if (!this.tooltip) {
      throw new Error('Tooltip element not found');
    }

    // Create the Extent interaction with custom styling and larger hit tolerance
    this.extentInteraction = new Extent({
      pixelTolerance: 10,
      // Prevent creating a new extent when one already exists
      createCondition: () => {
        return this.allowNewExtent;
      },
      boxStyle: new Style({
        stroke: new Stroke({
          color: '#3498db',
          width: 2,
        }),
        fill: new Fill({
          color: 'rgba(52, 152, 219, 0.2)',
        }),
      }),
    });

    // Listen to extent changes (fired during drawing and resizing)
    this.extentInteraction.on('extentchanged', (event) => {
      this.handleExtentChanged(event.extent);
    });

    // Track mouse movement to update tooltip position and show it during drawing/editing
    this.map.on('pointermove', (event) => {
      const extent = this.extentInteraction.getExtent();
      if (extent) {
        // Type guard to ensure we have a PointerEvent
        const originalEvent = event.originalEvent;
        if ('clientX' in originalEvent && 'clientY' in originalEvent) {
          // Update tooltip position
          this.tooltip.style.left = `${originalEvent.clientX + 15}px`;
          this.tooltip.style.top = `${originalEvent.clientY + 15}px`;

          // Calculate and display area
          this.updateTooltipContent(extent);
          this.tooltip.classList.add('visible');
        }
      } else {
        this.tooltip.classList.remove('visible');
      }
    });

    // Hide tooltip when mouse leaves the map
    this.map.getViewport().addEventListener('mouseout', () => {
      this.tooltip.classList.remove('visible');
    });
  }

  /**
   * Updates the tooltip content with current area in km²
   */
  private updateTooltipContent(extent: ExtentType): void {
    // Transform corners to EPSG:3006 for accurate area calculation
    const [minX, minY] = proj4('EPSG:3857', 'EPSG:3006', [extent[0], extent[1]]);
    const [maxX, maxY] = proj4('EPSG:3857', 'EPSG:3006', [extent[2], extent[3]]);

    const width = maxX - minX;
    const height = maxY - minY;
    const areaM2 = width * height;
    const areaKm2 = areaM2 / 1_000_000;

    // Update tooltip text
    this.tooltip.textContent = `Area: ${areaKm2.toFixed(2)} km²`;

    // Show warning if exceeds max
    if (areaM2 > MAX_BBOX_AREA_M2) {
      this.tooltip.textContent = `Area: ${areaKm2.toFixed(2)} km² (exceeds ${MAX_BBOX_AREA_KM2} km² limit)`;
      this.tooltip.style.background = 'rgba(231, 76, 60, 0.95)';
    } else {
      this.tooltip.style.background = 'rgba(44, 62, 80, 0.95)';
    }
  }

  /**
   * Validates an extent against the maximum area constraint
   */
  private validateExtent(extent: ExtentType): boolean {
    // Transform corners to EPSG:3006 for accurate area calculation
    const [minX, minY] = proj4('EPSG:3857', 'EPSG:3006', [extent[0], extent[1]]);
    const [maxX, maxY] = proj4('EPSG:3857', 'EPSG:3006', [extent[2], extent[3]]);

    const width = maxX - minX;
    const height = maxY - minY;
    const area = width * height;

    if (area > MAX_BBOX_AREA_M2) {
      const areaKm2 = area / 1_000_000;
      console.warn(
        `Area ${areaKm2.toFixed(2)} km² exceeds maximum ${MAX_BBOX_AREA_KM2} km²`
      );
      return false;
    }

    return true;
  }

  /**
   * Handles extent changes from the Extent interaction
   * Validates area and calls the callback with transformed coordinates
   */
  private handleExtentChanged(extent: ExtentType): void {
    if (!extent) {
      return;
    }

    // Validate against area constraint
    if (!this.validateExtent(extent)) {
      // Revert to previous valid extent
      if (this.previousExtent) {
        this.extentInteraction.setExtent(this.previousExtent);
      } else {
        // No previous extent, clear it
        this.extentInteraction.setExtent(undefined as any);
      }
      return;
    }

    // Save as valid extent
    this.previousExtent = [...extent] as ExtentType;

    // Disable creating new extents now that we have one
    this.allowNewExtent = false;

    // Transform to EPSG:3006 for the callback
    const [minX, minY] = proj4('EPSG:3857', 'EPSG:3006', [extent[0], extent[1]]);
    const [maxX, maxY] = proj4('EPSG:3857', 'EPSG:3006', [extent[2], extent[3]]);

    // Calculate and log area
    const areaM2 = (maxX - minX) * (maxY - minY);
    const areaKm2 = areaM2 / 1_000_000;
    console.log(`Bounding box updated: ${areaKm2.toFixed(2)} km² (${areaKm2.toFixed(0)} m²)`);

    // Call the callback with the bounding box
    if (this.callback) {
      this.callback({
        minX,
        minY,
        maxX,
        maxY,
        crs: 'EPSG:3006',
      });
    }
  }

  /**
   * Enables the Extent interaction on the map
   * Call this when the user clicks "Draw Bounding Box"
   */
  enableDrawing(): void {
    this.map.addInteraction(this.extentInteraction);
    console.log('Bounding box interaction enabled');
  }

  /**
   * Disables the Extent interaction on the map
   * Call this after clearing or when drawing should be disabled
   */
  disableDrawing(): void {
    this.map.removeInteraction(this.extentInteraction);
    console.log('Bounding box interaction disabled');
  }

  /**
   * Clears the current bounding box and resets state
   */
  clearBoundingBox(): void {
    this.extentInteraction.setExtent(undefined as any);
    this.previousExtent = null;
    this.allowNewExtent = true; // Re-enable creating new extents
    this.tooltip.classList.remove('visible'); // Hide tooltip
    console.log('Bounding box cleared');
  }

  /**
   * Registers a callback to be called when the bounding box is drawn or updated
   */
  onBBoxDrawn(callback: (bbox: BoundingBox) => void): void {
    this.callback = callback;
  }
}
