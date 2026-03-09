/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CESIUM_ION_TOKEN?: string
  readonly VITE_CESIUM_IMAGERY_URL?: string
  readonly VITE_CESIUM_3DTILES_ASSET_IDS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
