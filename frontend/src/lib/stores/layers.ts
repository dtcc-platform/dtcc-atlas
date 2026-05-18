import { writable, derived, get } from 'svelte/store'
import type { LayerStyle } from '../map/layer-renderer'

let _idCounter = 0

function generateId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  return `layer-${++_idCounter}-${Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')}`
}

function generateVersionId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  return `ver-${Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')}`
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

export interface Version {
  id: string
  name: string
  layers: Layer[]
}

// -- Version stores --

const _initId = generateVersionId()

export const versions = writable<Version[]>([{ id: _initId, name: 'Version 1', layers: [] }])
export const currentVersionId = writable<string>(_initId)

// Current version's layers — used by LayersPanel and all layer mutations
export const layers = derived(
  [versions, currentVersionId],
  ([$vs, $cvId]) => $vs.find(v => v.id === $cvId)?.layers ?? []
)

// All versions' layers with inactive versions forced to visible=false.
// MapView subscribes to this for visibility/opacity sync so switching versions
// correctly hides the outgoing version's map layers without removing them.
export const allLayersForMap = derived(
  [versions, currentVersionId],
  ([$vs, $cvId]) => $vs.flatMap(v =>
    v.layers.map(l => v.id === $cvId ? l : { ...l, visible: false })
  )
)

// -- Internal helper: mutate only the current version's layer list --

function updateCurrentLayers(fn: (ls: Layer[]) => Layer[]) {
  const cvId = get(currentVersionId)
  versions.update(vs => vs.map(v => v.id !== cvId ? v : { ...v, layers: fn(v.layers) }))
}

// -- Layer mutations (public API unchanged from before versioning) --

export function toggleLayerVisibility(id: string) {
  updateCurrentLayers(ls => ls.map(l => l.id === id ? { ...l, visible: !l.visible } : l))
}

export function toggleLayerExpanded(id: string) {
  updateCurrentLayers(ls => ls.map(l => l.id === id ? { ...l, expanded: !l.expanded } : l))
}

export function reorderLayers(fromIndex: number, toIndex: number) {
  updateCurrentLayers(ls => {
    const updated = [...ls]
    const [moved] = updated.splice(fromIndex, 1)
    updated.splice(toIndex, 0, moved)
    return updated
  })
}

export function addLayer(name: string) {
  updateCurrentLayers(ls => [...ls, { id: generateId(), name, visible: true, expanded: false, opacity: 1 }])
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
  updateCurrentLayers(ls => [...ls, {
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
  updateCurrentLayers(ls => ls.map(l => l.id === id ? { ...l, opacity } : l))
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

// -- Remove layer (map cleanup processed by MapView) --

export interface LayerRemoveRequest {
  sourceId: string
  mapLayerId: string
}

export const layerRemoveRequests = writable<LayerRemoveRequest[]>([])

export function removeLayer(id: string) {
  const cvId = get(currentVersionId)
  const layer = get(versions).find(v => v.id === cvId)?.layers.find(l => l.id === id)
  if (!layer) return
  updateCurrentLayers(ls => ls.filter(l => l.id !== id))
  if (layer.sourceId && layer.mapLayerId) {
    layerRemoveRequests.update(rs => [...rs, { sourceId: layer.sourceId!, mapLayerId: layer.mapLayerId! }])
  }
}

// -- Zoom to layer extent (processed by MapView) --

export const zoomToBoundsRequest = writable<[number, number, number, number] | null>(null)

export function zoomToLayer(id: string) {
  const cvId = get(currentVersionId)
  const layer = get(versions).find(v => v.id === cvId)?.layers.find(l => l.id === id)
  if (!layer?.bounds) return
  if (!layer.visible) toggleLayerVisibility(id)
  zoomToBoundsRequest.set(layer.bounds)
}

// -- Version management --

export function addVersion() {
  const n = get(versions).length + 1
  const v: Version = { id: generateVersionId(), name: `Version ${n}`, layers: [] }
  versions.update(vs => [...vs, v])
  currentVersionId.set(v.id)
}

export function switchVersion(id: string) {
  currentVersionId.set(id)
}

export function renameVersion(id: string, name: string) {
  versions.update(vs => vs.map(v => v.id === id ? { ...v, name: name.trim() || v.name } : v))
}

export function duplicateVersion(id: string) {
  const $vs = get(versions)
  const src = $vs.find(v => v.id === id)
  if (!src) return
  // Layers share mapLayerId/sourceId with the original (shallow copy referencing the same Mapbox source).
  // Opacity, visibility, and order are stored independently per version.
  const copy: Version = {
    id: generateVersionId(),
    name: `${src.name} (copy)`,
    layers: src.layers.map(l => ({ ...l, id: generateId() })),
  }
  const idx = $vs.findIndex(v => v.id === id)
  versions.update(vs => [...vs.slice(0, idx + 1), copy, ...vs.slice(idx + 1)])
  currentVersionId.set(copy.id)
}

export function deleteVersion(id: string) {
  const $vs = get(versions)
  const idx = $vs.findIndex(v => v.id === id)
  if (idx === -1) return

  // Only emit remove requests for Mapbox layers not shared with another version.
  const otherMapLayerIds = new Set(
    $vs.filter((_, i) => i !== idx).flatMap(v => v.layers.map(l => l.mapLayerId).filter(Boolean))
  )
  for (const layer of $vs[idx].layers) {
    if (layer.sourceId && layer.mapLayerId && !otherMapLayerIds.has(layer.mapLayerId)) {
      layerRemoveRequests.update(rs => [...rs, { sourceId: layer.sourceId!, mapLayerId: layer.mapLayerId! }])
    }
  }

  if ($vs.length === 1) {
    const fresh: Version = { id: generateVersionId(), name: 'Version 1', layers: [] }
    versions.set([fresh])
    currentVersionId.set(fresh.id)
    return
  }

  const newVs = $vs.filter(v => v.id !== id)
  versions.set(newVs)

  if (get(currentVersionId) === id) {
    currentVersionId.set(idx > 0 ? newVs[idx - 1].id : newVs[0].id)
  }
}
