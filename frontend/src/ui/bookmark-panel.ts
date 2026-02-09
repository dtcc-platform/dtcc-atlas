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
   * Get relative time display
   */
  private getRelativeTime(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  }

  /**
   * Render a single bookmark item
   */
  private renderBookmarkItem(bookmark: SavedBookmark): HTMLElement {
    const item = document.createElement('div');
    item.className = 'border-b border-dtcc-border-light last:border-b-0 px-4 py-3 hover:bg-dtcc-gray-lighter transition-colors group';
    item.dataset.bookmarkId = bookmark.id;

    const areaKm2 = this.calculateArea(bookmark);
    const date = new Date(bookmark.createdAt);
    const relativeTime = this.getRelativeTime(date);

    item.innerHTML = `
      <div class="flex items-start justify-between gap-3">
        <div class="flex-1 min-w-0">
          <div class="text-sm font-medium text-dtcc-navy truncate">${this.escapeHtml(bookmark.name)}</div>
          <div class="flex items-center gap-3 mt-1 text-xs text-dtcc-gray-dark font-mono">
            <span>${areaKm2.toFixed(2)} km²</span>
            <span>•</span>
            <span>${relativeTime}</span>
          </div>
        </div>
        <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button class="bookmark-load p-1.5 hover:bg-white rounded transition-colors" title="Load bookmark">
            <span class="w-4 h-4 block text-dtcc-blue">
              <svg fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </span>
          </button>
          <button class="bookmark-delete p-1.5 hover:bg-white rounded transition-colors" title="Delete bookmark">
            <span class="w-4 h-4 block text-dtcc-red">
              <svg fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
            </span>
          </button>
        </div>
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
   * Check if panel is visible
   */
  isVisible(): boolean {
    return !this.panel.classList.contains('hidden');
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
