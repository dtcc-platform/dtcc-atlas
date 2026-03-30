import maplibregl from 'maplibre-gl'

export interface LayerStyle {
  type: 'fill' | 'line' | 'circle'
  paint: Record<string, unknown>
}

export class LayerRenderer {
  private map: maplibregl.Map
  private managedLayers: Set<string> = new Set()

  constructor(map: maplibregl.Map) {
    this.map = map
  }

  addLayer(
    sourceId: string,
    mapLayerId: string,
    geojson: GeoJSON.FeatureCollection,
    style: LayerStyle
  ): void {
    if (!this.map.getSource(sourceId)) {
      this.map.addSource(sourceId, {
        type: 'geojson',
        data: geojson,
      })
    }

    if (!this.map.getLayer(mapLayerId)) {
      // Build the layer spec dynamically -- cast through unknown to satisfy
      // MapLibre's discriminated union (FillLayerSpecification | LineLayerSpecification | ...)
      const spec = {
        id: mapLayerId,
        type: style.type,
        source: sourceId,
        paint: style.paint,
      } as unknown as maplibregl.LayerSpecification
      this.map.addLayer(spec)
      this.managedLayers.add(mapLayerId)
    }
  }

  setVisibility(mapLayerId: string, visible: boolean): void {
    if (!this.map.getLayer(mapLayerId)) return
    this.map.setLayoutProperty(
      mapLayerId,
      'visibility',
      visible ? 'visible' : 'none'
    )
  }

  setOpacity(mapLayerId: string, layerType: string, opacity: number): void {
    if (!this.map.getLayer(mapLayerId)) return

    const propMap: Record<string, string> = {
      fill: 'fill-opacity',
      line: 'line-opacity',
      circle: 'circle-opacity',
    }
    const prop = propMap[layerType]
    if (prop) {
      this.map.setPaintProperty(mapLayerId, prop, opacity)
    }
  }

  removeLayer(sourceId: string, mapLayerId: string): void {
    if (this.map.getLayer(mapLayerId)) {
      this.map.removeLayer(mapLayerId)
      this.managedLayers.delete(mapLayerId)
    }
    if (this.map.getSource(sourceId)) {
      this.map.removeSource(sourceId)
    }
  }
}
