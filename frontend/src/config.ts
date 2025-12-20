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
export const MAX_BBOX_AREA_KM2 = 10;

/**
 * Maximum allowed bounding box area in square meters
 * (derived from MAX_BBOX_AREA_KM2)
 */
export const MAX_BBOX_AREA_M2 = MAX_BBOX_AREA_KM2 * 1_000_000;
