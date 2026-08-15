import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import type { PluginOption } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const apiProxyTarget = process.env.VITE_API_PROXY_TARGET || 'http://localhost:4010';
const wsProxyTarget = apiProxyTarget.replace(/^http/i, 'ws');

export default defineConfig({
  plugins: [react(), tailwindcss() as unknown as PluginOption],
  resolve: {
    alias: {
      // react-bits components import { cn } from "@/lib/utils"; our cn lives in
      // src/components/ui/utils.ts. Map @/lib -> src/components/ui so pasted
      // components work without rewriting imports, and @ -> src as a general
      // convenience.
      '@/lib': path.resolve(__dirname, 'src/components/ui'),
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5173,
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: apiProxyTarget,
        changeOrigin: true,
      },
      '/ws': {
        target: wsProxyTarget,
        ws: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Split large vendor libs into their own chunks so the app code and
        // recharts load in parallel and can be cached independently.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('recharts')) return 'recharts';
          // Animation libs used by react-bits components. motion is used app
          // wide; gsap/three/ogl are heavier and only pulled in by specific
          // components, so isolate them so the main bundle stays lean.
          if (id.includes('/motion/') || id.includes('/framer-motion/')) return 'motion';
          if (id.includes('/gsap/')) return 'gsap';
          if (id.includes('/three/') || id.includes('/@react-three/')) return 'webgl-three';
          if (id.includes('/ogl/')) return 'webgl-ogl';
          // Split the former catch-all `vendor` blob into stable, independently
          // cacheable groups. React runtime and the rich-text editor rarely
          // change; icons and i18n libs churn on their own cadence — separating
          // them means a bump in one no longer busts the cache for the rest.
          if (
            id.includes('/react/') ||
            id.includes('/react-dom/') ||
            id.includes('/react-router/') ||
            id.includes('/scheduler/')
          ) {
            return 'react-vendor';
          }
          if (id.includes('/@tanstack/')) return 'query';
          if (
            id.includes('/i18next/') ||
            id.includes('/react-i18next/') ||
            id.includes('/i18next-browser-languagedetector/')
          ) {
            return 'i18n-vendor';
          }
          if (id.includes('/lucide-react/')) return 'icons';
          if (id.includes('/@tiptap/') || id.includes('/prosemirror')) return 'editor';
          return 'vendor';
        },
      },
    },
  },
});
