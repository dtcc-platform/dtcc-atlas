import type { LayerStyle } from './layer-renderer'

const LAYER_COLORS = [
  '#E35A1D', // dtcc-orange
  '#1a9850', // green
  '#4575b4', // blue
  '#d73027', // red
  '#b8860b', // dark goldenrod (visible on light basemaps)
  '#762a83', // purple
]

function colorForName(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0
  }
  return LAYER_COLORS[Math.abs(hash) % LAYER_COLORS.length]
}

type GeomKind = 'polygon' | 'line' | 'point' | 'unknown'

// Returns the geometry kind of the first feature with a recognized type.
// Mixed-geometry collections are classified by whichever geometry appears first.
export function detectGeometryKind(geojson: GeoJSON.FeatureCollection): GeomKind {
  for (const feature of geojson.features) {
    const type = feature.geometry?.type
    if (type === 'Polygon' || type === 'MultiPolygon') return 'polygon'
    if (type === 'LineString' || type === 'MultiLineString') return 'line'
    if (type === 'Point' || type === 'MultiPoint') return 'point'
  }
  return 'unknown'
}

export function defaultStyleForGeometry(kind: GeomKind, name = ''): { style: LayerStyle; opacity: number } {
  const color = colorForName(name)

  switch (kind) {
    case 'polygon':
      return {
        style: {
          type: 'fill',
          paint: {
            'fill-color': color,
            'fill-opacity': 0.5,
            'fill-outline-color': '#333333',
          },
        },
        opacity: 0.5,
      }
    case 'line':
      return {
        style: {
          type: 'line',
          paint: {
            'line-color': color,
            'line-width': 3,
            'line-opacity': 0.8,
          },
        },
        opacity: 0.8,
      }
    case 'point':
      return {
        style: {
          type: 'circle',
          paint: {
            'circle-color': color,
            'circle-radius': 5,
            'circle-opacity': 0.8,
          },
        },
        opacity: 0.8,
      }
    default:
      return {
        style: {
          type: 'fill',
          paint: {
            'fill-color': color,
            'fill-opacity': 0.5,
            'fill-outline-color': '#333333',
          },
        },
        opacity: 0.5,
      }
  }
}

export interface SplitLayer {
  name: string
  geojson: GeoJSON.FeatureCollection
}

export function splitByLayerType(baseName: string, geojson: GeoJSON.FeatureCollection): SplitLayer[] {
  const grouped = new Map<string, GeoJSON.Feature[]>()
  const untyped: GeoJSON.Feature[] = []

  for (const feature of geojson.features) {
    const layerType = (feature.properties as Record<string, unknown>)?.layer_type as string | undefined
    if (layerType) {
      if (!grouped.has(layerType)) grouped.set(layerType, [])
      grouped.get(layerType)!.push(feature)
    } else {
      untyped.push(feature)
    }
  }

  if (grouped.size <= 1) {
    return [{ name: baseName, geojson }]
  }

  const result: SplitLayer[] = []
  for (const [layerType, features] of grouped) {
    const displayName = layerType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    result.push({
      name: displayName,
      geojson: { type: 'FeatureCollection', features },
    })
  }
  if (untyped.length > 0) {
    result.push({
      name: `${baseName} (Other)`,
      geojson: { type: 'FeatureCollection', features: untyped },
    })
  }
  return result
}

// Validates FeatureCollection structure; individual features may lack geometry
// (visitCoords and detectGeometryKind handle null geometry gracefully).
export function readFileAsGeoJson(file: File): Promise<GeoJSON.FeatureCollection> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result as string)
        if (parsed.type !== 'FeatureCollection' || !Array.isArray(parsed.features)) {
          reject(new Error('File is not a valid GeoJSON FeatureCollection'))
          return
        }
        resolve(parsed as GeoJSON.FeatureCollection)
      } catch {
        reject(new Error('Failed to parse GeoJSON'))
      }
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsText(file)
  })
}

function visitCoords(geometry: GeoJSON.Geometry, fn: (lng: number, lat: number) => void): void {
  if (!geometry) return
  switch (geometry.type) {
    case 'Point':
      fn(geometry.coordinates[0], geometry.coordinates[1])
      break
    case 'MultiPoint':
    case 'LineString':
      for (const c of geometry.coordinates) fn(c[0], c[1])
      break
    case 'MultiLineString':
    case 'Polygon':
      for (const ring of geometry.coordinates) for (const c of ring) fn(c[0], c[1])
      break
    case 'MultiPolygon':
      for (const poly of geometry.coordinates) for (const ring of poly) for (const c of ring) fn(c[0], c[1])
      break
    case 'GeometryCollection':
      for (const g of geometry.geometries) visitCoords(g, fn)
      break
  }
}

export function computeBounds(geojson: GeoJSON.FeatureCollection): [number, number, number, number] | null {
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity
  for (const feature of geojson.features) {
    visitCoords(feature.geometry, (lng, lat) => {
      if (lng < minLng) minLng = lng
      if (lat < minLat) minLat = lat
      if (lng > maxLng) maxLng = lng
      if (lat > maxLat) maxLat = lat
    })
  }
  if (!isFinite(minLng)) return null
  return [minLng, minLat, maxLng, maxLat]
}
