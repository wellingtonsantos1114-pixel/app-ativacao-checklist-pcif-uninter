import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'
import { validateSupabaseBuild } from './src/pilot/publicConfig'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', 'VITE_')
  validateSupabaseBuild(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY)
  if (env.VITE_PCIF_MODE === 'pilot' && (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_PUBLISHABLE_KEY)) throw Error('Configure o piloto de homologação.')
  if (env.VITE_PCIF_MODE && !['demo', 'pilot'].includes(env.VITE_PCIF_MODE)) throw Error('Modo PCIF inválido')
  return {
    define: {__PCIF_BUILD_SHA__: JSON.stringify(process.env.COMMIT_REF?.slice(0, 7) || 'local')},
    plugins: [react(), VitePWA({
      registerType: 'prompt',
      injectRegister: null,
      manifest: {
        id: '/', name: 'Ativação e Checklist', short_name: 'Ativação e Checklist',
        description: 'Aplicativo de ativação e checklist PCIF', lang: 'pt-BR',
        start_url: '/', scope: '/', display: 'standalone',
        background_color: '#f3f5f0', theme_color: '#143d32',
        icons: [
          {src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any'},
          {src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any'},
          {src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable'},
        ],
      },
      workbox: {
        // Only public static files. Navigations and backend requests use the network.
        globPatterns: ['assets/*.{js,css}', 'icons/*.png', 'login/*.webp', 'operator/*.svg'],
        importScripts: ['/pwa-guard.js'],
        navigateFallback: null,
        cleanupOutdatedCaches: true,
        skipWaiting: false,
        clientsClaim: false,
        runtimeCaching: [],
      },
    })],
    test: {environment: 'jsdom', setupFiles: './src/test/setup.ts', css: true},
  }
})
