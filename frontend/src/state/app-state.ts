import { BoundingBox, DatasetInfo } from '../types';

type EventHandler = (data: any) => void;

/**
 * Centralized application state with event emission for reactivity
 * Simple pub-sub pattern without external dependencies
 */
export class AppState {
  // State properties
  private bbox: BoundingBox | null = null;
  private datasets: DatasetInfo[] = [];

  // Event listeners registry
  private listeners: Map<string, EventHandler[]> = new Map();

  // Bbox state management
  setBbox(bbox: BoundingBox | null): void {
    this.bbox = bbox;
    this.emit('bbox-changed', bbox);
  }

  getBbox(): BoundingBox | null {
    return this.bbox;
  }

  // Datasets state management
  setDatasets(datasets: DatasetInfo[]): void {
    this.datasets = datasets;
    this.emit('datasets-changed', datasets);
  }

  getDatasets(): DatasetInfo[] {
    return this.datasets;
  }

  // Event subscription
  on(event: string, handler: EventHandler): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(handler);
  }

  // Event unsubscription
  off(event: string, handler: EventHandler): void {
    const handlers = this.listeners.get(event);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  // Event emission (private)
  private emit(event: string, data: any): void {
    const handlers = this.listeners.get(event) || [];
    handlers.forEach(handler => handler(data));
  }

  // Reset all state (for clear button)
  reset(): void {
    this.bbox = null;
    this.datasets = [];
    this.emit('state-reset', null);
  }
}

// Singleton instance
export const appState = new AppState();

// Export type for testing and type safety
export type { EventHandler };
