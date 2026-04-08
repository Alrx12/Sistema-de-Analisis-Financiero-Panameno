import path from "path"
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 3000,
    allowedHosts: ["lex-luthor-corp.tailfef861.ts.net", ".loca.lt"],
    proxy: {
      "/api": {
        target: "http://localhost:8001",
        changeOrigin: true,
      },
    },
  },
  build: {
    // Sube el límite del warning a 600 KB para no ver falsos positivos
    // después de partir los chunks (los vendor chunks son legítimamente grandes)
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // ── Recharts — la lib de gráficas más pesada (~300 KB) ──────────────
          if (id.includes("node_modules/recharts") ||
              id.includes("node_modules/d3-") ||
              id.includes("node_modules/victory-")) {
            return "vendor-charts"
          }

          // ── React core + router — se carga en CADA visita, debe ser pequeño
          if (id.includes("node_modules/react/") ||
              id.includes("node_modules/react-dom/") ||
              id.includes("node_modules/react-router") ||
              id.includes("node_modules/scheduler/")) {
            return "vendor-react"
          }

          // ── Radix UI + shadcn — componentes de UI (~150 KB) ─────────────────
          if (id.includes("node_modules/@radix-ui/") ||
              id.includes("node_modules/cmdk") ||
              id.includes("node_modules/class-variance-authority") ||
              id.includes("node_modules/clsx") ||
              id.includes("node_modules/tailwind-merge")) {
            return "vendor-ui"
          }

          // ── TanStack Query + Zustand — state management ──────────────────────
          if (id.includes("node_modules/@tanstack/") ||
              id.includes("node_modules/zustand/")) {
            return "vendor-state"
          }

          // ── Axios + date-fns + utilidades misceláneas ────────────────────────
          if (id.includes("node_modules/axios") ||
              id.includes("node_modules/date-fns") ||
              id.includes("node_modules/lucide-react")) {
            return "vendor-utils"
          }
        },
      },
    },
  },
})
