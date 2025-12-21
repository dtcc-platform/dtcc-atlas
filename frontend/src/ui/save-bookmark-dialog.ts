import type { BoundingBox } from '../types';

type SaveCallback = (name: string, bbox: BoundingBox) => void;

/**
 * SaveBookmarkDialog - Modal dialog for saving a bookmark with a custom name
 */
export class SaveBookmarkDialog {
  private dialog: HTMLElement;
  private nameInput: HTMLInputElement;
  private areaPreview: HTMLElement;
  private confirmButton: HTMLButtonElement;
  private cancelButton: HTMLButtonElement;
  private callback: SaveCallback | null = null;
  private currentBbox: BoundingBox | null = null;

  constructor() {
    // Get DOM elements
    this.dialog = document.getElementById('save-bookmark-dialog') as HTMLElement;
    this.nameInput = document.getElementById('bookmark-name-input') as HTMLInputElement;
    this.areaPreview = document.getElementById('preview-area') as HTMLElement;
    this.confirmButton = document.getElementById('save-confirm') as HTMLButtonElement;
    this.cancelButton = document.getElementById('save-cancel') as HTMLButtonElement;

    if (!this.dialog || !this.nameInput || !this.areaPreview || !this.confirmButton || !this.cancelButton) {
      throw new Error('Save bookmark dialog elements not found');
    }

    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    // Confirm button
    this.confirmButton.addEventListener('click', () => {
      this.handleSave();
    });

    // Cancel button
    this.cancelButton.addEventListener('click', () => {
      this.hide();
    });

    // Enter key to save
    this.nameInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.handleSave();
      }
    });

    // Escape key to cancel
    this.dialog.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.hide();
      }
    });

    // Click outside to close
    this.dialog.addEventListener('click', (e) => {
      if (e.target === this.dialog) {
        this.hide();
      }
    });
  }

  /**
   * Calculate area in km² from bounding box
   */
  private calculateArea(bbox: BoundingBox): number {
    const width = bbox.maxX - bbox.minX; // in meters
    const height = bbox.maxY - bbox.minY; // in meters
    const areaM2 = width * height;
    return areaM2 / 1_000_000; // convert to km²
  }

  /**
   * Handle save action
   */
  private handleSave(): void {
    const name = this.nameInput.value.trim();

    // Validate name
    if (!name) {
      alert('Please enter a name for the bookmark');
      this.nameInput.focus();
      return;
    }

    if (name.length > 100) {
      alert('Bookmark name must be 100 characters or less');
      this.nameInput.focus();
      return;
    }

    if (!this.currentBbox) {
      alert('No bounding box selected');
      return;
    }

    // Call the callback
    if (this.callback) {
      this.callback(name, this.currentBbox);
    }

    // Reset and hide
    this.nameInput.value = '';
    this.currentBbox = null;
  }

  /**
   * Show the dialog with a bounding box
   */
  show(bbox: BoundingBox): void {
    this.currentBbox = bbox;

    // Update area preview
    const areaKm2 = this.calculateArea(bbox);
    this.areaPreview.textContent = `${areaKm2.toFixed(2)}`;

    // Clear and focus name input
    this.nameInput.value = '';
    this.dialog.classList.remove('hidden');
    this.nameInput.focus();
  }

  /**
   * Hide the dialog
   */
  hide(): void {
    this.dialog.classList.add('hidden');
    this.nameInput.value = '';
    this.currentBbox = null;
  }

  /**
   * Register a callback for when the user saves a bookmark
   */
  onSave(callback: SaveCallback): void {
    this.callback = callback;
  }
}
