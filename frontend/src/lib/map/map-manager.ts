import maplibregl from 'maplibre-gl';

export class MapManager {
  private map: maplibregl.Map | null = null;
  private is3D: boolean = false;

  private skyConfig: maplibregl.SkySpecification = {
    "sky-color": "#68a0f9",
    "horizon-color": "#f8fbff",
    "sky-horizon-blend": 0.85,
    "fog-color": "#999ba2",
    "horizon-fog-blend": 0.6,
    "fog-ground-blend": 0.15
  };

  initializeMap(container: string | HTMLElement): maplibregl.Map {
    this.map = new maplibregl.Map({
      container,
      style: {
        version: 8,
        sources: {
          'carto-light': {
            type: 'raster',
            tiles: [
              'https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png',
              'https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png',
              'https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png',
              'https://d.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png',
            ],
            tileSize: 256,
            attribution:
              '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> ' +
              '&copy; <a href="https://carto.com/attributions">CARTO</a>',
          },
        },
        layers: [
          {
            id: 'carto-light-layer',
            type: 'raster',
            source: 'carto-light',
            minzoom: 0,
            maxzoom: 22,
          },
        ],
      },
      center: [15.0, 62.0],
      zoom: 5,
    });

    // Add navigation controls
    this.map.addControl(new maplibregl.NavigationControl(), 'top-right');

    console.log('Map initialized');
    return this.map;
  }

  getMap(): maplibregl.Map | null {
    return this.map;
  }

  toggle3DView(): boolean {
    if (!this.map) return false;

    this.is3D = !this.is3D;

    if (this.is3D) {
      this.map.easeTo({ pitch: 60, bearing: -60, duration: 500 });
      this.map.setSky(this.skyConfig);
    } else {
      this.map.easeTo({ pitch: 0, bearing: 0, duration: 500 });
      this.map.setSky({});
    }

    return this.is3D;
  }

  is3DView(): boolean {
    return this.is3D;
  }
}

// Export singleton instance
export const mapManager = new MapManager();
