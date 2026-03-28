import { writable } from 'svelte/store'

export interface Layer {
  id: string
  name: string
  visible: boolean
  expanded: boolean
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
    id: crypto.randomUUID(),
    name,
    visible: true,
    expanded: false
  }])
}
