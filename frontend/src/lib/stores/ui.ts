import { writable } from 'svelte/store'
import type { Map3DStatus } from '../map/cesium-manager'

export type PanelView = 'datasets' | 'dataset-form' | 'bookmarks' | 'uploads' | null

export const activePanel = writable<PanelView>(null)
export const searchOpen = writable(false)
export const is3D = writable(false)
export const drawingActive = writable(false)
export const map3DStatus = writable<Map3DStatus>('ready')

export function closeAllPanels() {
  activePanel.set(null)
  searchOpen.set(false)
}
