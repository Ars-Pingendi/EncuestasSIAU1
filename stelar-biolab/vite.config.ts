import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Base relativa para que el build funcione servido desde cualquier subruta.
export default defineConfig({
  plugins: [react()],
  base: "./",
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
});
