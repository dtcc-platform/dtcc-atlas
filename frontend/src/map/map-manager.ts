import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import OSM from 'ol/source/OSM';
import { fromLonLat } from 'ol/proj';
import { defaults as defaultInteractions } from 'ol/interaction/defaults';

export class MapManager {
  private map: Map | null = null;

  initializeMap(targetId: string): Map {
    // Create OpenStreetMap tile layer
    const osmLayer = new TileLayer({
      source: new OSM(),
    });

    // Create map centered on Sweden with explicit default interactions
    // This ensures zoom (mouse wheel, double-click) and pan work even when Extent interaction is active
    this.map = new Map({
      target: targetId,
      layers: [osmLayer],
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
