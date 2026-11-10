import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173
  },
  build: {
    // Tanda 4 (Fase 79): el frontend compila en dist/frontend para NO compartir
    // outDir con la logica de servidor (tsc -p tsconfig.node.json escribe
    // dist/*.js). Antes, `vite build` vaciaba dist/ y borraba dist/server.js.
    outDir: "dist/frontend"
    // Tanda 4 (Fase 79): SIN manualChunks. La division manual de fragmentos
    // (vendor-misc/vendor-react en la Fase 78, y luego three/fiber/drei)
    // creaba chunks circulares ("vendor-misc -> vendor-react -> vendor-misc",
    // "vendor-fiber -> vendor-three-core -> vendor-fiber") que rompen el orden
    // de inicializacion del bundle (pantalla negra en vite preview). La pila 3D
    // (three/fiber/drei) ahora es exclusiva del modulo de importacion dinamica
    // src/quantum/QuantumScenes.tsx (React.lazy en App.tsx): Rollup la coloca
    // solo en el chunk asincrono, sin fronteras artificiales ni ciclos, y nunca
    // aparece en el modulepreload de index.html. Lo verifica `npm run
    // verify:bundle` (obligatorio en CI).
  }
});

