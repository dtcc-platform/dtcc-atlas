import { writable, derived } from 'svelte/store'
import type { BoundingBox } from '../types'

export const bbox = writable<BoundingBox | null>(null)
export const bboxArea = derived(bbox, ($bbox) => {
  if (!$bbox) return 0
  const dx = $bbox.maxX - $bbox.minX
  const dy = $bbox.maxY - $bbox.minY
  return (dx * dy) / 1_000_000 // km²
})
