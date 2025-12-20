import Map from 'ol/Map';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import { Feature } from 'ol';
import { Polygon } from 'ol/geom';
import { Style, Stroke, Fill } from 'ol/style';
import { fromExtent } from 'ol/geom/Polygon';
import { Pointer as PointerInteraction } from 'ol/interaction';
import { MapBrowserEvent } from 'ol';
import proj4 from 'proj4';
import { BoundingBox } from '../types';
import { MAX_BBOX_AREA_M2, MAX_BBOX_AREA_KM2 } from '../config';

export class BBoxDrawer {
  private map: Map;
  private vectorLayer: VectorLayer<VectorSource>;
  private vectorSource: VectorSource;
  private callback: ((bbox: BoundingBox) => void) | null = null;
  private dragInteraction: PointerInteraction | null = null;
  private startCoordinate: [number, number] | null = null;
  private currentFeature: Feature | null = null;

  constructor(map: Map) {
    this.map = map;

    // Create vector source and layer for displaying the bounding box
    this.vectorSource = new VectorSource();
    this.vectorLayer = new VectorLayer({
      source: this.vectorSource,
      style: new Style({
        stroke: new Stroke({
          color: '#3498db',
          width: 2,
        }),
        fill: new Fill({
          color: 'rgba(52, 152, 219, 0.2)',
        }),
      }),
    });

    // Add vector layer to map
    this.map.addLayer(this.vectorLayer);

    // Create custom drag interaction
    this.createDragInteraction();
  }

  private createDragInteraction(): void {
    this.dragInteraction = new PointerInteraction({
      handleDownEvent: (evt: MapBrowserEvent<UIEvent>) => this.handleDown(evt),
      handleDragEvent: (evt: MapBrowserEvent<UIEvent>) => this.handleDrag(evt),
      handleUpEvent: (evt: MapBrowserEvent<UIEvent>) => this.handleUp(evt),
    });
  }

  private handleDown(evt: MapBrowserEvent<UIEvent>): boolean {
    this.startCoordinate = evt.coordinate;
    this.vectorSource.clear();
    return true;
  }

  private constrainExtent(startCoord: [number, number], endCoord: [number, number]): [number, number] {
    // Create extent from start and current coordinates
    const minX = Math.min(startCoord[0], endCoord[0]);
    const maxX = Math.max(startCoord[0], endCoord[0]);
    const minY = Math.min(startCoord[1], endCoord[1]);
    const maxY = Math.max(startCoord[1], endCoord[1]);

    // Transform to EPSG:3006 to calculate area
    const [minX_3006, minY_3006] = proj4('EPSG:3857', 'EPSG:3006', [minX, minY]);
    const [maxX_3006, maxY_3006] = proj4('EPSG:3857', 'EPSG:3006', [maxX, maxY]);

    const width = maxX_3006 - minX_3006;
    const height = maxY_3006 - minY_3006;
    const area = width * height;

    // If area exceeds maximum, constrain the end coordinate
    if (area > MAX_BBOX_AREA_M2) {
      // Calculate the maximum allowed dimensions
      const aspectRatio = width / height;

      // Solve for constrained dimensions: width * height = MAX_AREA
      // width = aspectRatio * height
      // aspectRatio * height * height = MAX_AREA
      const constrainedHeight = Math.sqrt(MAX_BBOX_AREA_M2 / aspectRatio);
      const constrainedWidth = aspectRatio * constrainedHeight;

      // Transform constrained dimensions back to EPSG:3857
      // Calculate new end coordinate in EPSG:3006
      const newMaxX_3006 = minX_3006 + constrainedWidth;
      const newMaxY_3006 = minY_3006 + constrainedHeight;

      // Transform back to EPSG:3857
      const [newMaxX, newMaxY] = proj4('EPSG:3006', 'EPSG:3857', [newMaxX_3006, newMaxY_3006]);

      // Determine which coordinate to constrain based on drag direction
      const xSign = endCoord[0] >= startCoord[0] ? 1 : -1;
      const ySign = endCoord[1] >= startCoord[1] ? 1 : -1;

      return [
        startCoord[0] + xSign * Math.abs(newMaxX - startCoord[0]),
        startCoord[1] + ySign * Math.abs(newMaxY - startCoord[1])
      ];
    }

    return endCoord;
  }

  private handleDrag(evt: MapBrowserEvent<UIEvent>): void {
    if (!this.startCoordinate) return;

    // Constrain the current coordinate based on max area
    const constrainedCoord = this.constrainExtent(this.startCoordinate, evt.coordinate);

    // Create extent
    const extent = [
      Math.min(this.startCoordinate[0], constrainedCoord[0]),
      Math.min(this.startCoordinate[1], constrainedCoord[1]),
      Math.max(this.startCoordinate[0], constrainedCoord[0]),
      Math.max(this.startCoordinate[1], constrainedCoord[1]),
    ];

    // Update or create feature
    if (this.currentFeature) {
      const geom = this.currentFeature.getGeometry() as Polygon;
      geom.setCoordinates([
        [
          [extent[0], extent[1]],
          [extent[0], extent[3]],
          [extent[2], extent[3]],
          [extent[2], extent[1]],
          [extent[0], extent[1]],
        ],
      ]);
    } else {
      const polygon = fromExtent(extent);
      this.currentFeature = new Feature(polygon);
      this.vectorSource.addFeature(this.currentFeature);
    }
  }

  private handleUp(evt: MapBrowserEvent<UIEvent>): boolean {
    if (!this.startCoordinate || !this.currentFeature) {
      this.startCoordinate = null;
      this.currentFeature = null;
      return false;
    }

    const polygon = this.currentFeature.getGeometry() as Polygon;
    const extent = polygon.getExtent();

    this.handleBoxDrawn(extent);

    this.startCoordinate = null;
    this.currentFeature = null;
    return false;
  }

  private calculateArea(bbox: BoundingBox): number {
    // Calculate area in square meters (EPSG:3006 uses meters)
    const width = bbox.maxX - bbox.minX;
    const height = bbox.maxY - bbox.minY;
    return width * height;
  }

  private handleBoxDrawn(extent: number[]): void {
    try {
      // Transform coordinates to EPSG:3006
      const [minX, minY] = proj4('EPSG:3857', 'EPSG:3006', [extent[0], extent[1]]);
      const [maxX, maxY] = proj4('EPSG:3857', 'EPSG:3006', [extent[2], extent[3]]);

      // Validate coordinates
      if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) {
        throw new Error('Invalid coordinate transformation');
      }

      const bbox: BoundingBox = {
        minX,
        minY,
        maxX,
        maxY,
        crs: 'EPSG:3006',
      };

      // Calculate area in square meters
      const areaM2 = this.calculateArea(bbox);
      const areaKm2 = areaM2 / 1_000_000;

      console.log('Bounding box captured:', bbox);
      console.log(`Area: ${areaKm2.toFixed(2)} km² (${areaM2.toFixed(0)} m²)`);

      // Invoke callback if registered
      if (this.callback) {
        this.callback(bbox);
      }
    } catch (error) {
      console.error('Error transforming coordinates:', error);
      alert('Error capturing bounding box. Please try again.');
      this.clearBoundingBox();
    }
  }

  enableDrawing(): void {
    if (this.dragInteraction) {
      this.map.addInteraction(this.dragInteraction);
      console.log('Bounding box drawing enabled');
    }
  }

  disableDrawing(): void {
    if (this.dragInteraction) {
      this.map.removeInteraction(this.dragInteraction);
      console.log('Bounding box drawing disabled');
    }
  }

  clearBoundingBox(): void {
    this.vectorSource.clear();
    console.log('Bounding box cleared');
  }

  onBBoxDrawn(callback: (bbox: BoundingBox) => void): void {
    this.callback = callback;
  }
}
