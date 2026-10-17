import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// region: proxy
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // The browser talks to Vite (same origin), and Vite forwards /api to FastAPI.
    // That means no CORS problems in development, and the code uses the same URLs as in production.
    proxy: { "/api": process.env.API_URL ?? "http://localhost:8000" },
  },
  test: { environment: "node" },
});
// endregion: proxy
