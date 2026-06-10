import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: "desktop/renderer",
  base: "./",
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true
  },
  build: {
    outDir: "../../dist/desktop/renderer",
    emptyOutDir: true
  },
  resolve: {
    alias: {
      "@renderer": "/desktop/renderer/src",
      "@shared": "/shared"
    }
  }
});
