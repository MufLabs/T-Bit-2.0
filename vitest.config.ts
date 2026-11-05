import { defineConfig } from "vitest/config";

// Fase 0 — Harness de tests (blueprint TBit_AI_Evolution_Blueprint.md, correccion C4).
// - fileParallelism: false -> serializa archivos para evitar interferencias entre
//   el estado de sesion global de TBitChatEngine y los contenedores de almacenamiento temporales.
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false,
    pool: "forks"
  }
});
