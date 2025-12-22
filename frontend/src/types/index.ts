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

/**
 * Extended dataset download request with dynamic parameters
 */
export interface DatasetDownloadRequest {
  dataset: string;
  bounds: number[];
  parameters: Record<string, unknown>;
  filename?: string;
}

/**
 * Dataset download API response
 */
export interface DatasetDownloadResponse {
  success: boolean;
  message: string;
  downloadId?: string;
  downloadUrl?: string;
}

/**
 * Nominatim geocoding API response
 */
export interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
  boundingbox?: [string, string, string, string]; // [south, north, west, east]
  osm_type?: string;
  type?: string;
}

// Export bookmark types
export * from './bookmarks';
