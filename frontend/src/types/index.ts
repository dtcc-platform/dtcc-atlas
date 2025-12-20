export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  crs: string;
}

export interface DatasetRequest {
  bounds: BoundingBox;
}

export interface MapConfig {
  center: [number, number];
  zoom: number;
  projection: string;
}
