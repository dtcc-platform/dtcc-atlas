import { writable } from 'svelte/store'
import type { Map3DStatus } from '../map/cesium-manager'

export type PanelView = 'datasets' | 'dataset-form' | 'bookmarks' | 'uploads' | null
export type Building3DMode = 'photogrammetry' | 'lod1'
export type GeoJsonLayerStatus = 'idle' | 'loading' | 'ready' | 'error'

export const activePanel = writable<PanelView>(null)
export const searchOpen = writable(false)
export const is3D = writable(false)
export const drawingActive = writable(false)
export const map3DStatus = writable<Map3DStatus>('ready')
export const building3DMode = writable<Building3DMode>('photogrammetry')
export const enabledGeoJsonLayers = writable<string[]>([])
export const geoJsonLayerStatusByDataset = writable<Record<string, GeoJsonLayerStatus>>({})
export const geoJsonLayerErrors = writable<Record<string, string | undefined>>({})

export function enableGeoJsonLayer(datasetName: string) {
  enabledGeoJsonLayers.update((names) =>
    names.includes(datasetName) ? names : [...names, datasetName],
  )
}

export function disableGeoJsonLayer(datasetName: string) {
  enabledGeoJsonLayers.update((names) => names.filter((name) => name !== datasetName))
}

export function setGeoJsonLayerStatus(datasetName: string, status: GeoJsonLayerStatus) {
  geoJsonLayerStatusByDataset.update((entries) => ({ ...entries, [datasetName]: status }))
}

export function setGeoJsonLayerError(datasetName: string, message?: string) {
  geoJsonLayerErrors.update((entries) => ({ ...entries, [datasetName]: message }))
}

export function closeAllPanels() {
  activePanel.set(null)
  searchOpen.set(false)
}
