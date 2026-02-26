import { writable } from 'svelte/store'

export type PanelView = 'datasets' | 'dataset-form' | 'bookmarks' | 'uploads' | null

export const activePanel = writable<PanelView>(null)
export const searchOpen = writable(false)
export const is3D = writable(false)
export const drawingActive = writable(false)

export function closeAllPanels() {
  activePanel.set(null)
  searchOpen.set(false)
}
