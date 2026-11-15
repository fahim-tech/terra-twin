import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";


export default defineConfig({
  base: "./",
  plugins: [
    react(),
    tailwindcss(),
  ],
  define: { CESIUM_BASE_URL: JSON.stringify("./cesium") },
  build: {
    chunkSizeWarningLimit: 6000,
    rollupOptions: {
      input: { main: resolve(import.meta.dirname, "index.html"), globe: resolve(import.meta.dirname, "globe.html") },
    },
  },
  resolve: { alias: { "@": resolve(import.meta.dirname, "src") } },
  server: { port: 5180, strictPort: true },
  preview: { port: 5180 },
});
