import type { BoundingBox } from './index';

/**
 * Represents a saved bounding box bookmark
 */
export interface SavedBookmark {
  /** Unique identifier (UUID) */
  id: string;

  /** User-provided name for the bookmark */
  name: string;

  /** The bounding box coordinates (in EPSG:3006) */
  bbox: BoundingBox;

  /** Creation timestamp (milliseconds since epoch) */
  createdAt: number;

  /** Optional color for visual distinction on map */
  color?: string;
}
