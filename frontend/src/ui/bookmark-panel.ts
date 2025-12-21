import type { SavedBookmark } from '../types';

type LoadCallback = (bookmark: SavedBookmark) => void;
type DeleteCallback = (id: string) => void;

/**
 * BookmarkPanel - UI component for displaying and managing saved bookmarks
 */
export class BookmarkPanel {
  private panel: HTMLElement;
  private listContainer: HTMLElement;
  private emptyState: HTMLElement;
  private closeButton: HTMLElement;
  private loadCallback: LoadCallback | null = null;
  private deleteCallback: DeleteCallback | null = null;

  constructor() {
    // Get DOM elements
    this.panel = document.getElementById('bookmark-panel') as HTMLElement;
    this.listContainer = document.getElementById('bookmark-list') as HTMLElement;
    this.emptyState = this.panel.querySelector('.bookmark-empty-state') as HTMLElement;
    this.closeButton = this.panel.querySelector('.close-button') as HTMLElement;

    if (!this.panel || !this.listContainer || !this.emptyState || !this.closeButton) {
      throw new Error('Bookmark panel elements not found');
    }

    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    // Close button
    this.closeButton.addEventListener('click', () => {
      this.hide();
    });

    // Escape key to close
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !this.panel.classList.contains('hidden')) {
        this.hide();
      }
    });
  }

  /**
   * Calculate area in km² from bounding box
   */
  private calculateArea(bookmark: SavedBookmark): number {
    const bbox = bookmark.bbox;
    const width = bbox.maxX - bbox.minX; // in meters
    const height = bbox.maxY - bbox.minY; // in meters
    const areaM2 = width * height;
    return areaM2 / 1_000_000; // convert to km²
  }

  /**
   * Format timestamp as readable date
   */
  private formatDate(timestamp: number): string {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return 'Today';
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    } else {
      return date.toLocaleDateString();
    }
  }

  /**
   * Render a single bookmark item
   */
  private renderBookmarkItem(bookmark: SavedBookmark): HTMLElement {
    const item = document.createElement('div');
    item.className = 'bookmark-item';
    item.dataset.bookmarkId = bookmark.id;

    const areaKm2 = this.calculateArea(bookmark);
    const dateStr = this.formatDate(bookmark.createdAt);

    item.innerHTML = `
      <div class="bookmark-color" style="background-color: ${bookmark.color || '#3498db'}"></div>
      <div class="bookmark-info">
        <div class="bookmark-name">${this.escapeHtml(bookmark.name)}</div>
        <div class="bookmark-meta">${areaKm2.toFixed(2)} km² • ${dateStr}</div>
      </div>
      <div class="bookmark-actions">
        <button class="bookmark-load" title="Load this bookmark">📍</button>
        <button class="bookmark-delete" title="Delete this bookmark">🗑️</button>
      </div>
    `;

    // Load button
    const loadBtn = item.querySelector('.bookmark-load') as HTMLButtonElement;
    loadBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.loadCallback) {
        this.loadCallback(bookmark);
      }
    });

    // Delete button
    const deleteBtn = item.querySelector('.bookmark-delete') as HTMLButtonElement;
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.deleteCallback) {
        this.deleteCallback(bookmark.id);
      }
    });

    return item;
  }

  /**
   * Escape HTML to prevent XSS
   */
  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Render the list of bookmarks
   */
  render(bookmarks: SavedBookmark[]): void {
    // Clear existing items
    this.listContainer.innerHTML = '';

    if (bookmarks.length === 0) {
      // Show empty state
      this.emptyState.classList.remove('hidden');
      this.listContainer.classList.add('hidden');
    } else {
      // Hide empty state and render items
      this.emptyState.classList.add('hidden');
      this.listContainer.classList.remove('hidden');

      bookmarks.forEach((bookmark) => {
        const item = this.renderBookmarkItem(bookmark);
        this.listContainer.appendChild(item);
      });
    }
  }

  /**
   * Show the bookmark panel
   */
  show(): void {
    this.panel.classList.remove('hidden');
  }

  /**
   * Hide the bookmark panel
   */
  hide(): void {
    this.panel.classList.add('hidden');
  }

  /**
   * Toggle panel visibility
   */
  toggle(): void {
    this.panel.classList.toggle('hidden');
  }

  /**
   * Register callback for loading a bookmark
   */
  onLoad(callback: LoadCallback): void {
    this.loadCallback = callback;
  }

  /**
   * Register callback for deleting a bookmark
   */
  onDelete(callback: DeleteCallback): void {
    this.deleteCallback = callback;
  }
}
