<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import proj4 from 'proj4'
  import { mapManager } from '../map/map-manager'
  import {
    cesiumManager,
    type Building3DMode as CesiumBuilding3DMode,
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
  import { activePanel, building3DMode, drawingActive, is3D, map3DStatus, type Building3DMode } from '../stores/ui'
  import { fetchDatasetList } from '../api/dataset-api'
  import type { BoundingBox } from '../types'

  type Persisted3DState = {
    aoiBounds?: LonLatBounds | null
    camera3D?: CesiumCameraState | null
    tilesAssetIds?: number[]
    buildingMode?: Building3DMode
  }

  type BuildingTilesByMode = {
    photogrammetry: number[]
    lod1: number[]
  }

  let mapContainer: HTMLDivElement
  let cesiumContainer: HTMLDivElement
  let drawer: BBoxDrawer | null = null
  let currentLonLatBbox: LonLatBounds | null = null
  let restored3DState: Persisted3DState | null = null
  let was3D = false
  let lastBuildingMode: Building3DMode = 'photogrammetry'
  let envTilesByMode = $state<BuildingTilesByMode>({ photogrammetry: [], lod1: [] })

  function resolveEnvTilesByMode(): BuildingTilesByMode {
    const photogrammetry = parseTilesetAssetIds(import.meta.env.VITE_CESIUM_3DTILES_ASSET_ID_PHOTOGRAMMETRY)
    const lod1Buildings = parseTilesetAssetIds(import.meta.env.VITE_CESIUM_3DTILES_ASSET_ID_LOD1)
    const lod1Ground = parseTilesetAssetIds(import.meta.env.VITE_CESIUM_3DTILES_ASSET_ID_LOD1_GROUND)
    return {
      photogrammetry,
      lod1: Array.from(new Set([...lod1Buildings, ...lod1Ground])),
    }
  }

  function getTilesForMode(mode: Building3DMode): number[] {
    return envTilesByMode[mode]
  }

  function resolveAvailableMode(mode: Building3DMode): Building3DMode {
    if (getTilesForMode(mode).length > 0) return mode
    const fallback: Building3DMode = mode === 'photogrammetry' ? 'lod1' : 'photogrammetry'
    return getTilesForMode(fallback).length > 0 ? fallback : mode
  }

  const buildingModeLabel: Record<Building3DMode, string> = {
    photogrammetry: 'Photogrammetry',
    lod1: 'LoD1',
  }

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

  function resolveModeAndTiles(
    preferredMode: Building3DMode,
    fallbackTiles: number[] = [],
  ): { mode: Building3DMode; tilesAssetIds: number[] } {
    const mode = resolveAvailableMode(preferredMode)
    if (mode !== $building3DMode) {
      building3DMode.set(mode)
    }
    const modeTiles = getTilesForMode(mode)
    return {
      mode,
      tilesAssetIds: modeTiles.length > 0 ? modeTiles : fallbackTiles.slice(0, 1),
    }
  }

  async function ensureCesiumReadyFor3D(
    aoiBounds: LonLatBounds | null,
    quality: Map3DQuality,
    buildingMode: Building3DMode,
    applyAoiLock: boolean,
  ): Promise<void> {
    if (!cesiumContainer) return

    await cesiumManager.initialize(cesiumContainer, {
      enabled: true,
      quality,
      aoiLock: {
        mode: 'soft',
        bounds: aoiBounds ?? undefined,
        paddingFactor: 1.8,
      },
    })
    cesiumManager.setStatusListener((status) => map3DStatus.set(status))
    cesiumManager.setQualityProfile(quality)
    cesiumManager.setBuildingMode(buildingMode as CesiumBuilding3DMode)
    if (applyAoiLock) {
      cesiumManager.setAoiLock(aoiBounds, 1.8)
    }
  }

  async function syncCesiumOnEnter3D(): Promise<void> {
    if (!$is3D || !cesiumContainer) return

    const quality = detectQualityProfile()
    const preferredMode = restored3DState?.buildingMode ?? $building3DMode
    const { mode, tilesAssetIds } = resolveModeAndTiles(
      preferredMode,
      restored3DState?.tilesAssetIds ?? [],
    )
    const aoiBounds = currentLonLatBbox ?? restored3DState?.aoiBounds ?? null

    try {
      await ensureCesiumReadyFor3D(aoiBounds, quality, mode, true)
      cesiumManager.setTilesetAssetIds(tilesAssetIds)

      if (currentLonLatBbox) {
        await cesiumManager.focusBounds(currentLonLatBbox)
        await cesiumManager.loadTilesForAoi(currentLonLatBbox)
      } else if (restored3DState?.aoiBounds) {
        await cesiumManager.focusBounds(restored3DState.aoiBounds)
        await cesiumManager.loadTilesForAoi(restored3DState.aoiBounds)
        if (restored3DState.camera3D) {
          cesiumManager.restoreCameraState(restored3DState.camera3D)
        }
      } else {
        cesiumManager.clearSelection()
        cesiumManager.maximizeZoom()
      }

      lastBuildingMode = mode
      restored3DState = null
    } catch (error) {
      console.error('Failed to activate Cesium 3D mode:', error)
      map3DStatus.set('fatal_error')
      is3D.set(false)
    }
  }

  async function switchBuildingModeIn3D(): Promise<void> {
    if (!$is3D || !cesiumContainer) return

    const quality = detectQualityProfile()
    const { mode, tilesAssetIds } = resolveModeAndTiles($building3DMode)
    const aoiBounds = currentLonLatBbox ?? restored3DState?.aoiBounds ?? null

    try {
      await ensureCesiumReadyFor3D(aoiBounds, quality, mode, false)
      cesiumManager.setTilesetAssetIds(tilesAssetIds)

      if (aoiBounds) {
        await cesiumManager.loadTilesForAoi(aoiBounds)
      } else {
        cesiumManager.unloadTilesOutsideAoi(null)
      }

      lastBuildingMode = mode
    } catch (error) {
      console.error('Failed to switch Cesium building mode:', error)
      map3DStatus.set('fatal_error')
      is3D.set(false)
    }
  }

  onMount(() => {
    registerProjections()
    envTilesByMode = resolveEnvTilesByMode()
    building3DMode.set(resolveAvailableMode($building3DMode))
    lastBuildingMode = resolveAvailableMode($building3DMode)
    const map = mapManager.initializeMap(mapContainer)

    drawer = new BBoxDrawer(map)
    drawer.onBBoxDrawn((drawnBbox: BoundingBox) => {
      bbox.set(drawnBbox)
      currentLonLatBbox = toLonLatBounds(drawnBbox)
      if ($is3D) {
        void syncCesiumOnEnter3D()
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
    const currentIs3D = $is3D
    const currentBuildingMode = $building3DMode

    if (currentIs3D) {
      if ($drawingActive) {
        drawingActive.set(false)
      }
      if (!was3D) {
        void syncCesiumOnEnter3D()
      } else if (currentBuildingMode !== lastBuildingMode) {
        void switchBuildingModeIn3D()
      }
    } else if (was3D) {
      map3DStatus.set('ready')
      mapManager.getMap()?.resize()
    }

    was3D = currentIs3D
    lastBuildingMode = currentBuildingMode
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
      void syncCesiumOnEnter3D()
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
        buildingMode?: Building3DMode
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
      state.tiles3D = {
        activeAssetIds: cesiumManager.getConfiguredTilesetIds(),
        buildingMode: $building3DMode,
      }
    } else {
      state.aoiBounds = currentLonLatBbox
      state.camera3D = null
      state.tiles3D = {
        activeAssetIds: getTilesForMode($building3DMode),
        buildingMode: $building3DMode,
      }
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
      buildingMode?: Building3DMode
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
      tilesAssetIds: state.tiles3D?.activeAssetIds,
      buildingMode: state.tiles3D?.buildingMode,
    }
    if (state.tiles3D?.buildingMode) {
      building3DMode.set(resolveAvailableMode(state.tiles3D.buildingMode))
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

  {#if envTilesByMode.photogrammetry.length > 0 || envTilesByMode.lod1.length > 0}
    <div class="absolute right-4 top-14 z-30 flex items-center gap-1 rounded-md bg-black/60 p-1 text-[11px] text-white">
      <span class="px-1 text-white/80">Buildings</span>
      {#if envTilesByMode.photogrammetry.length > 0}
        <button
          class="rounded px-2 py-1 transition-colors {$building3DMode === 'photogrammetry' ? 'bg-white text-black' : 'bg-white/10 text-white hover:bg-white/20'}"
          onclick={() => building3DMode.set('photogrammetry')}
        >
          {buildingModeLabel.photogrammetry}
        </button>
      {/if}
      {#if envTilesByMode.lod1.length > 0}
        <button
          class="rounded px-2 py-1 transition-colors {$building3DMode === 'lod1' ? 'bg-white text-black' : 'bg-white/10 text-white hover:bg-white/20'}"
          onclick={() => building3DMode.set('lod1')}
        >
          {buildingModeLabel.lod1}
        </button>
      {/if}
    </div>
  {/if}
{/if}

<div id="bbox-tooltip" class="hidden fixed pointer-events-none text-white text-xs px-2 py-1 rounded z-50" style="background: color-mix(in srgb, var(--color-dtcc-navy) 95%, transparent);"></div>
