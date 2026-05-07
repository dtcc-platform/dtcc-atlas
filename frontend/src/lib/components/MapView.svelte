<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { get } from 'svelte/store'
  import { mapManager } from '../map/map-manager'
  import { BBoxDrawer } from '../map/bbox-drawer'
  import { LayerRenderer } from '../map/layer-renderer'
  import { registerProjections, transformCoordinates } from '../map/projections'
  import { bbox } from '../stores/map'
  import { datasets } from '../stores/datasets'
  import { layers, addLayerWithSource, layerAddRequests, layerRemoveRequests, zoomToBoundsRequest } from '../stores/layers'
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
  let unsubscribeRemoveRequests: (() => void) | null = null
  let unsubscribeZoom: (() => void) | null = null

  onMount(() => {
    registerProjections()
    const map = mapManager.initializeMap(mapContainer)

    drawer = new BBoxDrawer(map)
    drawer.onBBoxDrawn((drawnBbox: BoundingBox) => {
      bbox.set(drawnBbox)

      // Auto-fetch datasets and open panel, but stay in bookmarks if it's already open
      fetchDatasetList().then((list) => {
        datasets.set(list)
        if (get(activePanel) !== 'bookmarks') {
          activePanel.set('datasets')
        }
      })
    })

    // Layer rendering setup (after map load)
    const setupLayerHandling = () => {
      renderer = new LayerRenderer(map)

      // Subscribe to layers store for visibility/opacity/order sync
      unsubscribeLayers = layers.subscribe(($layers) => {
        if (!renderer) return
        for (const layer of $layers) {
          if (!layer.mapLayerId || !layer.style) continue
          renderer.setVisibility(layer.mapLayerId, layer.visible)
          renderer.setOpacity(layer.mapLayerId, layer.style.type, layer.opacity)
        }
        const orderedIds = $layers.filter(l => l.mapLayerId).map(l => l.mapLayerId!)
        renderer.syncOrder(orderedIds)
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

      // Subscribe to layer-remove requests
      unsubscribeRemoveRequests = layerRemoveRequests.subscribe(($requests) => {
        if (!renderer || $requests.length === 0) return
        for (const req of $requests) {
          try {
            renderer.removeLayer(req.sourceId, req.mapLayerId)
          } catch (err) {
            console.warn(`Failed to remove layer "${req.mapLayerId}":`, err)
          }
        }
        queueMicrotask(() => layerRemoveRequests.set([]))
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
    } else if (drawer.hasSelection()) {
      // Completed draw exists -- just disable draw mode, keep the bbox visual
      drawer.disableDrawing()
    } else {
      // No completed draw (user aborted) -- clear any partial visual
      drawer.clearBoundingBox()
    }
  })

  onDestroy(() => {
    unsubscribeLayers?.()
    unsubscribeAddRequests?.()
    unsubscribeRemoveRequests?.()
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

  function readCSSPx(varName: string): number {
    const el = document.createElement('div')
    el.style.cssText = `position:fixed;visibility:hidden;pointer-events:none;height:var(${varName});width:0`
    document.body.appendChild(el)
    const px = el.getBoundingClientRect().height
    document.body.removeChild(el)
    return px
  }

  export function fitBounds(b: BoundingBox) {
    const sw = transformCoordinates([b.minX, b.minY], 'EPSG:3006', 'EPSG:4326')
    const ne = transformCoordinates([b.maxX, b.maxY], 'EPSG:3006', 'EPSG:4326')
    mapManager.getMap()?.fitBounds([sw, ne], {
      padding: { top: readCSSPx('--atlas-edge-gap'), bottom: readCSSPx('--atlas-layout-bottom-reserve'), left: 50, right: 50 },
      animate: true
    })
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
