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
import {
  expandBounds,
  type LonLatBounds,
  type Map3DQuality,
} from './map3d-utils';

export type TilesetStatus = 'idle' | 'loading' | 'ready' | 'error';
export type TilesetSource = { kind: 'ion'; assetId: number };
export type TilesetEntry = { id: string; source: TilesetSource; status: TilesetStatus; error?: string };

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

const DEFAULT_IMAGERY_URL = 'https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png';

export class CesiumManager {
  private viewer: Viewer | null = null;
  private activeSelection: Entity | null = null;
  private hasWorldTerrain = false;
  private status: Map3DStatus = 'ready';
  private quality: Map3DQuality = 'desktop';
  private statusListener: ((status: Map3DStatus) => void) | null = null;
  private activeTilesets = new Map<number, Cesium3DTileset>();
  private tilesetEntries = new Map<number, TilesetEntry>();
  private activeAssetIds: number[] = [];
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
    this.activeAssetIds = Array.from(new Set(assetIds)).slice(0, 3);
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
        animation: false,
        timeline: false,
        geocoder: false,
        homeButton: false,
        sceneModePicker: false,
        baseLayerPicker: false,
        navigationHelpButton: false,
        fullscreenButton: false,
        infoBox: false,
        selectionIndicator: false,
        baseLayer: false,
        sceneMode: SceneMode.SCENE3D,
        shouldAnimate: true,
        shadows: config.quality === 'desktop',
      });
    } catch (error) {
      console.error('Failed to initialize Cesium viewer.', error);
      this.emitStatus('fatal_error');
      throw error;
    }

    const imageryProvider = new OpenStreetMapImageryProvider({
      url: import.meta.env.VITE_CESIUM_IMAGERY_URL || DEFAULT_IMAGERY_URL,
    });
    imageryProvider.errorEvent.addEventListener((error) => {
      console.error('Cesium imagery provider error:', error);
      this.emitStatus('imagery_error');
    });
    this.viewer.imageryLayers.addImageryProvider(imageryProvider);

    if (this.viewer.scene.skyBox) {
      this.viewer.scene.skyBox.show = false;
    }
    this.viewer.scene.globe.show = true;
    if (this.viewer.scene.skyAtmosphere) {
      this.viewer.scene.skyAtmosphere.show = true;
    }
    this.viewer.scene.fog.enabled = true;
    this.viewer.scene.globe.depthTestAgainstTerrain = true;
    this.viewer.scene.screenSpaceCameraController.enableTilt = true;
    this.viewer.scene.screenSpaceCameraController.enableCollisionDetection = true;
    this.viewer.scene.screenSpaceCameraController.minimumZoomDistance = 8;
    this.viewer.scene.screenSpaceCameraController.maximumZoomDistance = 250_000;
    this.viewer.scene.screenSpaceCameraController.inertiaSpin = 0.9;
    this.viewer.scene.screenSpaceCameraController.inertiaTranslate = 0.85;
    this.viewer.scene.screenSpaceCameraController.inertiaZoom = 0.8;

    this.setQualityProfile(config.quality);
    this.setAoiLock(config.aoiLock.bounds ?? null, config.aoiLock.paddingFactor);

    if (token) {
      try {
        this.viewer.terrainProvider = await createWorldTerrainAsync({
          requestVertexNormals: true,
          requestWaterMask: true,
        });
        this.viewer.scene.globe.enableLighting = true;
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
      this.viewer.resolutionScale = 0.75;
      this.viewer.scene.fog.density = 0.0013;
      this.viewer.shadows = false;
      this.viewer.scene.screenSpaceCameraController.minimumZoomDistance = 12;
    } else {
      this.viewer.resolutionScale = 1;
      this.viewer.scene.fog.density = 0.0009;
      this.viewer.shadows = true;
      this.viewer.scene.screenSpaceCameraController.minimumZoomDistance = 6;
    }
  }

  setAoiLock(bounds: LonLatBounds | null, paddingFactor = 1.8): void {
    // AOI locking disabled by request; keep method for API compatibility.
    void bounds;
    void paddingFactor;
  }

  tickAoiConstraints(): void {
    // AOI locking disabled by request.
  }

  async focusBounds(bounds: LonLatBounds): Promise<void> {
    if (!this.viewer) {
      throw new Error('Cesium viewer is not initialized');
    }

    const selectionBounds = expandBounds(bounds, 1);

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
        material: Color.ORANGE.withAlpha(0.18),
        outline: true,
        outlineColor: Color.ORANGE,
        height: 0,
        extrudedHeight: this.hasWorldTerrain ? 120 : 60,
      },
    });

    const approxDiagonalMeters = Cartesian3.distance(
      Cartesian3.fromRadians(selectionBounds.minLon, selectionBounds.minLat),
      Cartesian3.fromRadians(selectionBounds.maxLon, selectionBounds.maxLat),
    );
    const range = Math.max(approxDiagonalMeters * 1.85, this.quality === 'mobile' ? 2200 : 1500);
    const heading = CesiumMath.toRadians(22);
    const pitch = CesiumMath.toRadians(this.hasWorldTerrain ? -45 : -36);

    await this.viewer.flyTo(this.activeSelection, {
      duration: 1.4,
      offset: new HeadingPitchRange(heading, pitch, range),
      maximumHeight: range * 2.4,
    });

    // Max zoom when entering/focusing Cesium 3D.
    this.viewer.camera.zoomIn(1_000_000);
  }

  async loadTilesForAoi(bounds: LonLatBounds): Promise<void> {
    if (!this.viewer) {
      return;
    }

    if (this.activeAssetIds.length === 0) {
      console.warn('No 3D Tiles asset IDs configured. Set VITE_CESIUM_3DTILES_ASSET_IDS in frontend/.env.local');
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
          maximumScreenSpaceError: this.quality === 'mobile' ? 24 : 14,
          dynamicScreenSpaceError: true,
          cullWithChildrenBounds: true,
          skipLevelOfDetail: true,
        });

        tileset.show = true;
        tileset.style = new Cesium3DTileStyle({
          color: "color('white', 1.0)",
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
      destination: Cartesian3.fromDegrees(state.centerLon, state.centerLat, Math.max(80, state.height)),
      duration: 0.9,
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
    this.viewer.camera.zoomIn(1_000_000);
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
    this.activeSelection = null;
    this.viewer.destroy();
    this.viewer = null;
    this.hasWorldTerrain = false;
    this.tilesetEntries.clear();
  }
}

export const cesiumManager = new CesiumManager();
