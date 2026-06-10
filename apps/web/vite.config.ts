import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // Lee el .env del raíz del monorepo (mismas credenciales que el servidor).
  envDir: '../../',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.png', 'apple-touch-icon.png', 'og.png'],
      manifest: {
        name: 'Polla Mundialista 2026',
        short_name: 'Polla 2026',
        description: 'Polla del Mundial 2026: pronósticos, tabla en vivo e historial.',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // App shell precacheado. Solo se cachean GET (las escrituras NUNCA se
        // encolan offline: requieren conexión — sección 3 del prompt).
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            // Lecturas REST de Supabase: NetworkFirst ⇒ online trae lo último,
            // offline sirve el último estado cacheado (fixtures, tabla, histórico).
            urlPattern: ({ url, request }) =>
              url.pathname.includes('/rest/v1/') && request.method === 'GET',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-rest',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 7 },
              networkTimeoutSeconds: 5,
            },
          },
          {
            // Escudos / fotos: CacheFirst (cambian poco).
            urlPattern: ({ request }) => request.destination === 'image',
            handler: 'CacheFirst',
            options: {
              cacheName: 'imagenes',
              expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  server: { port: 5173 },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          supabase: ['@supabase/supabase-js'],
          query: ['@tanstack/react-query'],
        },
      },
    },
  },
});
