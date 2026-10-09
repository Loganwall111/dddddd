import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  server: {
    host: "0.0.0.0",
    port: 5173,
    allowedHosts: true,
  },
  preview: {
    host: "0.0.0.0",
    port: 4173,
    allowedHosts: true,
  },
  resolve: {
    alias: { "@": resolve(__dirname, "src") },
  },
  build: {
    target: "es2022",
    sourcemap: false,
    chunkSizeWarningLimit: 8000,
  },
});
