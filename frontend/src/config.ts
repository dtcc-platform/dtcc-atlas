/**
 * Application configuration
 */

/**
 * Maximum allowed bounding box area in square kilometers
 * Default: 10 km²
 *
 * To change this value, modify the constant below.
 * This is not exposed in the UI and must be changed in source code.
 */
export const MAX_BBOX_AREA_KM2 = 25;

/**
 * Maximum allowed bounding box area in square meters
 * (derived from MAX_BBOX_AREA_KM2)
 */
export const MAX_BBOX_AREA_M2 = MAX_BBOX_AREA_KM2 * 1_000_000;

export const MIN_BBOX_AREA_M2 = 25;

// Use relative URL - works for both dev (via proxy) and production (same origin)
export const API_BASE_URL = '/api/v1';

