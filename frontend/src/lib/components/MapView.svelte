<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { mapManager } from '../map/map-manager'
  import { BBoxDrawer } from '../map/bbox-drawer'
  import { registerProjections } from '../map/projections'
  import { bbox } from '../stores/map'
  import { datasets } from '../stores/datasets'
  import { activePanel, drawingActive } from '../stores/ui'
  import { fetchDatasetList } from '../api/dataset-api'
  import type { BoundingBox } from '../types'

  let mapContainer: HTMLDivElement
  let drawer: BBoxDrawer | null = null

  onMount(() => {
    registerProjections()
    const map = mapManager.initializeMap(mapContainer)

    drawer = new BBoxDrawer(map)
    drawer.onBBoxDrawn((drawnBbox: BoundingBox) => {
      bbox.set(drawnBbox)
      drawingActive.set(false)

      // Auto-fetch datasets and open panel
      fetchDatasetList().then((list) => {
        datasets.set(list)
        activePanel.set('datasets')
      })
    })
  })

  // React to drawingActive store changes
  $effect(() => {
    if (!drawer) return
    if ($drawingActive) {
      drawer.enableDrawing()
    } else {
      drawer.disableDrawing()
    }
  })

  onDestroy(() => {
    drawer?.clearBoundingBox()
    mapManager.getMap()?.remove()
  })

  export function clearBbox() {
    drawer?.clearBoundingBox()
    bbox.set(null)
    activePanel.set(null)
  }

  export function loadBbox(b: BoundingBox, label?: string) {
    drawer?.loadExtent(b, label)
    bbox.set(b)
    fetchDatasetList().then((list) => {
      datasets.set(list)
      activePanel.set('datasets')
    })
  }

  export function toggle3D() {
    mapManager.toggle3DView()
  }

  export function flyTo(lon: number, lat: number) {
    mapManager.getMap()?.flyTo({ center: [lon, lat], zoom: 14 })
  }

  export function getMapState() {
    const map = mapManager.getMap()
    if (!map) return null
    const center = map.getCenter()
    return {
      center: [center.lng, center.lat] as [number, number],
      zoom: map.getZoom(),
      pitch: map.getPitch(),
      bearing: map.getBearing(),
    }
  }

  export function setMapState(state: { center?: [number, number]; zoom?: number; pitch?: number; bearing?: number }) {
    const map = mapManager.getMap()
    if (!map || !state.center || state.zoom === undefined) return
    map.jumpTo({
      center: state.center,
      zoom: state.zoom,
      pitch: state.pitch ?? 0,
      bearing: state.bearing ?? 0,
    })
  }
</script>

<div bind:this={mapContainer} class="absolute inset-0"></div>
<div id="bbox-tooltip" class="hidden fixed pointer-events-none text-white text-xs px-2 py-1 rounded z-50" style="background: color-mix(in srgb, var(--color-dtcc-navy) 95%, transparent);"></div>
