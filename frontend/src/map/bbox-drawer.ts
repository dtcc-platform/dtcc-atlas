import Map from 'ol/Map';
import Extent from 'ol/interaction/Extent';
import proj4 from 'proj4';
import { Style, Stroke, Fill } from 'ol/style';
import type { BoundingBox } from '../types';
import { MAX_BBOX_AREA_M2, MAX_BBOX_AREA_KM2, MIN_BBOX_AREA_M2 } from '../config';
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
  /**
   * Dummy extent used for initialization to prevent OpenLayers null extent crashes.
   * Set to coordinates far outside Sweden's bounds in EPSG:3857.
   * OpenLayers' Extent interaction crashes when handlePointerMove_ is called
   * with a null extent, so we use this invisible placeholder instead.
   */
  private static readonly DUMMY_EXTENT: ExtentType = [-999999, -999999, -999998, -999998];

  private map: Map;
  private extentInteraction: Extent;
  private previousExtent: ExtentType | null = null;
  private callback: ((bbox: BoundingBox) => void) | null = null;
  private readonly tooltip: HTMLElement;
  private pointermoveHandler: ((event: any) => void) | null = null;
  private mouseoutHandler: (() => void) | null = null;
  private isInteractionOnMap: boolean = false;

  /**
   * Type guard to validate that an extent has valid coordinate values
   * Checks for null, undefined, NaN, correct array structure, and filters dummy extent
   */
  private isValidExtent(extent: ExtentType | null | undefined): extent is ExtentType {
    // First check basic validity
    if (
      !extent ||
      !Array.isArray(extent) ||
      extent.length !== 4 ||
      extent.some(val => val === undefined || val === null || isNaN(val))
    ) {
      return false;
    }

    // Reject the dummy extent used for initialization
    if (
      extent[0] === BBoxDrawer.DUMMY_EXTENT[0] &&
      extent[1] === BBoxDrawer.DUMMY_EXTENT[1] &&
      extent[2] === BBoxDrawer.DUMMY_EXTENT[2] &&
      extent[3] === BBoxDrawer.DUMMY_EXTENT[3]
    ) {
      return false;
    }

    return true;
  }

  constructor(map: Map) {
    this.map = map;

    // Get tooltip element
    this.tooltip = document.getElementById('bbox-tooltip') as HTMLElement;
    if (!this.tooltip) {
      throw new Error('Tooltip element not found');
    }

    // Create the Extent interaction ONCE - never recreate
    this.extentInteraction = new Extent({
      extent: BBoxDrawer.DUMMY_EXTENT,
      pixelTolerance: 10,
      // Enable dragging/moving the extent by clicking inside it
      drag: true,
      // Allow creating new extent when clicking outside existing extent
      // Clicking inside the extent allows moving it (translate)
      // Clicking on corners/edges allows resizing
      boxStyle: new Style({
        stroke: new Stroke({
          color: '#3498db',
          width: 2,
        }),
        fill: new Fill({
          color: 'rgba(52, 152, 219, 0.2)',
        }),
      }),
      wrapX: false,
    });

    // Listen to extent changes with defensive guard
    this.extentInteraction.on('extentchanged', (event) => {
      if (this.isValidExtent(event.extent)) {
        this.handleExtentChanged(event.extent);
      } else {
        console.debug('Received invalid extent in extentchanged event, ignoring');
      }
    });

    this.isInteractionOnMap = false;
  }

  /**
   * Updates the tooltip content with current area in km² or m²
   */
  private updateTooltipContent(extent: ExtentType): void {
    if (!this.isValidExtent(extent)) {
      return;
    }

    // Transform corners to EPSG:3006 for accurate area calculation
    const [minX, minY] = proj4('EPSG:3857', 'EPSG:3006', [extent[0], extent[1]]);
    const [maxX, maxY] = proj4('EPSG:3857', 'EPSG:3006', [extent[2], extent[3]]);

    const width = maxX - minX;
    const height = maxY - minY;
    const areaM2 = width * height;
    const areaKm2 = areaM2 / 1_000_000;

    // Show area in m² if less than 1000 m², otherwise in km²
    const areaDisplay = areaM2 < 1000
      ? `${areaM2.toFixed(2)} m²`
      : `${areaKm2.toFixed(2)} km²`;

    // Update tooltip text and color based on size constraints
    if (areaM2 > MAX_BBOX_AREA_M2) {
      // Too large - red warning
      this.tooltip.textContent = `Area: ${areaDisplay} (exceeds ${MAX_BBOX_AREA_KM2} km² limit)`;
      this.tooltip.style.background = 'rgba(231, 76, 60, 0.95)';
    } else if (areaM2 < MIN_BBOX_AREA_M2) {
      // Too small - orange/yellow warning
      this.tooltip.textContent = `Area: ${areaDisplay} (minimum ${MIN_BBOX_AREA_M2} m²)`;
      this.tooltip.style.background = 'rgba(230, 126, 34, 0.95)';
    } else {
      // Valid area - normal dark background
      this.tooltip.textContent = `Area: ${areaDisplay}`;
      this.tooltip.style.background = 'rgba(44, 62, 80, 0.95)';
    }
  }

  /**
   * Validates an extent against the minimum and maximum area constraints
   * Returns { valid: boolean, area: number, reason?: string }
   */
  private validateExtent(extent: ExtentType): { valid: boolean; area: number; reason?: string } {
    if (!this.isValidExtent(extent)) {
      return { valid: false, area: 0, reason: 'Invalid extent' };
    }

    // Transform corners to EPSG:3006 for accurate area calculation
    const [minX, minY] = proj4('EPSG:3857', 'EPSG:3006', [extent[0], extent[1]]);
    const [maxX, maxY] = proj4('EPSG:3857', 'EPSG:3006', [extent[2], extent[3]]);

    const width = maxX - minX;
    const height = maxY - minY;
    const area = width * height;

    // Check minimum area
    if (area < MIN_BBOX_AREA_M2) {
      // console.warn(
      //   `Area ${area.toFixed(2)} m² is below minimum ${MIN_BBOX_AREA_M2} m²`
      // );
      return { valid: false, area, reason: 'too_small' };
    }

    // Check maximum area
    if (area > MAX_BBOX_AREA_M2) {
      // const areaKm2 = area / 1_000_000;
      // console.warn(
      //   `Area ${areaKm2.toFixed(2)} km² exceeds maximum ${MAX_BBOX_AREA_KM2} km²`
      // );
      return { valid: false, area, reason: 'too_large' };
    }

    return { valid: true, area };
  }

  /**
   * Handles extent changes from the Extent interaction
   * Validates area against both minimum and maximum constraints
   * Invalid extents (too small or too large) are immediately reverted
   * @param extent - The extent coordinates
   */
  private handleExtentChanged(extent: ExtentType): void {
    if (!this.isValidExtent(extent)) {
      return;
    }

    // Validate against both minimum and maximum area constraints during drawing
    const validation = this.validateExtent(extent);

    if (!validation.valid && (validation.reason === 'too_large' || validation.reason === 'too_small')) {
      // Revert to previous valid extent (enforce both min and max immediately)
      if (this.previousExtent) {
        this.extentInteraction.setExtent(this.previousExtent);
      } else {
        // No previous extent - user's first attempt was invalid
        const message = validation.reason === 'too_large'
          ? 'First extent exceeded maximum limit. Please draw a smaller area.'
          : 'First extent is too small. Please draw a larger area (minimum 25 m²).';
        console.warn(message);
        // Reset to dummy extent to clear the invalid extent
        this.extentInteraction.setExtent(BBoxDrawer.DUMMY_EXTENT);
        return;
      }
      return;
    }

    // Save as valid extent (passed both min and max validation)
    this.previousExtent = [...extent] as ExtentType;

    // Transform to EPSG:3006 for the callback
    const [minX, minY] = proj4('EPSG:3857', 'EPSG:3006', [extent[0], extent[1]]);
    const [maxX, maxY] = proj4('EPSG:3857', 'EPSG:3006', [extent[2], extent[3]]);

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
    // Prevent double-adding
    if (this.isInteractionOnMap) {
      console.debug('Drawing already enabled, skipping');
      return;
    }

    // CRITICAL FIX: Create a fresh Extent interaction to avoid null extent errors
    // Reusing the same interaction after clearing causes OpenLayers to crash
    // when it tries to access extent[0] on a null extent during pointer events
    this.extentInteraction = new Extent({
      extent: BBoxDrawer.DUMMY_EXTENT,
      pixelTolerance: 10,
      drag: true,
      boxStyle: new Style({
        stroke: new Stroke({
          color: '#3498db',
          width: 2,
        }),
        fill: new Fill({
          color: 'rgba(52, 152, 219, 0.2)',
        }),
      }),
      wrapX: false,
    });

    // Re-attach the extentchanged listener to the new interaction
    this.extentInteraction.on('extentchanged', (event) => {
      if (this.isValidExtent(event.extent)) {
        this.handleExtentChanged(event.extent);
      } else {
        console.debug('Received invalid extent in extentchanged event, ignoring');
      }
    });

    this.map.addInteraction(this.extentInteraction);
    this.isInteractionOnMap = true;

    // Set up tooltip tracking
    this.pointermoveHandler = (event) => {
      const extent = this.extentInteraction.getExtent();
      // Add defensive null check before isValidExtent
      if (!extent || !this.isValidExtent(extent)) {
        this.tooltip.classList.add('hidden');
        return;
      }

      // Additional defensive check: ensure extent has non-zero area
      // This prevents crashes when OpenLayers' internal extent becomes invalid
      const hasArea = (extent[2] !== extent[0]) && (extent[3] !== extent[1]);
      if (!hasArea) {
        this.tooltip.classList.add('hidden');
        return;
      }

      // Type guard to ensure we have a PointerEvent
      const originalEvent = event.originalEvent;
      if ('clientX' in originalEvent && 'clientY' in originalEvent) {
        // Update tooltip position
        this.tooltip.style.left = `${originalEvent.clientX + 15}px`;
        this.tooltip.style.top = `${originalEvent.clientY + 15}px`;

        // Calculate and display area
        this.updateTooltipContent(extent);
        this.tooltip.classList.remove('hidden');
      }
    };

    this.mouseoutHandler = () => {
      this.tooltip.classList.add('hidden');
    };

    this.map.on('pointermove', this.pointermoveHandler);
    this.map.getViewport().addEventListener('mouseout', this.mouseoutHandler);

    console.log('Bounding box interaction enabled');
  }

  /**
   * Disables the Extent interaction on the map
   * Call this after clearing or when drawing should be disabled
   */
  disableDrawing(): void {
    if (!this.isInteractionOnMap) {
      console.debug('Drawing already disabled, skipping');
      return;
    }

    this.map.removeInteraction(this.extentInteraction);
    this.isInteractionOnMap = false;

    // Clean up event listeners
    if (this.pointermoveHandler) {
      this.map.un('pointermove', this.pointermoveHandler);
      this.pointermoveHandler = null;
    }

    if (this.mouseoutHandler) {
      this.map.getViewport().removeEventListener('mouseout', this.mouseoutHandler);
      this.mouseoutHandler = null;
    }

    console.log('Bounding box interaction disabled');
  }

  /**
   * Clears the current bounding box and resets state
   * This fully disables the drawing interaction to prevent null extent errors
   */
  clearBoundingBox(): void {
    console.log('Clearing bounding box');

    // Clear state first
    this.previousExtent = null;
    this.tooltip.classList.remove('visible');

    // IMPORTANT: Fully disable drawing interaction before clearing extent
    // This prevents OpenLayers from handling pointer events on a null extent
    // which causes "Cannot read properties of null (reading '0')" errors
    this.disableDrawing();

    // Reset to dummy extent instead of null/undefined to maintain non-null state
    this.extentInteraction.setExtent(BBoxDrawer.DUMMY_EXTENT);

    console.log('Bounding box cleared');
  }

  /**
   * Registers a callback to be called when the bounding box is drawn or updated
   */
  onBBoxDrawn(callback: (bbox: BoundingBox) => void): void {
    this.callback = callback;
  }

  /**
   * Programmatically load a bounding box extent onto the map
   * Used when loading saved bookmarks
   * IMPORTANT: Must be called AFTER enableDrawing() to avoid null extent errors
   */
  loadExtent(bbox: BoundingBox): void {
    // Ensure interaction is on the map before setting extent
    if (!this.isInteractionOnMap) {
      console.warn('loadExtent called before enableDrawing(). Enabling drawing first.');
      this.enableDrawing();
    }

    // Transform from EPSG:3006 to EPSG:3857 for map display
    const [minX, minY] = proj4('EPSG:3006', 'EPSG:3857', [bbox.minX, bbox.minY]);
    const [maxX, maxY] = proj4('EPSG:3006', 'EPSG:3857', [bbox.maxX, bbox.maxY]);

    const extent: ExtentType = [minX, minY, maxX, maxY];

    // Set the extent on the interaction
    this.extentInteraction.setExtent(extent);
    this.previousExtent = extent;

    // Trigger the callback to update UI
    this.handleExtentChanged(extent);
  }

  /**
   * Check if current bounding box meets minimum area requirement
   * Returns the area in m² and whether it's valid
   */
  getCurrentBBoxArea(): { areaM2: number; isValid: boolean } | null {
    const extent = this.extentInteraction.getExtent();

    if (!this.isValidExtent(extent)) {
      return null;
    }

    // Transform corners to EPSG:3006 for accurate area calculation
    const [minX, minY] = proj4('EPSG:3857', 'EPSG:3006', [extent[0], extent[1]]);
    const [maxX, maxY] = proj4('EPSG:3857', 'EPSG:3006', [extent[2], extent[3]]);

    const width = maxX - minX;
    const height = maxY - minY;
    const areaM2 = width * height;

    return {
      areaM2,
      isValid: areaM2 >= MIN_BBOX_AREA_M2,
    };
  }
}
