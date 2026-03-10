/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CESIUM_ION_TOKEN?: string
  readonly VITE_CESIUM_IMAGERY_URL?: string
  readonly VITE_CESIUM_3DTILES_ASSET_ID_PHOTOGRAMMETRY?: string
  readonly VITE_CESIUM_3DTILES_ASSET_ID_LOD1?: string
  readonly VITE_CESIUM_3DTILES_ASSET_ID_LOD1_GROUND?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
