import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

// Local-first Android build: everything (JS, CSS, WASM, workers) must resolve
// to bundled assets — no external URLs. `scripts/check-offline.mjs` enforces
// this on the dist output after every build.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  build: {
    // Android WebView is evergreen Chromium; no legacy targets needed.
    target: "es2022",
    chunkSizeWarningLimit: 2000,
  },
  worker: {
    format: "es",
  },
});
