import { writable } from 'svelte/store'
import type { Map3DStatus } from '../map/cesium-manager'

export type PanelView = 'datasets' | 'dataset-form' | 'bookmarks' | 'uploads' | null
export type Building3DMode = 'photogrammetry' | 'lod1'

export const activePanel = writable<PanelView>(null)
export const searchOpen = writable(false)
export const is3D = writable(false)
export const drawingActive = writable(false)
export const map3DStatus = writable<Map3DStatus>('ready')
export const building3DMode = writable<Building3DMode>('photogrammetry')

export function closeAllPanels() {
  activePanel.set(null)
  searchOpen.set(false)
}
