import { writable } from 'svelte/store'

export type PanelView = 'datasets' | 'dataset-form' | 'bookmarks' | 'uploads' | 'layers' | 'downloads' | null

export const activePanel = writable<PanelView>(null)
export const searchOpen = writable(false)
export const is3D = writable(false)
export const drawingActive = writable(false)

// Notification dot counts -- 0 means no unseen content
export const unseenBookmarks = writable(0)
// TODO: unseenDatasets currently has no trigger. It should fire when new DTCC Core
// or simulation datasets are added to the browsing catalogue, not on job completion.
export const unseenDatasets = writable(0)
export const unseenLayers = writable(0)
export const unseenDownloads = writable(0)

export function closeAllPanels() {
  activePanel.set(null)
  searchOpen.set(false)
}
