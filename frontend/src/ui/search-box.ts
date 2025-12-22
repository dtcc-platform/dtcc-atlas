import type { NominatimResult } from '../types';
import { searchLocation } from '../api/geocoding-api';

/**
 * SearchBox component for location search using Nominatim API
 */
export class SearchBox {
  private container: HTMLElement;
  private input: HTMLInputElement;
  private searchButton: HTMLButtonElement;
  private resultsContainer: HTMLElement;
  private onResultSelectCallback: ((lat: number, lon: number, boundingbox?: number[]) => void) | null = null;
  private debounceTimer: number | null = null;

  constructor() {
    this.container = document.getElementById('search-box') as HTMLElement;
    this.input = document.getElementById('search-input') as HTMLInputElement;
    this.searchButton = document.getElementById('search-button') as HTMLButtonElement;
    this.resultsContainer = document.getElementById('search-results') as HTMLElement;

    if (!this.container || !this.input || !this.searchButton || !this.resultsContainer) {
      throw new Error('Search box elements not found in DOM');
    }

    this.setupEventListeners();
  }

  /**
   * Register callback for when a search result is selected
   */
  onResultSelect(callback: (lat: number, lon: number, boundingbox?: number[]) => void): void {
    this.onResultSelectCallback = callback;
  }

  private setupEventListeners(): void {
    // Search button click
    this.searchButton.addEventListener('click', () => {
      this.clearDebounce();
      this.handleSearch();
    });

    // Type-ahead search with debouncing
    this.input.addEventListener('input', () => {
      this.handleTypeAhead();
    });

    // Enter key in input - immediate search without debounce
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.clearDebounce();
        this.handleSearch();
      }
    });

    // Clear results when clicking outside
    document.addEventListener('click', (e) => {
      if (!this.container.contains(e.target as Node)) {
        this.clearResults();
      }
    });
  }

  /**
   * Handle type-ahead search with debouncing
   */
  private handleTypeAhead(): void {
    const query = this.input.value.trim();

    // Clear previous debounce timer
    this.clearDebounce();

    // Clear results if input is empty
    if (!query) {
      this.clearResults();
      return;
    }

    // Set new debounce timer (500ms delay)
    this.debounceTimer = window.setTimeout(() => {
      this.handleSearch();
    }, 500);
  }

  /**
   * Clear debounce timer
   */
  private clearDebounce(): void {
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  private async handleSearch(): Promise<void> {
    const query = this.input.value.trim();

    if (!query) {
      this.clearResults();
      return;
    }

    this.clearResults();
    this.showLoading();

    try {
      const results = await searchLocation(query);

      if (results.length === 0) {
        this.showError(`No locations found for "${query}"`);
        return;
      }

      this.displayResults(results);
    } catch (error) {
      console.error('Search error:', error);
      this.showError('Search unavailable. Please try again.');
    }
  }

  private showLoading(): void {
    this.resultsContainer.innerHTML = '<div class="search-loading">Searching...</div>';
    this.resultsContainer.classList.add('visible');
  }

  private displayResults(results: NominatimResult[]): void {
    this.clearResults();

    const resultsList = document.createElement('div');
    resultsList.className = 'search-results-list';

    results.forEach((result) => {
      const resultItem = document.createElement('div');
      resultItem.className = 'search-result-item';
      resultItem.textContent = result.display_name;

      resultItem.addEventListener('click', () => {
        this.selectResult(result);
      });

      resultsList.appendChild(resultItem);
    });

    this.resultsContainer.appendChild(resultsList);
    this.resultsContainer.classList.add('visible');
  }

  private selectResult(result: NominatimResult): void {
    const lat = parseFloat(result.lat);
    const lon = parseFloat(result.lon);

    // Convert boundingbox to numbers if available
    let boundingbox: number[] | undefined;
    if (result.boundingbox) {
      boundingbox = result.boundingbox.map(coord => parseFloat(coord));
    }

    if (this.onResultSelectCallback) {
      this.onResultSelectCallback(lat, lon, boundingbox);
    }

    // Update input with selected location
    this.input.value = result.display_name;
    this.clearResults();
  }

  private showError(message: string): void {
    this.resultsContainer.innerHTML = `<div class="search-error">${message}</div>`;
    this.resultsContainer.classList.add('visible');

    // Auto-hide error after 5 seconds
    setTimeout(() => {
      this.clearResults();
    }, 5000);
  }

  private clearResults(): void {
    this.resultsContainer.innerHTML = '';
    this.resultsContainer.classList.remove('visible');
  }
}
