<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { mapManager } from '../map/map-manager'
  import { BBoxDrawer } from '../map/bbox-drawer'
  import { LayerRenderer } from '../map/layer-renderer'
  import { registerProjections, transformCoordinates } from '../map/projections'
  import { bbox } from '../stores/map'
  import { datasets } from '../stores/datasets'
  import { layers, addLayerWithSource, layerAddRequests, zoomToBoundsRequest } from '../stores/layers'
  import { computeBounds } from '../map/geojson-utils'
  import { activePanel, drawingActive } from '../stores/ui'
  import { fetchDatasetList } from '../api/dataset-api'
  import type { BoundingBox } from '../types'

  let _sourceCounter = 0
  let mapContainer: HTMLDivElement
  let drawer: BBoxDrawer | null = null
  let renderer: LayerRenderer | null = null
  let unsubscribeLayers: (() => void) | null = null
  let unsubscribeAddRequests: (() => void) | null = null
  let unsubscribeZoom: (() => void) | null = null

  onMount(() => {
    registerProjections()
    const map = mapManager.initializeMap(mapContainer)

    drawer = new BBoxDrawer(map)
    drawer.onBBoxDrawn((drawnBbox: BoundingBox) => {
      bbox.set(drawnBbox)

      // Auto-fetch datasets and open panel
      fetchDatasetList().then((list) => {
        datasets.set(list)
        activePanel.set('datasets')
      })
    })

    // Layer rendering setup (after map load)
    const setupLayerHandling = () => {
      renderer = new LayerRenderer(map)

      // Subscribe to layers store for visibility/opacity sync
      unsubscribeLayers = layers.subscribe(($layers) => {
        if (!renderer) return
        for (const layer of $layers) {
          if (!layer.mapLayerId || !layer.style) continue
          renderer.setVisibility(layer.mapLayerId, layer.visible)
          renderer.setOpacity(layer.mapLayerId, layer.style.type, layer.opacity)
        }
      })

      // Subscribe to layer-add requests from upload wizard
      unsubscribeAddRequests = layerAddRequests.subscribe(($requests) => {
        if (!renderer || $requests.length === 0) return
        for (const req of $requests) {
          _sourceCounter++
          const sourceId = `user-geojson-${_sourceCounter}-src`
          const mapLayerId = `user-geojson-${_sourceCounter}`
          try {
            renderer.addLayer(sourceId, mapLayerId, req.geojson, req.style)
            addLayerWithSource({
              name: req.name,
              sourceId,
              mapLayerId,
              style: req.style,
              opacity: req.opacity,
              bounds: computeBounds(req.geojson) ?? undefined,
            })
          } catch (err) {
            console.warn(`Failed to add layer "${req.name}":`, err)
          }
        }
        queueMicrotask(() => layerAddRequests.set([]))
      })

      // Subscribe to zoom-to-layer requests
      unsubscribeZoom = zoomToBoundsRequest.subscribe((bounds) => {
        if (!bounds) return
        map.fitBounds(bounds, { padding: 50, animate: true, duration: 800 })
        queueMicrotask(() => zoomToBoundsRequest.set(null))
      })
    }

    if (map.loaded()) {
      setupLayerHandling()
    } else {
      map.on('load', setupLayerHandling)
    }
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
    unsubscribeLayers?.()
    unsubscribeAddRequests?.()
    unsubscribeZoom?.()
    renderer = null
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

  export function fitBounds(b: BoundingBox) {
    const sw = transformCoordinates([b.minX, b.minY], 'EPSG:3006', 'EPSG:4326')
    const ne = transformCoordinates([b.maxX, b.maxY], 'EPSG:3006', 'EPSG:4326')
    mapManager.getMap()?.fitBounds([sw, ne], { padding: 50, animate: true })
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
