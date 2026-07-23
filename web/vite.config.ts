import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const apiProxyTarget = process.env.VITE_API_PROXY_TARGET || 'http://localhost:4010';
const wsProxyTarget = apiProxyTarget.replace(/^http/i, 'ws');

export default defineConfig({
  plugins: [react()],
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
          return 'vendor';
        },
      },
    },
  },
});
