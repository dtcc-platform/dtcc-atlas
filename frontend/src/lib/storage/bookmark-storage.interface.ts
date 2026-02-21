import type { SavedBookmark } from '../types';

/**
 * Abstract storage interface for bookmark persistence
 *
 * This interface allows swapping between LocalStorage (MVP) and
 * server-side storage (future) without changing business logic
 */
export interface IBookmarkStorage {
  /**
   * Save a bookmark to storage
   */
  save(bookmark: SavedBookmark): Promise<void>;

  /**
   * Retrieve all bookmarks from storage
   */
  getAll(): Promise<SavedBookmark[]>;

  /**
   * Retrieve a specific bookmark by ID
   */
  getById(id: string): Promise<SavedBookmark | null>;

  /**
   * Delete a bookmark from storage
   */
  delete(id: string): Promise<void>;

  /**
   * Update an existing bookmark
   */
  update(id: string, bookmark: SavedBookmark): Promise<void>;
}
