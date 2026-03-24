import { writable } from 'svelte/store'

export type PanelView = 'datasets' | 'dataset-form' | 'bookmarks' | 'uploads' | 'layers' | 'downloads' | null

export const activePanel = writable<PanelView>(null)
export const searchOpen = writable(false)
export const is3D = writable(false)
export const drawingActive = writable(false)

// Notification dot flags -- true means unseen content exists
export const hasUnseenBookmarks = writable(false)
export const hasUnseenDatasets = writable(false)
export const hasUnseenLayers = writable(false)

export function closeAllPanels() {
  activePanel.set(null)
  searchOpen.set(false)
}
