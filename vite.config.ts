import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Two entry points: the editor (index.html) and the read-only embed viewer
// (embed.html). They share src/, and tree-shaking keeps editor-only code out
// of the embed chunk because embed.tsx never imports from src/editor.
export default defineConfig({
  plugins: [react()],
  base: "/riff-notes/",
  build: {
    outDir: "dist",
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        embed: resolve(__dirname, "embed.html"),
      },
    },
  },
});
