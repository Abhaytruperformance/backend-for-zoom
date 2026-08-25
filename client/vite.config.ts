import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:4000",
    },
    // ngrok (and similar tunnels) sit in front with a hostname Vite doesn't recognize by
    // default — it blocks unrecognized Host headers (DNS-rebinding protection) unless allowed.
    allowedHosts: [".ngrok-free.dev", ".ngrok-free.app", ".ngrok.io", ".ngrok.app"],
  },
});
