import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { viteStaticCopy } from 'vite-plugin-static-copy'

export default defineConfig({
  plugins: [
    svelte(),
    tailwindcss(),
    viteStaticCopy({
      targets: [
        {
          src: 'node_modules/cesium/Build/Cesium/{Workers,ThirdParty,Assets,Widgets}',
          dest: 'cesium',
        },
      ],
    }),
  ],
  server: {
    port: 3000,
    open: true,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        ws: true,
      }
    }
  },
  build: {
    outDir: '../server/static',
    emptyOutDir: true,
    sourcemap: true,
  }
})
