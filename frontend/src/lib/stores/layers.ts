import { writable, get } from 'svelte/store'
import type { LayerStyle } from '../map/layer-renderer'

let _idCounter = 0
function generateId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  return `layer-${++_idCounter}-${Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')}`
}

export interface Layer {
  id: string
  name: string
  visible: boolean
  expanded: boolean
  sourceId?: string
  mapLayerId?: string
  opacity: number
  style?: LayerStyle
  bounds?: [number, number, number, number]
}

export const layers = writable<Layer[]>([])

export function toggleLayerVisibility(id: string) {
  layers.update(ls => ls.map(l => l.id === id ? { ...l, visible: !l.visible } : l))
}

export function toggleLayerExpanded(id: string) {
  layers.update(ls => ls.map(l => l.id === id ? { ...l, expanded: !l.expanded } : l))
}

export function reorderLayers(fromIndex: number, toIndex: number) {
  layers.update(ls => {
    const updated = [...ls]
    const [moved] = updated.splice(fromIndex, 1)
    updated.splice(toIndex, 0, moved)
    return updated
  })
}

export function addLayer(name: string) {
  layers.update(ls => [...ls, {
    id: generateId(),
    name,
    visible: true,
    expanded: false,
    opacity: 1,
  }])
}

export interface AddLayerOptions {
  name: string
  sourceId: string
  mapLayerId: string
  style: LayerStyle
  opacity?: number
  bounds?: [number, number, number, number]
}

export function addLayerWithSource(options: AddLayerOptions) {
  layers.update(ls => [...ls, {
    id: generateId(),
    name: options.name,
    visible: true,
    expanded: false,
    sourceId: options.sourceId,
    mapLayerId: options.mapLayerId,
    opacity: options.opacity ?? 1,
    style: options.style,
    bounds: options.bounds,
  }])
}

export function setLayerOpacity(id: string, opacity: number) {
  layers.update(ls => ls.map(l => l.id === id ? { ...l, opacity } : l))
}

// -- Layer add requests (processed by MapView) --

export interface LayerAddRequest {
  name: string
  geojson: GeoJSON.FeatureCollection
  style: LayerStyle
  opacity: number
}

export const layerAddRequests = writable<LayerAddRequest[]>([])

export function requestAddGeoJsonLayer(request: LayerAddRequest) {
  layerAddRequests.update(rs => [...rs, request])
}

// -- Zoom to layer extent (processed by MapView) --

export const zoomToBoundsRequest = writable<[number, number, number, number] | null>(null)

export function zoomToLayer(id: string) {
  const $layers = get(layers)
  const layer = $layers.find(l => l.id === id)
  if (!layer?.bounds) return
  if (!layer.visible) toggleLayerVisibility(id)
  zoomToBoundsRequest.set(layer.bounds)
}
