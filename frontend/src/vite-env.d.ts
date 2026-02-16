/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PIXEL_STREAMING_SIGNALING_URL?: string;
  readonly VITE_PIXEL_STREAMING_STREAMER_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
