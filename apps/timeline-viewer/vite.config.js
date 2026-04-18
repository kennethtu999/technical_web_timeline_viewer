import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

const timelineServerOrigin = process.env.TIMELINE_SERVER_ORIGIN || "http://127.0.0.1:4174";

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 4173,
    proxy: {
      "/api": {
        target: timelineServerOrigin,
        changeOrigin: true,
      },
      "/assets": {
        target: timelineServerOrigin,
        changeOrigin: true,
      },
    },
  },
});
