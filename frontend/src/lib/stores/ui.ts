import { writable } from 'svelte/store'

export type PanelView = 'datasets' | 'dataset-form' | 'bookmarks' | 'uploads' | 'layers' | 'downloads' | 'simulations' | null

export const activePanel = writable<PanelView>(null)
export const collapsedPanels = writable<Record<string, boolean>>({})
export const searchOpen = writable(false)
export const is3D = writable(false)
export const drawingActive = writable(false)
export const aoiNotificationShown = writable(false)

// Notification dot counts -- 0 means no unseen content
export const unseenBookmarks = writable(0)
// TODO: unseenDatasets currently has no trigger. It should fire when new DTCC Core
// or simulation datasets are added to the browsing catalogue, not on job completion.
export const unseenDatasets = writable(0)
export const unseenLayers = writable(0)
export const unseenDownloads = writable(0)
export const unseenSimulations = writable(0)

// Side navigation panel state
export const sideNavOpen = writable(false)

// Toolbar hover state — true while ToolbarV3 is expanded
export const toolbarHovered = writable(false)

// Layers panel — independent from activePanel so other panels don't close it
export const layersOpen = writable(false)

// Toolbar version — 'v1' = compact, 'expanded' = always expanded, 'v3' = hover-to-expand
export const toolbarVersion = writable<'v1' | 'expanded' | 'v3'>('v3')

export function closeAllPanels() {
  activePanel.set(null)
  searchOpen.set(false)
  sideNavOpen.set(false)
}

export function setPanelCollapsed(panelId: string, collapsed: boolean) {
  collapsedPanels.update((state) => ({ ...state, [panelId]: collapsed }))
}

export function togglePanelCollapsed(panelId: string) {
  collapsedPanels.update((state) => ({ ...state, [panelId]: !state[panelId] }))
}
