import {
  Cartesian3,
  Cartographic,
  Cesium3DTileset,
  Cesium3DTileStyle,
  Color,
  createWorldTerrainAsync,
  type Entity,
  HeadingPitchRange,
  Ion,
  Math as CesiumMath,
  OpenStreetMapImageryProvider,
  Rectangle,
  SceneMode,
  Viewer,
} from 'cesium';
import cesiumConfigRaw from './cesium-config.json';
import {
  clampCameraCenterToBounds,
  expandBounds,
  type LonLatBounds,
  type Map3DQuality,
} from './map3d-utils';

export type TilesetStatus = 'idle' | 'loading' | 'ready' | 'error';
export type TilesetSource = { kind: 'ion'; assetId: number };
export type TilesetEntry = { id: string; source: TilesetSource; status: TilesetStatus; error?: string };
export type Building3DMode = 'photogrammetry' | 'lod1';

export type Map3DStatus =
  | 'ready'
  | 'terrain_fallback'
  | 'token_missing'
  | 'imagery_error'
  | 'fatal_error'
  | 'tiles_loading'
  | 'tiles_ready'
  | 'tiles_error';

export type AOILockConfig = {
  mode: 'soft';
  bounds?: LonLatBounds;
  paddingFactor: number;
};

export type Map3DConfig = {
  enabled: boolean;
  quality: Map3DQuality;
  aoiLock: AOILockConfig;
};

export type CesiumCameraState = {
  centerLon: number;
  centerLat: number;
  height: number;
  heading: number;
  pitch: number;
  roll: number;
};

type CesiumRuntimeConfig = {
  imagery: {
    defaultUrl: string;
  };
  tilesets: {
    maxActiveAssetIds: number;
    styleColor: string;
    loadOptions: {
      mobileMaximumScreenSpaceError: number;
      desktopMaximumScreenSpaceError: number;
      dynamicScreenSpaceError: boolean;
      cullWithChildrenBounds: boolean;
      skipLevelOfDetail: boolean;
    };
  };
  viewer: {
    options: {
      animation: boolean;
      timeline: boolean;
      geocoder: boolean;
      homeButton: boolean;
      sceneModePicker: boolean;
      baseLayerPicker: boolean;
      navigationHelpButton: boolean;
      fullscreenButton: boolean;
      infoBox: boolean;
      selectionIndicator: boolean;
      baseLayer: false;
      sceneMode: keyof typeof SceneMode;
      shouldAnimate: boolean;
      desktopShadows: boolean;
    };
    scene: {
      showGlobe: boolean;
      showSkyAtmosphere: boolean;
      enableFog: boolean;
      depthTestAgainstTerrain: boolean;
      enableTilt: boolean;
      enableCollisionDetection: boolean;
      minimumZoomDistance: number;
      maximumZoomDistance: number;
      inertiaSpin: number;
      inertiaTranslate: number;
      inertiaZoom: number;
      hideSkyBox: boolean;
    };
    terrain: {
      requestVertexNormals: boolean;
      requestWaterMask: boolean;
      enableLighting: boolean;
    };
  };
  qualityProfiles: {
    mobile: {
      resolutionScale: number;
      fogDensity: number;
      shadows: boolean;
      minimumZoomDistance: number;
    };
    desktop: {
      resolutionScale: number;
      fogDensity: number;
      shadows: boolean;
      minimumZoomDistance: number;
    };
  };
  aoiLock: {
    enabled: boolean;
    defaultPaddingFactor: number;
  };
  focusBounds: {
    expandBoundsFactor: number;
    selectionFillAlpha: number;
    extrudedHeightWithTerrain: number;
    extrudedHeightWithoutTerrain: number;
    rangeMultiplier: number;
    minimumRangeMobile: number;
    minimumRangeDesktop: number;
    headingDegrees: number;
    pitchWithTerrainDegrees: number;
    pitchWithoutTerrainDegrees: number;
    flyToDurationSeconds: number;
    maximumHeightMultiplier: number;
    postFlyZoomInAmount: number;
  };
  cameraRestore: {
    minimumHeight: number;
    flyToDurationSeconds: number;
  };
};

const cesiumConfig = cesiumConfigRaw as CesiumRuntimeConfig;

export class CesiumManager {
  private viewer: Viewer | null = null;
  private activeSelection: Entity | null = null;
  private interactionDebugCleanup: (() => void) | null = null;
  private aoiLockBounds: LonLatBounds | null = null;
  private aoiLockApplying = false;
  private aoiLockCameraChangedListener: (() => void) | null = null;
  private hasWorldTerrain = false;
  private status: Map3DStatus = 'ready';
  private quality: Map3DQuality = 'desktop';
  private statusListener: ((status: Map3DStatus) => void) | null = null;
  private activeTilesets = new Map<number, Cesium3DTileset>();
  private tilesetEntries = new Map<number, TilesetEntry>();
  private activeAssetIds: number[] = [];
  private currentBuildingMode: Building3DMode = 'photogrammetry';
  private tilesStatus: TilesetStatus = 'idle';

  setStatusListener(listener: ((status: Map3DStatus) => void) | null): void {
    this.statusListener = listener;
    this.emitStatus(this.status);
  }

  private emitStatus(status: Map3DStatus): void {
    this.status = status;
    if (this.statusListener) {
      this.statusListener(status);
    }
  }

  private emitTilesStatus(status: TilesetStatus): void {
    this.tilesStatus = status;
    if (status === 'loading') {
      this.emitStatus('tiles_loading');
    } else if (status === 'ready') {
      this.emitStatus('tiles_ready');
    } else if (status === 'error') {
      this.emitStatus('tiles_error');
    }
  }

  getStatus(): Map3DStatus {
    return this.status;
  }

  setTilesetAssetIds(assetIds: number[]): void {
    this.activeAssetIds = Array.from(new Set(assetIds)).slice(0, cesiumConfig.tilesets.maxActiveAssetIds);
    for (const id of this.activeTilesets.keys()) {
      if (!this.activeAssetIds.includes(id)) {
        this.removeTileset(id);
      }
    }
  }

  getActiveTilesetIds(): number[] {
    return Array.from(this.activeTilesets.keys());
  }

  getConfiguredTilesetIds(): number[] {
    return [...this.activeAssetIds];
  }

  getTilesetEntries(): TilesetEntry[] {
    return Array.from(this.tilesetEntries.values());
  }

  getTilesetStatus(): TilesetStatus {
    return this.tilesStatus;
  }

  getTilesDebugSnapshot(): { configuredAssetIds: number[]; activeAssetIds: number[]; entries: TilesetEntry[] } {
    return {
      configuredAssetIds: [...this.activeAssetIds],
      activeAssetIds: this.getActiveTilesetIds(),
      entries: this.getTilesetEntries(),
    };
  }

  private removeTileset(assetId: number): void {
    if (!this.viewer) return;
    const existing = this.activeTilesets.get(assetId);
    if (existing) {
      this.viewer.scene.primitives.remove(existing);
      this.activeTilesets.delete(assetId);
    }
    this.tilesetEntries.delete(assetId);
  }

  setBuildingMode(mode: Building3DMode): void {
    this.currentBuildingMode = mode;
    if (!this.viewer) {
      return;
    }

    this.viewer.scene.globe.show = mode === 'lod1' ? true : cesiumConfig.viewer.scene.showGlobe;
  }

  private setupAoiLockListener(): void {
    if (!this.viewer || this.aoiLockCameraChangedListener) {
      return;
    }

    const listener = (): void => {
      this.tickAoiConstraints();
    };
    this.viewer.camera.changed.addEventListener(listener);
    this.aoiLockCameraChangedListener = listener;
  }

  private teardownAoiLockListener(): void {
    if (!this.viewer || !this.aoiLockCameraChangedListener) {
      return;
    }

    this.viewer.camera.changed.removeEventListener(this.aoiLockCameraChangedListener);
    this.aoiLockCameraChangedListener = null;
  }

  private setupInteractionDebugLogging(): void {
    if (!this.viewer || this.interactionDebugCleanup) {
      return;
    }

    const canvas = this.viewer.scene.canvas;
    let pointerDown = false;
    let dragStarted = false;
    let pointerType = 'mouse';
    let startX = 0;
    let startY = 0;

    const log = (interaction: string): void => {
      console.debug('[Cesium Interaction]', interaction);
    };

    const onPointerDown = (event: PointerEvent): void => {
      pointerDown = true;
      dragStarted = false;
      pointerType = event.pointerType || 'mouse';
      startX = event.clientX;
      startY = event.clientY;
    };

    const onPointerMove = (event: PointerEvent): void => {
      if (!pointerDown || dragStarted) {
        return;
      }
      const moved = Math.hypot(event.clientX - startX, event.clientY - startY);
      if (moved >= 6) {
        dragStarted = true;
        log(`${pointerType}_drag_start`);
      }
    };

    const onPointerUp = (): void => {
      if (!pointerDown) {
        return;
      }
      if (dragStarted) {
        log(`${pointerType}_drag_end`);
      } else {
        log(pointerType === 'touch' ? 'touch_tap' : `${pointerType}_click`);
      }
      pointerDown = false;
      dragStarted = false;
    };

    const onPointerCancel = (): void => {
      pointerDown = false;
      dragStarted = false;
    };

    const onDoubleClick = (): void => {
      log('double_click');
    };

    const onWheel = (event: WheelEvent): void => {
      log(event.deltaY < 0 ? 'wheel_zoom_in' : 'wheel_zoom_out');
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerCancel);
    canvas.addEventListener('dblclick', onDoubleClick);
    canvas.addEventListener('wheel', onWheel, { passive: true });

    this.interactionDebugCleanup = () => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerCancel);
      canvas.removeEventListener('dblclick', onDoubleClick);
      canvas.removeEventListener('wheel', onWheel);
    };
  }

  async initialize(container: HTMLElement, config: Map3DConfig): Promise<void> {
    this.quality = config.quality;

    if (this.viewer) {
      this.setQualityProfile(config.quality);
      this.setAoiLock(config.aoiLock.bounds ?? null, config.aoiLock.paddingFactor);
      return;
    }

    const token = import.meta.env.VITE_CESIUM_ION_TOKEN;
    Ion.defaultAccessToken = token || '';
    if (!token) {
      this.emitStatus('token_missing');
    }

    try {
      this.viewer = new Viewer(container, {
        animation: cesiumConfig.viewer.options.animation,
        timeline: cesiumConfig.viewer.options.timeline,
        geocoder: cesiumConfig.viewer.options.geocoder,
        homeButton: cesiumConfig.viewer.options.homeButton,
        sceneModePicker: cesiumConfig.viewer.options.sceneModePicker,
        baseLayerPicker: cesiumConfig.viewer.options.baseLayerPicker,
        navigationHelpButton: cesiumConfig.viewer.options.navigationHelpButton,
        fullscreenButton: cesiumConfig.viewer.options.fullscreenButton,
        infoBox: cesiumConfig.viewer.options.infoBox,
        selectionIndicator: cesiumConfig.viewer.options.selectionIndicator,
        baseLayer: cesiumConfig.viewer.options.baseLayer,
        sceneMode: SceneMode[cesiumConfig.viewer.options.sceneMode],
        shouldAnimate: cesiumConfig.viewer.options.shouldAnimate,
        shadows:
          config.quality === 'desktop'
            ? cesiumConfig.viewer.options.desktopShadows
            : cesiumConfig.qualityProfiles.mobile.shadows,
      });
    } catch (error) {
      console.error('Failed to initialize Cesium viewer.', error);
      this.emitStatus('fatal_error');
      throw error;
    }

    const imageryProvider = new OpenStreetMapImageryProvider({
      url: import.meta.env.VITE_CESIUM_IMAGERY_URL || cesiumConfig.imagery.defaultUrl,
    });
    imageryProvider.errorEvent.addEventListener((error) => {
      console.error('Cesium imagery provider error:', error);
      this.emitStatus('imagery_error');
    });
    this.viewer.imageryLayers.addImageryProvider(imageryProvider);

    if (this.viewer.scene.skyBox) {
      this.viewer.scene.skyBox.show = !cesiumConfig.viewer.scene.hideSkyBox;
    }
    this.viewer.scene.globe.show = cesiumConfig.viewer.scene.showGlobe;
    if (this.viewer.scene.skyAtmosphere) {
      this.viewer.scene.skyAtmosphere.show = cesiumConfig.viewer.scene.showSkyAtmosphere;
    }
    this.viewer.scene.fog.enabled = cesiumConfig.viewer.scene.enableFog;
    this.viewer.scene.globe.depthTestAgainstTerrain = cesiumConfig.viewer.scene.depthTestAgainstTerrain;
    this.viewer.scene.screenSpaceCameraController.enableTilt = cesiumConfig.viewer.scene.enableTilt;
    this.viewer.scene.screenSpaceCameraController.enableCollisionDetection =
      cesiumConfig.viewer.scene.enableCollisionDetection;
    this.viewer.scene.screenSpaceCameraController.minimumZoomDistance =
      cesiumConfig.viewer.scene.minimumZoomDistance;
    this.viewer.scene.screenSpaceCameraController.maximumZoomDistance =
      cesiumConfig.viewer.scene.maximumZoomDistance;
    this.viewer.scene.screenSpaceCameraController.inertiaSpin = cesiumConfig.viewer.scene.inertiaSpin;
    this.viewer.scene.screenSpaceCameraController.inertiaTranslate = cesiumConfig.viewer.scene.inertiaTranslate;
    this.viewer.scene.screenSpaceCameraController.inertiaZoom = cesiumConfig.viewer.scene.inertiaZoom;

    this.setQualityProfile(config.quality);
    this.setAoiLock(config.aoiLock.bounds ?? null, config.aoiLock.paddingFactor);
    this.setBuildingMode(this.currentBuildingMode);
    this.setupInteractionDebugLogging();

    if (token) {
      try {
        this.viewer.terrainProvider = await createWorldTerrainAsync({
          requestVertexNormals: cesiumConfig.viewer.terrain.requestVertexNormals,
          requestWaterMask: cesiumConfig.viewer.terrain.requestWaterMask,
        });
        this.viewer.scene.globe.enableLighting = cesiumConfig.viewer.terrain.enableLighting;
        this.hasWorldTerrain = true;
        this.emitStatus('ready');
      } catch (error) {
        this.hasWorldTerrain = false;
        console.warn('Cesium terrain unavailable, using ellipsoid fallback.', error);
        this.emitStatus('terrain_fallback');
      }
    } else {
      this.hasWorldTerrain = false;
    }

  }

  setQualityProfile(profile: Map3DQuality): void {
    this.quality = profile;
    if (!this.viewer) {
      return;
    }

    if (profile === 'mobile') {
      this.viewer.resolutionScale = cesiumConfig.qualityProfiles.mobile.resolutionScale;
      this.viewer.scene.fog.density = cesiumConfig.qualityProfiles.mobile.fogDensity;
      this.viewer.shadows = cesiumConfig.qualityProfiles.mobile.shadows;
      this.viewer.scene.screenSpaceCameraController.minimumZoomDistance =
        cesiumConfig.qualityProfiles.mobile.minimumZoomDistance;
    } else {
      this.viewer.resolutionScale = cesiumConfig.qualityProfiles.desktop.resolutionScale;
      this.viewer.scene.fog.density = cesiumConfig.qualityProfiles.desktop.fogDensity;
      this.viewer.shadows = cesiumConfig.qualityProfiles.desktop.shadows;
      this.viewer.scene.screenSpaceCameraController.minimumZoomDistance =
        cesiumConfig.qualityProfiles.desktop.minimumZoomDistance;
    }
  }

  setAoiLock(bounds: LonLatBounds | null, paddingFactor = cesiumConfig.aoiLock.defaultPaddingFactor): void {
    if (!this.viewer) {
      return;
    }
    if (!cesiumConfig.aoiLock.enabled) {
      this.aoiLockBounds = null;
      this.teardownAoiLockListener();
      return;
    }

    if (!bounds) {
      this.aoiLockBounds = null;
      return;
    }

    this.setupAoiLockListener();
    this.aoiLockBounds = expandBounds(bounds, Math.max(1, paddingFactor));
    this.tickAoiConstraints();
  }

  tickAoiConstraints(): void {
    if (!cesiumConfig.aoiLock.enabled || !this.viewer || !this.aoiLockBounds || this.aoiLockApplying) {
      return;
    }

    const camera = this.viewer.camera;
    const carto = Cartographic.fromCartesian(camera.position);
    if (!carto) {
      return;
    }

    const lon = CesiumMath.toDegrees(carto.longitude);
    const lat = CesiumMath.toDegrees(carto.latitude);
    const clamped = clampCameraCenterToBounds(lon, lat, this.aoiLockBounds);
    if (!clamped.clamped) {
      return;
    }

    this.aoiLockApplying = true;
    camera.setView({
      destination: Cartesian3.fromDegrees(clamped.lon, clamped.lat, Math.max(carto.height, 1)),
      orientation: {
        heading: camera.heading,
        pitch: camera.pitch,
        roll: camera.roll,
      },
    });
    this.aoiLockApplying = false;
  }

  async focusBounds(bounds: LonLatBounds): Promise<void> {
    if (!this.viewer) {
      throw new Error('Cesium viewer is not initialized');
    }

    const selectionBounds = expandBounds(bounds, cesiumConfig.focusBounds.expandBoundsFactor);

    const rectangle = Rectangle.fromDegrees(
      selectionBounds.minLon,
      selectionBounds.minLat,
      selectionBounds.maxLon,
      selectionBounds.maxLat,
    );

    if (this.activeSelection) {
      this.viewer.entities.remove(this.activeSelection);
    }
    this.activeSelection = this.viewer.entities.add({
      rectangle: {
        coordinates: rectangle,
        material: Color.ORANGE.withAlpha(cesiumConfig.focusBounds.selectionFillAlpha),
        outline: true,
        outlineColor: Color.ORANGE,
        height: 0,
        extrudedHeight: this.hasWorldTerrain
          ? cesiumConfig.focusBounds.extrudedHeightWithTerrain
          : cesiumConfig.focusBounds.extrudedHeightWithoutTerrain,
      },
    });

    const approxDiagonalMeters = Cartesian3.distance(
      Cartesian3.fromDegrees(selectionBounds.minLon, selectionBounds.minLat),
      Cartesian3.fromDegrees(selectionBounds.maxLon, selectionBounds.maxLat),
    );
    const range = Math.max(
      approxDiagonalMeters * cesiumConfig.focusBounds.rangeMultiplier,
      this.quality === 'mobile'
        ? cesiumConfig.focusBounds.minimumRangeMobile
        : cesiumConfig.focusBounds.minimumRangeDesktop,
    );
    const heading = CesiumMath.toRadians(cesiumConfig.focusBounds.headingDegrees);
    const pitch = CesiumMath.toRadians(
      this.hasWorldTerrain
        ? cesiumConfig.focusBounds.pitchWithTerrainDegrees
        : cesiumConfig.focusBounds.pitchWithoutTerrainDegrees,
    );

    await this.viewer.flyTo(this.activeSelection, {
      duration: cesiumConfig.focusBounds.flyToDurationSeconds,
      offset: new HeadingPitchRange(heading, pitch, range),
      maximumHeight: range * cesiumConfig.focusBounds.maximumHeightMultiplier,
    });

    // Max zoom when entering/focusing Cesium 3D.
    this.viewer.camera.zoomIn(cesiumConfig.focusBounds.postFlyZoomInAmount);
  }

  async loadTilesForAoi(bounds: LonLatBounds): Promise<void> {
    if (!this.viewer) {
      return;
    }

    if (this.activeAssetIds.length === 0) {
      console.warn(
        'No 3D Tiles asset IDs configured. Set VITE_CESIUM_3DTILES_ASSET_ID_PHOTOGRAMMETRY and/or VITE_CESIUM_3DTILES_ASSET_ID_LOD1 in frontend/.env.local',
      );
      this.emitTilesStatus('error');
      return;
    }

    this.emitTilesStatus('loading');
    const failures: string[] = [];

    for (const assetId of this.activeAssetIds) {
      if (this.activeTilesets.has(assetId)) {
        continue;
      }

      this.tilesetEntries.set(assetId, {
        id: `ion-${assetId}`,
        source: { kind: 'ion', assetId },
        status: 'loading',
      });

      try {
        const tileset = await Cesium3DTileset.fromIonAssetId(assetId, {
          maximumScreenSpaceError:
            this.quality === 'mobile'
              ? cesiumConfig.tilesets.loadOptions.mobileMaximumScreenSpaceError
              : cesiumConfig.tilesets.loadOptions.desktopMaximumScreenSpaceError,
          dynamicScreenSpaceError: cesiumConfig.tilesets.loadOptions.dynamicScreenSpaceError,
          cullWithChildrenBounds: cesiumConfig.tilesets.loadOptions.cullWithChildrenBounds,
          skipLevelOfDetail: cesiumConfig.tilesets.loadOptions.skipLevelOfDetail,
        });

        tileset.show = true;
        tileset.style = new Cesium3DTileStyle({
          color: cesiumConfig.tilesets.styleColor,
        });
        this.viewer.scene.primitives.add(tileset);
        this.activeTilesets.set(assetId, tileset);
        this.tilesetEntries.set(assetId, {
          id: `ion-${assetId}`,
          source: { kind: 'ion', assetId },
          status: 'ready',
        });
        console.info('Cesium 3D tiles loaded', {
          assetId,
          addedToPrimitives: this.viewer.scene.primitives.contains(tileset),
          show: tileset.show,
          activeTilesets: this.activeTilesets.size,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown tileset load error';
        failures.push(`asset ${assetId}: ${message}`);
        this.tilesetEntries.set(assetId, {
          id: `ion-${assetId}`,
          source: { kind: 'ion', assetId },
          status: 'error',
          error: message,
        });
        console.error('Cesium 3D tiles failed to load', { assetId, error });
      }
    }

    this.unloadTilesOutsideAoi(bounds);

    if (failures.length > 0) {
      console.warn('Cesium 3D tiles load failures:', failures.join(' | '));
      this.emitTilesStatus('error');
      return;
    }

    this.emitTilesStatus('ready');
  }

  unloadTilesOutsideAoi(bounds: LonLatBounds | null): void {
    if (!this.viewer) {
      return;
    }

    if (!bounds) {
      for (const id of this.activeTilesets.keys()) {
        this.removeTileset(id);
      }
      this.tilesStatus = 'idle';
      return;
    }

    const toRemove: number[] = [];

    for (const [assetId, tileset] of this.activeTilesets.entries()) {
      if (!this.activeAssetIds.includes(assetId)) {
        toRemove.push(assetId);
        console.info('Cesium 3D tiles removed (not configured)', { assetId, hadTileset: !!tileset });
      }
    }

    toRemove.forEach((id) => this.removeTileset(id));
  }

  getCameraState(): CesiumCameraState | null {
    if (!this.viewer) {
      return null;
    }
    const carto = Cartographic.fromCartesian(this.viewer.camera.position);
    if (!carto) {
      return null;
    }
    return {
      centerLon: CesiumMath.toDegrees(carto.longitude),
      centerLat: CesiumMath.toDegrees(carto.latitude),
      height: carto.height,
      heading: this.viewer.camera.heading,
      pitch: this.viewer.camera.pitch,
      roll: this.viewer.camera.roll,
    };
  }

  restoreCameraState(state: CesiumCameraState): void {
    if (!this.viewer) {
      return;
    }
    this.viewer.camera.flyTo({
      destination: Cartesian3.fromDegrees(
        state.centerLon,
        state.centerLat,
        Math.max(cesiumConfig.cameraRestore.minimumHeight, state.height),
      ),
      duration: cesiumConfig.cameraRestore.flyToDurationSeconds,
      orientation: {
        heading: state.heading,
        pitch: state.pitch,
        roll: state.roll,
      },
    });
  }

  maximizeZoom(): void {
    if (!this.viewer) {
      return;
    }
    this.viewer.camera.zoomIn(cesiumConfig.focusBounds.postFlyZoomInAmount);
  }

  clearSelection(): void {
    if (!this.viewer || !this.activeSelection) {
      return;
    }
    this.viewer.entities.remove(this.activeSelection);
    this.activeSelection = null;
    this.setAoiLock(null);
  }

  destroy(): void {
    if (!this.viewer) {
      return;
    }
    this.unloadTilesOutsideAoi(null);
    if (this.interactionDebugCleanup) {
      this.interactionDebugCleanup();
      this.interactionDebugCleanup = null;
    }
    this.teardownAoiLockListener();
    this.aoiLockBounds = null;
    this.activeSelection = null;
    this.viewer.destroy();
    this.viewer = null;
    this.hasWorldTerrain = false;
    this.tilesetEntries.clear();
  }
}

export const cesiumManager = new CesiumManager();
