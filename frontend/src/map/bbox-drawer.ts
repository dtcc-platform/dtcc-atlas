import Map from 'ol/Map';
import Draw from 'ol/interaction/Draw';
import { createBox } from 'ol/interaction/Draw';
import VectorSource from 'ol/source/Vector';
import VectorLayer from 'ol/layer/Vector';
import Feature from 'ol/Feature';
import Polygon from 'ol/geom/Polygon';
import proj4 from 'proj4';
import { Style, Stroke, Fill } from 'ol/style';
import type { BoundingBox } from '../types';
import { MAX_BBOX_AREA_M2, MAX_BBOX_AREA_KM2, MIN_BBOX_AREA_M2 } from '../config';
import type { Extent as ExtentType } from 'ol/extent';

/**
 * BBoxDrawer - Handles drawing and editing axis-aligned bounding boxes on the map
 *
 * Uses OpenLayers' Draw interaction with createBox() for click-click drawing:
 * - First click sets one corner
 * - Moving mouse expands the rectangle
 * - Second click confirms the opposite corner
 */
export class BBoxDrawer {
  private map: Map;
  private vectorSource: VectorSource;
  private vectorLayer: VectorLayer<VectorSource>;
  private drawInteraction: Draw | null = null;
  private currentFeature: Feature<Polygon> | null = null;
  private callback: ((bbox: BoundingBox) => void) | null = null;
  private readonly tooltip: HTMLElement;
  private pointermoveHandler: ((event: any) => void) | null = null;
  private mouseoutHandler: (() => void) | null = null;
  private isDrawingActive: boolean = false;

  private readonly boxStyle = new Style({
    stroke: new Stroke({
      color: '#E35A1D',
      width: 2,
    }),
    fill: new Fill({
      color: 'rgba(227, 90, 29, 0.2)',
    }),
  });

  /**
   * Type guard to validate that an extent has valid coordinate values
   */
  private isValidExtent(extent: ExtentType | null | undefined): extent is ExtentType {
    if (
      !extent ||
      !Array.isArray(extent) ||
      extent.length !== 4 ||
      extent.some(val => val === undefined || val === null || isNaN(val))
    ) {
      return false;
    }

    // Check for zero-area extents
    if (extent[0] === extent[2] || extent[1] === extent[3]) {
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

    // Create vector source and layer for displaying the drawn box
    this.vectorSource = new VectorSource();
    this.vectorLayer = new VectorLayer({
      source: this.vectorSource,
      style: this.boxStyle,
      zIndex: 100,
    });

    this.map.addLayer(this.vectorLayer);
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

    const width = Math.abs(maxX - minX);
    const height = Math.abs(maxY - minY);
    const areaM2 = width * height;
    const areaKm2 = areaM2 / 1_000_000;

    // Show area in m² if less than 1000 m², otherwise in km²
    const areaDisplay = areaM2 < 1000
      ? `${areaM2.toFixed(2)} m²`
      : `${areaKm2.toFixed(2)} km²`;

    // Update tooltip text and color based on size constraints
    if (areaM2 > MAX_BBOX_AREA_M2) {
      this.tooltip.textContent = `Area: ${areaDisplay} (exceeds ${MAX_BBOX_AREA_KM2} km² limit)`;
      this.tooltip.style.background = 'rgba(231, 76, 60, 0.95)';
    } else if (areaM2 < MIN_BBOX_AREA_M2) {
      this.tooltip.textContent = `Area: ${areaDisplay} (minimum ${MIN_BBOX_AREA_M2} m²)`;
      this.tooltip.style.background = 'rgba(230, 126, 34, 0.95)';
    } else {
      this.tooltip.textContent = `Area: ${areaDisplay}`;
      this.tooltip.style.background = 'rgba(39, 37, 42, 0.95)';
    }
  }

  /**
   * Validates an extent against the minimum and maximum area constraints
   */
  private validateExtent(extent: ExtentType): { valid: boolean; area: number; reason?: string } {
    if (!this.isValidExtent(extent)) {
      return { valid: false, area: 0, reason: 'Invalid extent' };
    }

    // Transform corners to EPSG:3006 for accurate area calculation
    const [minX, minY] = proj4('EPSG:3857', 'EPSG:3006', [extent[0], extent[1]]);
    const [maxX, maxY] = proj4('EPSG:3857', 'EPSG:3006', [extent[2], extent[3]]);

    const width = Math.abs(maxX - minX);
    const height = Math.abs(maxY - minY);
    const area = width * height;

    if (area < MIN_BBOX_AREA_M2) {
      return { valid: false, area, reason: 'too_small' };
    }

    if (area > MAX_BBOX_AREA_M2) {
      return { valid: false, area, reason: 'too_large' };
    }

    return { valid: true, area };
  }

  /**
   * Handles when a box is completed
   */
  private handleDrawEnd(feature: Feature<Polygon>): void {
    const geometry = feature.getGeometry();
    if (!geometry) return;

    const extent = geometry.getExtent() as ExtentType;

    // Validate the drawn extent
    const validation = this.validateExtent(extent);

    if (!validation.valid) {
      // Remove invalid feature
      this.vectorSource.removeFeature(feature);
      const message = validation.reason === 'too_large'
        ? `Area exceeds ${MAX_BBOX_AREA_KM2} km² limit. Please draw a smaller area.`
        : `Area is too small (minimum ${MIN_BBOX_AREA_M2} m²). Please draw a larger area.`;
      console.warn(message);
      return;
    }

    // Clear any previous feature and keep the new one
    if (this.currentFeature && this.currentFeature !== feature) {
      this.vectorSource.removeFeature(this.currentFeature);
    }
    this.currentFeature = feature;

    // Transform to EPSG:3006 for the callback
    const [minX, minY] = proj4('EPSG:3857', 'EPSG:3006', [extent[0], extent[1]]);
    const [maxX, maxY] = proj4('EPSG:3857', 'EPSG:3006', [extent[2], extent[3]]);

    // Call the callback with the bounding box
    if (this.callback) {
      this.callback({
        minX: Math.min(minX, maxX),
        minY: Math.min(minY, maxY),
        maxX: Math.max(minX, maxX),
        maxY: Math.max(minY, maxY),
        crs: 'EPSG:3006',
      });
    }

    // Disable drawing after successful draw - user can click "Draw Area" to draw again
    this.disableDrawing();
  }

  /**
   * Enables the Draw interaction on the map
   * Uses click-click behavior: first click starts, second click finishes
   */
  enableDrawing(): void {
    if (this.isDrawingActive) {
      console.debug('Drawing already enabled, skipping');
      return;
    }

    // Clear any existing box when starting a new draw
    this.vectorSource.clear();
    this.currentFeature = null;

    // Create a new Draw interaction with createBox geometry function
    this.drawInteraction = new Draw({
      source: this.vectorSource,
      type: 'Circle',
      geometryFunction: createBox(),
      style: this.boxStyle,
      // Prevent finishing if area exceeds limits
      finishCondition: () => {
        const sketchFeature = (this.drawInteraction as any)?.sketchFeature_;
        if (!sketchFeature) return false;

        const geometry = sketchFeature.getGeometry();
        if (!geometry) return false;

        const extent = geometry.getExtent() as ExtentType;
        if (!this.isValidExtent(extent)) return false;

        const validation = this.validateExtent(extent);
        return validation.valid;
      },
    });

    // Handle draw end
    this.drawInteraction.on('drawend', (event) => {
      this.handleDrawEnd(event.feature as Feature<Polygon>);
    });

    this.map.addInteraction(this.drawInteraction);
    this.isDrawingActive = true;

    // Set up tooltip tracking during drawing
    this.pointermoveHandler = (event) => {
      // During active drawing, get the sketch feature's extent
      const sketchFeature = (this.drawInteraction as any)?.sketchFeature_;
      if (sketchFeature) {
        const geometry = sketchFeature.getGeometry();
        if (geometry) {
          const extent = geometry.getExtent() as ExtentType;
          if (this.isValidExtent(extent)) {
            const originalEvent = event.originalEvent;
            if ('clientX' in originalEvent && 'clientY' in originalEvent) {
              this.tooltip.style.left = `${originalEvent.clientX + 15}px`;
              this.tooltip.style.top = `${originalEvent.clientY + 15}px`;
              this.updateTooltipContent(extent);
              this.tooltip.classList.remove('hidden');
              return;
            }
          }
        }
      }

      // Show tooltip for existing feature
      if (this.currentFeature) {
        const geometry = this.currentFeature.getGeometry();
        if (geometry) {
          const extent = geometry.getExtent() as ExtentType;
          if (this.isValidExtent(extent)) {
            const originalEvent = event.originalEvent;
            if ('clientX' in originalEvent && 'clientY' in originalEvent) {
              this.tooltip.style.left = `${originalEvent.clientX + 15}px`;
              this.tooltip.style.top = `${originalEvent.clientY + 15}px`;
              this.updateTooltipContent(extent);
              this.tooltip.classList.remove('hidden');
              return;
            }
          }
        }
      }

      this.tooltip.classList.add('hidden');
    };

    this.mouseoutHandler = () => {
      this.tooltip.classList.add('hidden');
    };

    this.map.on('pointermove', this.pointermoveHandler);
    this.map.getViewport().addEventListener('mouseout', this.mouseoutHandler);

    console.log('Bounding box drawing enabled (click-click mode)');
  }

  /**
   * Disables the Draw interaction
   */
  disableDrawing(): void {
    if (!this.isDrawingActive || !this.drawInteraction) {
      console.debug('Drawing already disabled, skipping');
      return;
    }

    this.map.removeInteraction(this.drawInteraction);
    this.drawInteraction = null;
    this.isDrawingActive = false;

    // Clean up event listeners
    if (this.pointermoveHandler) {
      this.map.un('pointermove', this.pointermoveHandler);
      this.pointermoveHandler = null;
    }

    if (this.mouseoutHandler) {
      this.map.getViewport().removeEventListener('mouseout', this.mouseoutHandler);
      this.mouseoutHandler = null;
    }

    this.tooltip.classList.add('hidden');
    console.log('Bounding box drawing disabled');
  }

  /**
   * Clears the current bounding box and resets state
   */
  clearBoundingBox(): void {
    console.log('Clearing bounding box');

    this.disableDrawing();
    this.vectorSource.clear();
    this.currentFeature = null;
    this.tooltip.classList.add('hidden');

    console.log('Bounding box cleared');
  }

  /**
   * Registers a callback to be called when the bounding box is drawn
   */
  onBBoxDrawn(callback: (bbox: BoundingBox) => void): void {
    this.callback = callback;
  }

  /**
   * Programmatically load a bounding box extent onto the map
   * Used when loading saved bookmarks
   */
  loadExtent(bbox: BoundingBox): void {
    // Clear any existing drawing
    this.disableDrawing();
    this.vectorSource.clear();

    // Transform from EPSG:3006 to EPSG:3857 for map display
    const [minX, minY] = proj4('EPSG:3006', 'EPSG:3857', [bbox.minX, bbox.minY]);
    const [maxX, maxY] = proj4('EPSG:3006', 'EPSG:3857', [bbox.maxX, bbox.maxY]);

    // Create a polygon feature for the extent
    const coordinates = [
      [
        [minX, minY],
        [maxX, minY],
        [maxX, maxY],
        [minX, maxY],
        [minX, minY],
      ],
    ];

    const polygon = new Polygon(coordinates);
    const feature = new Feature({ geometry: polygon });
    feature.setStyle(this.boxStyle);

    this.vectorSource.addFeature(feature);
    this.currentFeature = feature as Feature<Polygon>;

    // Re-setup tooltip handler for the loaded extent
    this.pointermoveHandler = (event) => {
      if (this.currentFeature) {
        const geometry = this.currentFeature.getGeometry();
        if (geometry) {
          const extent = geometry.getExtent() as ExtentType;
          if (this.isValidExtent(extent)) {
            const originalEvent = event.originalEvent;
            if ('clientX' in originalEvent && 'clientY' in originalEvent) {
              this.tooltip.style.left = `${originalEvent.clientX + 15}px`;
              this.tooltip.style.top = `${originalEvent.clientY + 15}px`;
              this.updateTooltipContent(extent);
              this.tooltip.classList.remove('hidden');
              return;
            }
          }
        }
      }
      this.tooltip.classList.add('hidden');
    };

    this.mouseoutHandler = () => {
      this.tooltip.classList.add('hidden');
    };

    this.map.on('pointermove', this.pointermoveHandler);
    this.map.getViewport().addEventListener('mouseout', this.mouseoutHandler);

    // Trigger the callback
    if (this.callback) {
      this.callback(bbox);
    }
  }

  /**
   * Check if current bounding box meets minimum area requirement
   */
  getCurrentBBoxArea(): { areaM2: number; isValid: boolean } | null {
    if (!this.currentFeature) {
      return null;
    }

    const geometry = this.currentFeature.getGeometry();
    if (!geometry) {
      return null;
    }

    const extent = geometry.getExtent() as ExtentType;
    if (!this.isValidExtent(extent)) {
      return null;
    }

    // Transform corners to EPSG:3006 for accurate area calculation
    const [minX, minY] = proj4('EPSG:3857', 'EPSG:3006', [extent[0], extent[1]]);
    const [maxX, maxY] = proj4('EPSG:3857', 'EPSG:3006', [extent[2], extent[3]]);

    const width = Math.abs(maxX - minX);
    const height = Math.abs(maxY - minY);
    const areaM2 = width * height;

    return {
      areaM2,
      isValid: areaM2 >= MIN_BBOX_AREA_M2,
    };
  }
}
