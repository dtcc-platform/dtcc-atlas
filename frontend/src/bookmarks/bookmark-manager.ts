import type { SavedBookmark, BoundingBox } from '../types';
import type { IBookmarkStorage } from '../storage/bookmark-storage.interface';

type EventHandler = (data: any) => void;

/**
 * Color palette for bookmarks
 */
const BOOKMARK_COLORS = [
  '#3498db', // Blue
  '#e74c3c', // Red
  '#2ecc71', // Green
  '#f39c12', // Orange
  '#9b59b6', // Purple
  '#1abc9c', // Turquoise
  '#e67e22', // Dark orange
  '#34495e', // Dark gray
];

/**
 * BookmarkManager - Manages bookmark CRUD operations and event system
 *
 * Uses dependency-injected storage to allow easy swapping between
 * LocalStorage and future server-side storage
 */
export class BookmarkManager {
  private storage: IBookmarkStorage;
  private bookmarks: SavedBookmark[] = [];
  private listeners: Map<string, EventHandler[]> = new Map();
  private colorIndex = 0;

  constructor(storage: IBookmarkStorage) {
    this.storage = storage;
  }

  /**
   * Initialize by loading all bookmarks from storage
   */
  async initialize(): Promise<void> {
    this.bookmarks = await this.storage.getAll();
    this.emit('bookmarks-changed', this.bookmarks);
  }

  /**
   * Generate a unique ID for a bookmark
   */
  private generateId(): string {
    // Use crypto.randomUUID() if available, fallback to timestamp-based ID
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }

    // Fallback for older browsers
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Get the next color from the palette
   */
  private getNextColor(): string {
    const color = BOOKMARK_COLORS[this.colorIndex % BOOKMARK_COLORS.length];
    this.colorIndex++;
    return color;
  }

  /**
   * Save a new bookmark
   */
  async saveBookmark(name: string, bbox: BoundingBox): Promise<SavedBookmark> {
    const bookmark: SavedBookmark = {
      id: this.generateId(),
      name: name.trim(),
      bbox,
      createdAt: Date.now(),
      color: this.getNextColor(),
    };

    await this.storage.save(bookmark);
    this.bookmarks.push(bookmark);

    // Sort by creation date (newest first)
    this.bookmarks.sort((a, b) => b.createdAt - a.createdAt);

    this.emit('bookmark-saved', bookmark);
    this.emit('bookmarks-changed', this.bookmarks);

    return bookmark;
  }

  /**
   * Get all bookmarks
   */
  getAllBookmarks(): SavedBookmark[] {
    return [...this.bookmarks];
  }

  /**
   * Get a bookmark by ID
   */
  async getBookmark(id: string): Promise<SavedBookmark | null> {
    return await this.storage.getById(id);
  }

  /**
   * Delete a bookmark
   */
  async deleteBookmark(id: string): Promise<void> {
    await this.storage.delete(id);

    this.bookmarks = this.bookmarks.filter((b) => b.id !== id);

    this.emit('bookmark-deleted', id);
    this.emit('bookmarks-changed', this.bookmarks);
  }

  /**
   * Update an existing bookmark
   */
  async updateBookmark(id: string, updates: Partial<SavedBookmark>): Promise<void> {
    const existing = this.bookmarks.find((b) => b.id === id);
    if (!existing) {
      throw new Error(`Bookmark ${id} not found`);
    }

    const updated: SavedBookmark = {
      ...existing,
      ...updates,
      id, // Ensure ID doesn't change
    };

    await this.storage.update(id, updated);

    // Update in-memory cache
    const index = this.bookmarks.findIndex((b) => b.id === id);
    if (index !== -1) {
      this.bookmarks[index] = updated;
    }

    this.emit('bookmark-updated', updated);
    this.emit('bookmarks-changed', this.bookmarks);
  }

  /**
   * Register an event listener
   */
  on(event: string, handler: EventHandler): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(handler);
  }

  /**
   * Unregister an event listener
   */
  off(event: string, handler: EventHandler): void {
    const handlers = this.listeners.get(event);
    if (!handlers) return;

    const index = handlers.indexOf(handler);
    if (index !== -1) {
      handlers.splice(index, 1);
    }
  }

  /**
   * Emit an event to all registered listeners
   */
  private emit(event: string, data: any): void {
    const handlers = this.listeners.get(event);
    if (!handlers) return;

    handlers.forEach((handler) => {
      try {
        handler(data);
      } catch (error) {
        console.error(`Error in event handler for ${event}:`, error);
      }
    });
  }
}
