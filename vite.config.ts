import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173
  },
  build: {
    // Tanda 3 (Fase 78) — division del bundle: separa las librerias pesadas en
    // fragmentos propios (cacheables y paralelizables) sin cambiar tecnologia
    // ni comportamiento de la aplicacion. El orden importa: drei y fiber
    // contienen "three" en su nombre, se evaluan antes que el nucleo.
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("@react-three/drei")) return "vendor-drei";
          if (id.includes("@react-three/fiber")) return "vendor-fiber";
          if (id.includes("three")) return "vendor-three-core";
          if (id.includes("react") || id.includes("scheduler")) return "vendor-react";
          return "vendor-misc";
        }
      }
    }
  }
});

