import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import XYZ from 'ol/source/XYZ';
import { fromLonLat } from 'ol/proj';
import { defaults as defaultInteractions } from 'ol/interaction/defaults';

export class MapManager {
  private map: Map | null = null;

  initializeMap(targetId: string): Map {
    // Create dark theme tile layer (CartoDB Dark Matter)
    const darkLayer = new TileLayer({
      source: new XYZ({
        url: 'https://{a-d}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
        attributions:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> ' +
          '&copy; <a href="https://carto.com/attributions">CARTO</a>',
      }),
      // Apply contrast filter to make labels more visible
      className: 'dark-map-layer',
    });

    // Create map centered on Sweden with explicit default interactions
    // This ensures zoom (mouse wheel, double-click) and pan work even when Extent interaction is active
    this.map = new Map({
      target: targetId,
      layers: [darkLayer],
      interactions: defaultInteractions({
        mouseWheelZoom: true,
        doubleClickZoom: true,
        shiftDragZoom: true,
        dragPan: true,
        pinchZoom: true,
      }),
      view: new View({
        center: fromLonLat([15.0, 62.0]), // Center of Sweden
        zoom: 6,
      }),
    });

    console.log('Map initialized');
    return this.map;
  }

  getMap(): Map | null {
    return this.map;
  }
}

// Export singleton instance
export const mapManager = new MapManager();
