import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      // Mirror the old webpack `@ -> src` alias used throughout the app.
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
    // The app imports .vue components without the extension (e.g. `import Button
    // from "@/components/Button"`), which webpack resolved automatically. Vite does
    // not resolve .vue implicitly by default, so add it to the resolve list.
    extensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json', '.vue'],
  },
  // Keep the per-stage build config vars reachable on `import.meta.env` under their
  // existing VUE_APP_ names (set in .env files and injected by the CDK website stack),
  // so neither the .env files nor lib/ps-website-stack.ts need renaming.
  envPrefix: 'VUE_APP_',
  server: {
    // Cognito OAuth redirect URIs in .env are pinned to localhost:8080, so the dev
    // server must stay on that port (Vite otherwise defaults to 5173).
    port: 8080,
    strictPort: true,
  },
  build: {
    // Phaser can't load assets served as data: URLs, so disable Vite's inlining of
    // small assets (replaces the old vue.config.js asset/resource webpack tweak).
    assetsInlineLimit: 0,
  },
})
