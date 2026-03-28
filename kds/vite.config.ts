import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "../ury/public/kds",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // Stable filenames so `urymosaic.html` doesn't need to be rewritten on each build.
        entryFileNames: "kds.js",
        assetFileNames: (assetInfo) => {
          if (assetInfo.name?.endsWith(".css")) return "kds.css";
          return "assets/[name][extname]";
        },
        chunkFileNames: "chunks/[name].js",
      }
    }
  },
})

