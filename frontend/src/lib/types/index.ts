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

/**
 * Dataset information from the API
 */
export interface DatasetInfo {
  name: string;
  type?: string;  // 'raster' | 'vector'
  source?: string;  // 'dtcc-core' | 'lm-geotorget' | 'test-data'
  source_group?: string; // 'dtcc-core' | 'dtcc-sim' | 'user-uploaded' | 'published' | 'other'
  source_label?: string;
  title?: string;
  path?: string;
  data_kind?: string; // point_cloud | vector | raster | mesh | city_model | mixed | unknown
  data_kind_label?: string;
  return_types?: string[];
  supported_formats?: string[];
  upload_batch_id?: string;
  upload_name?: string;
  uploaded_at?: string;
  version?: number;
  bounds?: number[]; // [minX, minY, maxX, maxY] when known
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
