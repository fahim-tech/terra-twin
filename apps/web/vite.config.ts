import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { viteStaticCopy } from "vite-plugin-static-copy";
import { resolve } from "node:path";

const cesiumSource = "node_modules/cesium/Build/Cesium";
const cesiumBaseUrl = "cesium";

export default defineConfig({
  base: "./",
  plugins: [
    react(),
    tailwindcss(),
    viteStaticCopy({
      targets: [
        { src: `${cesiumSource}/ThirdParty`, dest: cesiumBaseUrl },
        { src: `${cesiumSource}/Workers`, dest: cesiumBaseUrl },
        { src: `${cesiumSource}/Assets`, dest: cesiumBaseUrl },
        { src: `${cesiumSource}/Widgets`, dest: cesiumBaseUrl },
      ],
    }),
  ],
  define: { CESIUM_BASE_URL: JSON.stringify(`./${cesiumBaseUrl}`) },
  build: {
    chunkSizeWarningLimit: 6000,
    rollupOptions: {
      input: { main: resolve(__dirname, "index.html"), globe: resolve(__dirname, "globe.html") },
    },
  },
  resolve: { alias: { "@": resolve(__dirname, "src") } },
  server: { port: 5173 },
});
