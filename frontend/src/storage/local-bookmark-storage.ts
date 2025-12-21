import type { SavedBookmark } from '../types';
import type { IBookmarkStorage } from './bookmark-storage.interface';

const STORAGE_PREFIX = 'dtcc-bookmarks:';
const INDEX_KEY = `${STORAGE_PREFIX}index`;

/**
 * LocalStorage implementation of bookmark storage
 *
 * Stores bookmarks in browser LocalStorage with the following structure:
 * - dtcc-bookmarks:index → Array of bookmark IDs
 * - dtcc-bookmarks:{id} → Individual bookmark data
 */
export class LocalBookmarkStorage implements IBookmarkStorage {
  /**
   * Validate that a loaded object matches the SavedBookmark schema
   */
  private validateBookmark(data: any): data is SavedBookmark {
    return (
      data &&
      typeof data.id === 'string' &&
      typeof data.name === 'string' &&
      typeof data.createdAt === 'number' &&
      data.bbox &&
      typeof data.bbox.minX === 'number' &&
      typeof data.bbox.minY === 'number' &&
      typeof data.bbox.maxX === 'number' &&
      typeof data.bbox.maxY === 'number' &&
      data.bbox.crs === 'EPSG:3006'
    );
  }

  /**
   * Get the list of all bookmark IDs from the index
   */
  private getIndex(): string[] {
    try {
      const indexData = localStorage.getItem(INDEX_KEY);
      if (!indexData) return [];

      const index = JSON.parse(indexData);
      return Array.isArray(index) ? index : [];
    } catch (error) {
      console.error('Failed to load bookmark index:', error);
      return [];
    }
  }

  /**
   * Update the index with a new list of bookmark IDs
   */
  private setIndex(ids: string[]): void {
    try {
      localStorage.setItem(INDEX_KEY, JSON.stringify(ids));
    } catch (error) {
      console.error('Failed to save bookmark index:', error);
      throw new Error('Failed to update bookmark index');
    }
  }

  /**
   * Check LocalStorage size and warn if approaching limits
   */
  private checkStorageSize(): void {
    try {
      const totalSize = new Blob([JSON.stringify(localStorage)]).size;
      const maxSize = 5 * 1024 * 1024; // 5MB typical limit

      if (totalSize > maxSize * 0.9) {
        console.warn(
          `LocalStorage usage at ${((totalSize / maxSize) * 100).toFixed(1)}%. Consider deleting old bookmarks.`
        );
      }
    } catch (error) {
      // Size check is best-effort, don't fail if it doesn't work
      console.debug('Could not check storage size:', error);
    }
  }

  async save(bookmark: SavedBookmark): Promise<void> {
    try {
      // Validate bookmark before saving
      if (!this.validateBookmark(bookmark)) {
        throw new Error('Invalid bookmark data');
      }

      // Check storage size
      this.checkStorageSize();

      // Save bookmark data
      const key = `${STORAGE_PREFIX}${bookmark.id}`;
      localStorage.setItem(key, JSON.stringify(bookmark));

      // Update index
      const index = this.getIndex();
      if (!index.includes(bookmark.id)) {
        index.push(bookmark.id);
        this.setIndex(index);
      }
    } catch (error) {
      console.error('Failed to save bookmark:', error);
      throw new Error('Failed to save bookmark to LocalStorage');
    }
  }

  async getAll(): Promise<SavedBookmark[]> {
    const index = this.getIndex();
    const bookmarks: SavedBookmark[] = [];

    for (const id of index) {
      const bookmark = await this.getById(id);
      if (bookmark) {
        bookmarks.push(bookmark);
      }
    }

    // Sort by creation date (newest first)
    return bookmarks.sort((a, b) => b.createdAt - a.createdAt);
  }

  async getById(id: string): Promise<SavedBookmark | null> {
    try {
      const key = `${STORAGE_PREFIX}${id}`;
      const data = localStorage.getItem(key);

      if (!data) return null;

      const bookmark = JSON.parse(data);

      // Validate loaded data
      if (!this.validateBookmark(bookmark)) {
        console.error(`Invalid bookmark data for ID ${id}, removing`);
        localStorage.removeItem(key);
        return null;
      }

      return bookmark;
    } catch (error) {
      console.error(`Failed to load bookmark ${id}:`, error);
      // Remove corrupted data
      localStorage.removeItem(`${STORAGE_PREFIX}${id}`);
      return null;
    }
  }

  async delete(id: string): Promise<void> {
    try {
      // Remove bookmark data
      const key = `${STORAGE_PREFIX}${id}`;
      localStorage.removeItem(key);

      // Update index
      const index = this.getIndex();
      const newIndex = index.filter((bookmarkId) => bookmarkId !== id);
      this.setIndex(newIndex);
    } catch (error) {
      console.error(`Failed to delete bookmark ${id}:`, error);
      throw new Error('Failed to delete bookmark');
    }
  }

  async update(id: string, bookmark: SavedBookmark): Promise<void> {
    // For LocalStorage, update is the same as save
    // Ensure the ID matches
    if (bookmark.id !== id) {
      throw new Error('Bookmark ID mismatch');
    }

    await this.save(bookmark);
  }
}
