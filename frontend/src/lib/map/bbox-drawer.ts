import maplibregl from 'maplibre-gl';
import proj4 from 'proj4';
import type { BoundingBox } from '../types';
import { MAX_BBOX_AREA_M2, MAX_BBOX_AREA_KM2, MIN_BBOX_AREA_M2 } from '../config';

// Register EPSG:3006 projection
proj4.defs('EPSG:3006', '+proj=utm +zone=33 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs');

/**
 * BBoxDrawer - Handles drawing and editing axis-aligned bounding boxes on the map
 *
 * Uses click-click drawing:
 * - First click sets one corner
 * - Moving mouse expands the rectangle
 * - Second click confirms the opposite corner
 */
export class BBoxDrawer {
  private map: maplibregl.Map;
  private callback: ((bbox: BoundingBox) => void) | null = null;
  private readonly tooltip: HTMLElement;
  private isDrawingActive: boolean = false;
  private firstCorner: [number, number] | null = null;
  private currentBbox: BoundingBox | null = null;

  private readonly BBOX_SOURCE = 'bbox-source';
  private readonly BBOX_FILL_LAYER = 'bbox-fill';
  private readonly BBOX_LINE_LAYER = 'bbox-line';
  private readonly BBOX_LABEL_SOURCE = 'bbox-label-source';
  private readonly BBOX_LABEL_LAYER = 'bbox-label';

  constructor(map: maplibregl.Map) {
    this.map = map;

    // Get tooltip element
    this.tooltip = document.getElementById('bbox-tooltip') as HTMLElement;
    if (!this.tooltip) {
      throw new Error('Tooltip element not found');
    }

    // Add source and layers when map is loaded
    this.map.on('load', () => this.setupLayers());

    // If map is already loaded, set up immediately
    if (this.map.loaded()) {
      this.setupLayers();
    }
  }

  private setupLayers(): void {
    // Add GeoJSON source for the bbox
    if (!this.map.getSource(this.BBOX_SOURCE)) {
      this.map.addSource(this.BBOX_SOURCE, {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: [],
        },
      });

      // Add fill layer
      this.map.addLayer({
        id: this.BBOX_FILL_LAYER,
        type: 'fill',
        source: this.BBOX_SOURCE,
        paint: {
          'fill-color': '#E35A1D',
          'fill-opacity': 0.2,
        },
      });

      // Add line layer
      this.map.addLayer({
        id: this.BBOX_LINE_LAYER,
        type: 'line',
        source: this.BBOX_SOURCE,
        paint: {
          'line-color': '#E35A1D',
          'line-width': 2,
        },
      });

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
    }
  }

  /**
   * Convert lon/lat to EPSG:3006
   */
  private toEPSG3006(lon: number, lat: number): [number, number] {
    return proj4('EPSG:4326', 'EPSG:3006', [lon, lat]) as [number, number];
  }

  /**
   * Convert EPSG:3006 to lon/lat
   */
  private fromEPSG3006(x: number, y: number): [number, number] {
    return proj4('EPSG:3006', 'EPSG:4326', [x, y]) as [number, number];
  }

  /**
   * Calculate area in EPSG:3006 (meters)
   */
  private calculateArea(minLon: number, minLat: number, maxLon: number, maxLat: number): number {
    const [minX, minY] = this.toEPSG3006(minLon, minLat);
    const [maxX, maxY] = this.toEPSG3006(maxLon, maxLat);
    const width = Math.abs(maxX - minX);
    const height = Math.abs(maxY - minY);
    return width * height;
  }

  /**
   * Update the GeoJSON source with current bbox
   */
  private updateBboxDisplay(minLon: number, minLat: number, maxLon: number, maxLat: number): void {
    const source = this.map.getSource(this.BBOX_SOURCE) as maplibregl.GeoJSONSource;
    if (!source) return;

    const coordinates = [
      [minLon, minLat],
      [maxLon, minLat],
      [maxLon, maxLat],
      [minLon, maxLat],
      [minLon, minLat],
    ];

    source.setData({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'Polygon',
            coordinates: [coordinates],
          },
        },
      ],
    });
  }

  /**
   * Clear the bbox display
   */
  private clearBboxDisplay(): void {
    const source = this.map.getSource(this.BBOX_SOURCE) as maplibregl.GeoJSONSource;
    if (!source) return;

    source.setData({
      type: 'FeatureCollection',
      features: [],
    });
    this.clearLabelDisplay();
  }

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

  /**
   * Updates the tooltip content with current area in km² or m²
   */
  private updateTooltipContent(areaM2: number): void {
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
   * Handle mouse click during drawing
   */
  private onClick = (e: maplibregl.MapMouseEvent): void => {
    if (!this.isDrawingActive) return;

    const { lng, lat } = e.lngLat;

    if (!this.firstCorner) {
      // First click - set the first corner
      this.firstCorner = [lng, lat];
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

      // Call the callback
      if (this.callback) {
        this.callback(this.currentBbox);
      }

      // Keep draw mode active for rapid redraws.
      // Reset first corner so the next click starts a fresh rectangle.
      this.firstCorner = null;
    }
  };

  /**
   * Handle mouse move during drawing
   */
  private onMouseMove = (e: maplibregl.MapMouseEvent): void => {
    // Update tooltip position
    this.tooltip.style.left = `${e.originalEvent.clientX + 15}px`;
    this.tooltip.style.top = `${e.originalEvent.clientY + 15}px`;

    if (this.isDrawingActive && this.firstCorner) {
      const { lng, lat } = e.lngLat;
      const [lon1, lat1] = this.firstCorner;

      const minLon = Math.min(lon1, lng);
      const maxLon = Math.max(lon1, lng);
      const minLat = Math.min(lat1, lat);
      const maxLat = Math.max(lat1, lat);

      // Update preview bbox
      this.updateBboxDisplay(minLon, minLat, maxLon, maxLat);

      // Update tooltip with area
      const areaM2 = this.calculateArea(minLon, minLat, maxLon, maxLat);
      this.updateTooltipContent(areaM2);
      this.tooltip.classList.remove('hidden');
    } else if (this.currentBbox) {
      // Show tooltip for existing bbox
      const [minX, minY] = [this.currentBbox.minX, this.currentBbox.minY];
      const [maxX, maxY] = [this.currentBbox.maxX, this.currentBbox.maxY];
      const width = Math.abs(maxX - minX);
      const height = Math.abs(maxY - minY);
      const areaM2 = width * height;
      this.updateTooltipContent(areaM2);
      this.tooltip.classList.remove('hidden');
    } else {
      this.tooltip.classList.add('hidden');
    }
  };

  /**
   * Handle mouse leave
   */
  private onMouseLeave = (): void => {
    this.tooltip.classList.add('hidden');
  };

  /**
   * Enables the Draw interaction on the map
   */
  enableDrawing(): void {
    if (this.isDrawingActive) {
      console.debug('Drawing already enabled, skipping');
      return;
    }

    // Clear any existing box when starting a new draw
    this.clearBboxDisplay();
    this.currentBbox = null;
    this.firstCorner = null;

    this.isDrawingActive = true;
    this.map.getCanvas().style.cursor = 'crosshair';

    // Add event listeners
    this.map.on('click', this.onClick);
    this.map.on('mousemove', this.onMouseMove);
    this.map.getCanvas().addEventListener('mouseleave', this.onMouseLeave);

    console.log('Bounding box drawing enabled (click-click mode)');
  }

  /**
   * Cancels the current drawing operation without keeping any partial box
   */
  cancelDrawing(): boolean {
    if (!this.isDrawingActive) {
      return false;
    }

    this.clearBboxDisplay();
    this.currentBbox = null;
    this.disableDrawing();
    console.log('Bounding box drawing cancelled');
    return true;
  }

  /**
   * Returns whether drawing mode is currently active
   */
  isDrawing(): boolean {
    return this.isDrawingActive;
  }

  /**
   * Returns whether a completed selection currently exists
   */
  hasSelection(): boolean {
    return this.currentBbox !== null;
  }

  /**
   * Disables the Draw interaction
   */
  disableDrawing(): void {
    if (!this.isDrawingActive) {
      console.debug('Drawing already disabled, skipping');
      return;
    }

    this.isDrawingActive = false;
    this.firstCorner = null;
    this.map.getCanvas().style.cursor = '';

    // Remove event listeners
    this.map.off('click', this.onClick);
    this.map.off('mousemove', this.onMouseMove);
    this.map.getCanvas().removeEventListener('mouseleave', this.onMouseLeave);

    this.tooltip.classList.add('hidden');
    console.log('Bounding box drawing disabled');
  }

  /**
   * Clears the current bounding box and resets state
   */
  clearBoundingBox(): void {
    console.log('Clearing bounding box');

    this.disableDrawing();
    this.clearBboxDisplay();
    this.currentBbox = null;
    this.tooltip.classList.add('hidden');

    console.log('Bounding box cleared');
  }

  /**
   * Clear the current selection while keeping draw mode active
   */
  clearSelectionKeepDrawing(): void {
    if (!this.isDrawingActive) {
      this.clearBoundingBox();
      return;
    }

    this.clearBboxDisplay();
    this.currentBbox = null;
    this.firstCorner = null;
    this.tooltip.classList.add('hidden');
    this.map.getCanvas().style.cursor = 'crosshair';
  }

  /**
   * Registers a callback to be called when the bounding box is drawn
   */
  onBBoxDrawn(callback: (bbox: BoundingBox) => void): void {
    this.callback = callback;
  }

  /**
   * Programmatically load a bounding box extent onto the map
   */
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

    // Remove any existing listeners before adding new ones
    this.map.off('mousemove', this.onMouseMove);
    this.map.getCanvas().removeEventListener('mouseleave', this.onMouseLeave);

    // Set up tooltip handler for the loaded extent
    this.map.on('mousemove', this.onMouseMove);
    this.map.getCanvas().addEventListener('mouseleave', this.onMouseLeave);

    // Trigger the callback
    if (this.callback) {
      this.callback(bbox);
    }
  }

  /**
   * Check if current bounding box meets minimum area requirement
   */
  getCurrentBBoxArea(): { areaM2: number; isValid: boolean } | null {
    if (!this.currentBbox) {
      return null;
    }

    const width = Math.abs(this.currentBbox.maxX - this.currentBbox.minX);
    const height = Math.abs(this.currentBbox.maxY - this.currentBbox.minY);
    const areaM2 = width * height;

    return {
      areaM2,
      isValid: areaM2 >= MIN_BBOX_AREA_M2,
    };
  }
}
