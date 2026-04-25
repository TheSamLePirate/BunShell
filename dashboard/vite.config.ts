import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:7483",
        rewrite: (path) => path.replace(/^\/api/, ""),
        changeOrigin: true,
      },
      // SSE /events is NOT proxied — the hook connects directly to the
      // BunShell server because Vite's http-proxy closes long-lived
      // streaming connections with "socket hang up".
    },
  },
});
