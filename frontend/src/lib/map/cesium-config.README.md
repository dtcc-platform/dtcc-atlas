# Cesium Manager Config

This file documents [`cesium-config.json`](./cesium-config.json), which contains all runtime-tunable values used by `cesium-manager.ts`.

## imagery

- `defaultUrl`: Fallback imagery provider URL used when `VITE_CESIUM_IMAGERY_URL` is not set.

## tilesets

- `maxActiveAssetIds`: Maximum number of distinct Cesium Ion 3D Tiles asset IDs to keep active.
- `styleColor`: Cesium 3D Tiles style color expression applied to loaded tilesets.

### tilesets.loadOptions

- `mobileMaximumScreenSpaceError`: Screen-space error target for mobile quality (higher value = less detail, faster rendering).
- `desktopMaximumScreenSpaceError`: Screen-space error target for desktop quality.
- `dynamicScreenSpaceError`: Enables dynamic SSE to reduce work for distant tiles.
- `cullWithChildrenBounds`: Allows culling based on children bounds.
- `skipLevelOfDetail`: Enables LOD skipping for faster traversal/loading.

## viewer

### viewer.options

These map directly to Cesium `Viewer` constructor options.

- `animation`: Show/hide timeline animation controls.
- `timeline`: Show/hide timeline UI.
- `geocoder`: Enable/disable geocoder search widget.
- `homeButton`: Enable/disable home camera button.
- `sceneModePicker`: Enable/disable 2D/3D mode picker.
- `baseLayerPicker`: Enable/disable base-layer picker.
- `navigationHelpButton`: Enable/disable navigation help widget.
- `fullscreenButton`: Enable/disable fullscreen button.
- `infoBox`: Enable/disable default info box for entities.
- `selectionIndicator`: Enable/disable default entity selection indicator.
- `baseLayer`: Whether Cesium should create a default base layer.
- `sceneMode`: Initial scene mode (`SCENE3D` supported by current manager mapping).
- `shouldAnimate`: Enables scene animation.
- `desktopShadows`: Whether shadows are enabled at initialization on desktop quality.

### viewer.scene

- `showGlobe`: Toggle globe visibility.
- `showSkyAtmosphere`: Toggle sky atmosphere effect.
- `enableFog`: Enable/disable fog.
- `depthTestAgainstTerrain`: Enables depth testing vs terrain.
- `enableTilt`: Allows camera tilt.
- `enableCollisionDetection`: Prevent camera clipping through terrain.
- `minimumZoomDistance`: Global minimum camera zoom distance.
- `maximumZoomDistance`: Global maximum camera zoom distance.
- `inertiaSpin`: Camera spin inertia.
- `inertiaTranslate`: Camera pan inertia.
- `inertiaZoom`: Camera zoom inertia.
- `hideSkyBox`: If `true`, hides the skybox.

### viewer.terrain

- `requestVertexNormals`: Request terrain normals from Cesium terrain provider.
- `requestWaterMask`: Request terrain water mask.
- `enableLighting`: Enables globe lighting when world terrain is active.

## qualityProfiles

Per-device rendering profiles selected by quality (`mobile`/`desktop`).

- `resolutionScale`: Render resolution scale.
- `fogDensity`: Fog density.
- `shadows`: Shadow toggle.
- `minimumZoomDistance`: Profile-specific minimum zoom distance.

## aoiLock

- `enabled`: Enables AOI lock behavior hooks in `CesiumManager`. When `false`, `setAoiLock` / `tickAoiConstraints` are no-ops.
- `defaultPaddingFactor`: Default AOI padding used by `setAoiLock` when no padding value is passed.

## focusBounds

Camera and selection behavior when focusing a bounding box.

- `expandBoundsFactor`: Factor passed to `expandBounds` before framing.
- `selectionFillAlpha`: Selection rectangle fill alpha.
- `extrudedHeightWithTerrain`: Rectangle extruded height when world terrain is enabled.
- `extrudedHeightWithoutTerrain`: Rectangle extruded height when terrain fallback is used.
- `rangeMultiplier`: Multiplier for computed diagonal distance to derive camera range.
- `minimumRangeMobile`: Minimum camera range for mobile profile.
- `minimumRangeDesktop`: Minimum camera range for desktop profile.
- `headingDegrees`: Camera heading in degrees for `flyTo`.
- `pitchWithTerrainDegrees`: Camera pitch in degrees when world terrain is enabled.
- `pitchWithoutTerrainDegrees`: Camera pitch in degrees when terrain fallback is used.
- `flyToDurationSeconds`: Fly-to duration for bounds focus.
- `maximumHeightMultiplier`: Maximum fly-to height multiplier relative to range.
- `postFlyZoomInAmount`: Additional zoom-in amount applied after focus.

## cameraRestore

- `minimumHeight`: Minimum camera height enforced when restoring saved camera state.
- `flyToDurationSeconds`: Fly-to duration when restoring camera state.

## Notes

- Environment variables still control secret/runtime values:
  - `VITE_CESIUM_ION_TOKEN`
  - `VITE_CESIUM_IMAGERY_URL`
  - `VITE_CESIUM_3DTILES_ASSET_IDS`
- If you change JSON keys, update `cesium-manager.ts` accordingly.
