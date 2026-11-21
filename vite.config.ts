import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [react(), tailwindcss(), VitePWA({
    registerType: 'prompt',
    includeAssets: ['favicon.svg'],
    manifest: {
      name: 'Prompta', short_name: 'Prompta',
      description: 'Private prompt library',
      theme_color: '#171717', background_color: '#171717', display: 'standalone',
      start_url: '/', icons: [{src:'/favicon.svg',sizes:'any',type:'image/svg+xml',purpose:'any'}]
    },
    workbox: {
      globPatterns: ['**/*.{js,css,html,svg,woff2,webmanifest}'],
      navigateFallback: '/index.html',
      navigateFallbackDenylist: [/^\/api/, /^\/__/],
      maximumFileSizeToCacheInBytes: 3500000,
      cleanupOutdatedCaches: true,
    }
  })],
  server: { host: '0.0.0.0', allowedHosts: true },
  build: { sourcemap: false, chunkSizeWarningLimit: 700 },
  test: { environment: 'jsdom', setupFiles: ['tests/setup.ts'], exclude: ['node_modules/**','dist/**','backend/**'] }
});
