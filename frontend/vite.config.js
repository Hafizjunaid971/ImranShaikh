import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // ڈیویلپمنٹ میں API کالز سیدھی backend پر
      '/api': { target: 'https://imran-shaikh-pi.vercel.app/api', changeOrigin: true },
    },
  },
  build: { outDir: 'dist', sourcemap: false },
});
