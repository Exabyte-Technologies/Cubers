import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  optimizeDeps: { include: ["@cubers/core"] },
  build: {
    commonjsOptions: { include: [/node_modules/, /packages\/core\/dist/] },
  },
  server: { proxy: { "/v1": "http://127.0.0.1:3000" } },
});
