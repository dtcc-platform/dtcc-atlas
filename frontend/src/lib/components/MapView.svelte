<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import proj4 from 'proj4'
  import { mapManager } from '../map/map-manager'
  import {
    cesiumManager,
    type CesiumCameraState,
  } from '../map/cesium-manager'
  import {
    resolveQualityProfile,
    type LonLatBounds,
    type Map3DQuality,
  } from '../map/map3d-utils'
  import { parseTilesetAssetIds } from '../map/tiles3d-utils'
  import { BBoxDrawer } from '../map/bbox-drawer'
  import { registerProjections } from '../map/projections'
  import { bbox } from '../stores/map'
  import { datasets } from '../stores/datasets'
  import { activePanel, drawingActive, is3D, map3DStatus } from '../stores/ui'
  import { fetchDatasetList } from '../api/dataset-api'
  import type { BoundingBox } from '../types'

  type Persisted3DState = {
    aoiBounds?: LonLatBounds | null
    camera3D?: CesiumCameraState | null
    tilesAssetIds?: number[]
  }

  let mapContainer: HTMLDivElement
  let cesiumContainer: HTMLDivElement
  let drawer: BBoxDrawer | null = null
  let currentLonLatBbox: LonLatBounds | null = null
  let restored3DState: Persisted3DState | null = null
  let envTilesAssetIds: number[] = []

  function detectQualityProfile(): Map3DQuality {
    return resolveQualityProfile(window.innerWidth, navigator.maxTouchPoints)
  }

  function toLonLatBounds(value: BoundingBox): LonLatBounds {
    const [minLonRaw, minLatRaw] = proj4('EPSG:3006', 'EPSG:4326', [value.minX, value.minY]) as [number, number]
    const [maxLonRaw, maxLatRaw] = proj4('EPSG:3006', 'EPSG:4326', [value.maxX, value.maxY]) as [number, number]
    return {
      minLon: Math.min(minLonRaw, maxLonRaw),
      minLat: Math.min(minLatRaw, maxLatRaw),
      maxLon: Math.max(minLonRaw, maxLonRaw),
      maxLat: Math.max(minLatRaw, maxLatRaw),
    }
  }

  async function syncCesiumSelection(): Promise<void> {
    if (!$is3D || !cesiumContainer) return
    const quality = detectQualityProfile()
    const tilesAssetIds = restored3DState?.tilesAssetIds?.length
      ? restored3DState.tilesAssetIds
      : envTilesAssetIds

    try {
      await cesiumManager.initialize(cesiumContainer, {
        enabled: true,
        quality,
        aoiLock: {
          mode: 'soft',
          bounds: currentLonLatBbox ?? restored3DState?.aoiBounds ?? undefined,
          paddingFactor: 1.8,
        },
      })
      cesiumManager.setStatusListener((status) => map3DStatus.set(status))
      cesiumManager.setQualityProfile(quality)
      cesiumManager.setTilesetAssetIds(tilesAssetIds)

      if (currentLonLatBbox) {
        cesiumManager.setAoiLock(currentLonLatBbox, 1.8)
        await cesiumManager.focusBounds(currentLonLatBbox)
        await cesiumManager.loadTilesForAoi(currentLonLatBbox)
      } else if (restored3DState?.aoiBounds) {
        cesiumManager.setAoiLock(restored3DState.aoiBounds, 1.8)
        await cesiumManager.focusBounds(restored3DState.aoiBounds)
        await cesiumManager.loadTilesForAoi(restored3DState.aoiBounds)
        if (restored3DState.camera3D) {
          cesiumManager.restoreCameraState(restored3DState.camera3D)
          cesiumManager.maximizeZoom()
        }
        restored3DState = null
      } else {
        cesiumManager.clearSelection()
        cesiumManager.maximizeZoom()
      }
    } catch (error) {
      console.error('Failed to activate Cesium 3D mode:', error)
      map3DStatus.set('fatal_error')
      is3D.set(false)
    }
  }

  onMount(() => {
    registerProjections()
    envTilesAssetIds = parseTilesetAssetIds(import.meta.env.VITE_CESIUM_3DTILES_ASSET_IDS)
    const map = mapManager.initializeMap(mapContainer)

    drawer = new BBoxDrawer(map)
    drawer.onBBoxDrawn((drawnBbox: BoundingBox) => {
      bbox.set(drawnBbox)
      currentLonLatBbox = toLonLatBounds(drawnBbox)
      if (!$is3D) {
        is3D.set(true)
      } else {
        void syncCesiumSelection()
      }

      fetchDatasetList().then((list) => {
        datasets.set(list)
        activePanel.set('datasets')
      })
    })
  })

  $effect(() => {
    if (!drawer) return
    if ($drawingActive) {
      drawer.enableDrawing()
    } else {
      drawer.disableDrawing()
    }
  })

  $effect(() => {
    if ($is3D) {
      if ($drawingActive) {
        drawingActive.set(false)
      }
      void syncCesiumSelection()
      return
    }

    map3DStatus.set('ready')
    mapManager.getMap()?.resize()
  })

  onDestroy(() => {
    drawer?.clearBoundingBox()
    cesiumManager.setStatusListener(null)
    cesiumManager.destroy()
    mapManager.getMap()?.remove()
  })

  export function clearBbox() {
    drawer?.clearBoundingBox()
    bbox.set(null)
    currentLonLatBbox = null
    cesiumManager.clearSelection()
    cesiumManager.unloadTilesOutsideAoi(null)
    activePanel.set(null)
  }

  export function loadBbox(b: BoundingBox, label?: string) {
    drawer?.loadExtent(b, label)
    bbox.set(b)
    currentLonLatBbox = toLonLatBounds(b)
    if ($is3D) {
      void syncCesiumSelection()
    }
    fetchDatasetList().then((list) => {
      datasets.set(list)
      activePanel.set('datasets')
    })
  }

  export function toggle3D() {
    is3D.update((v) => !v)
  }

  export function flyTo(lon: number, lat: number) {
    mapManager.getMap()?.flyTo({ center: [lon, lat], zoom: 14 })
  }

  export function getMapState() {
    const map = mapManager.getMap()
    const state: {
      center?: [number, number]
      zoom?: number
      pitch?: number
      bearing?: number
      aoiBounds?: LonLatBounds | null
      camera3D?: CesiumCameraState | null
      tiles3D?: {
        activeAssetIds: number[]
      }
    } = {}

    if (map) {
      const center = map.getCenter()
      state.center = [center.lng, center.lat]
      state.zoom = map.getZoom()
      state.pitch = map.getPitch()
      state.bearing = map.getBearing()
    }

    if ($is3D) {
      state.aoiBounds = currentLonLatBbox
      state.camera3D = cesiumManager.getCameraState()
      state.tiles3D = { activeAssetIds: cesiumManager.getConfiguredTilesetIds() }
    } else {
      state.aoiBounds = currentLonLatBbox
      state.camera3D = null
      state.tiles3D = { activeAssetIds: envTilesAssetIds }
    }

    return state
  }

  export function setMapState(state: {
    center?: [number, number]
    zoom?: number
    pitch?: number
    bearing?: number
    is3D?: boolean
    aoiBounds?: LonLatBounds | null
    camera3D?: CesiumCameraState | null
    tiles3D?: {
      activeAssetIds: number[]
    } | null
  }) {
    const map = mapManager.getMap()
    if (map && state.center && state.zoom !== undefined) {
      map.jumpTo({
        center: state.center,
        zoom: state.zoom,
        pitch: state.pitch ?? 0,
        bearing: state.bearing ?? 0,
      })
    }
    currentLonLatBbox = state.aoiBounds ?? null
    restored3DState = {
      aoiBounds: state.aoiBounds ?? null,
      camera3D: state.camera3D ?? null,
      tilesAssetIds: state.tiles3D?.activeAssetIds ?? envTilesAssetIds,
    }
  }
</script>

<div bind:this={mapContainer} class="absolute inset-0" class:hidden={$is3D}></div>
<div bind:this={cesiumContainer} class="absolute inset-0" class:hidden={!$is3D}></div>

{#if $is3D}
  <div class="absolute right-4 top-4 z-30 rounded-md bg-black/60 px-2.5 py-1 text-[11px] font-medium text-white">
    {#if $map3DStatus === 'ready'}
      3D Ready
    {:else if $map3DStatus === 'terrain_fallback'}
      3D Terrain Fallback
    {:else if $map3DStatus === 'token_missing'}
      3D Token Missing
    {:else if $map3DStatus === 'imagery_error'}
      3D Imagery Error
    {:else if $map3DStatus === 'tiles_loading'}
      3D Tiles Loading
    {:else if $map3DStatus === 'tiles_ready'}
      3D Tiles Ready
    {:else if $map3DStatus === 'tiles_error'}
      3D Tiles Error (Terrain Fallback)
    {:else}
      3D Error
    {/if}
  </div>
{/if}

<div id="bbox-tooltip" class="hidden fixed pointer-events-none text-white text-xs px-2 py-1 rounded z-50" style="background: color-mix(in srgb, var(--color-dtcc-navy) 95%, transparent);"></div>
