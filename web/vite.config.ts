import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  root: import.meta.dirname,
  plugins: [react()],
  build: {
    outDir: resolve(import.meta.dirname, "..", "dist", "web"),
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom"],
          markdown: ["react-markdown"],
        },
      },
    },
  },
  server: { host: "127.0.0.1" },
});
