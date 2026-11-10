#!/usr/bin/env node
/**
 * verify-bundle.cjs — Tanda 4 (Fase 79): verificacion del bundle compilado.
 *
 * Ejecuta `vite build` y FALLA si:
 *  1. Rollup emite el aviso "Circular chunk" (orden de inicializacion roto:
 *     causa raiz de la pantalla negra en vite preview de la Fase 78).
 *  2. dist/frontend/index.html precarga (modulepreload) three, fiber o drei:
 *     la pila 3D debe cargarse SOLO mediante importacion dinamica al abrir una
 *     vista 3D, nunca en la carga inicial de Q-Vault OS.
 *
 * Uso: npm run verify:bundle   (paso obligatorio en CI tras `npm run build`)
 */
const { spawnSync } = require("node:child_process");
const { existsSync, readFileSync } = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const viteBin = path.join(root, "node_modules", "vite", "bin", "vite.js");
const indexPath = path.join(root, "dist", "frontend", "index.html");

console.log("[verify:bundle] Ejecutando vite build...");
const result = spawnSync(process.execPath, [viteBin, "build"], { cwd: root, encoding: "utf8" });
const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
process.stdout.write(result.stdout ?? "");
process.stderr.write(result.stderr ?? "");

if (result.status !== 0) {
  console.error("[verify:bundle] FALLO: vite build termino con codigo " + result.status);
  process.exit(result.status ?? 1);
}

const problems = [];

if (/Circular chunk/i.test(output)) {
  problems.push("Rollup emitio 'Circular chunk': la division manual de fragmentos crea dependencias circulares.");
}

if (!existsSync(indexPath)) {
  problems.push(`No existe ${path.relative(root, indexPath)}: el build no dejo el frontend donde el servidor lo espera.`);
} else {
  const html = readFileSync(indexPath, "utf8");
  const preloads = html.match(/<link[^>]*modulepreload[^>]*>/gi) ?? [];
  for (const tag of preloads) {
    if (/(three|fiber|drei)/i.test(tag)) {
      problems.push(`index.html precarga la pila 3D (debe ser importacion dinamica): ${tag}`);
    }
  }
  console.log(`[verify:bundle] modulepreload en index.html: ${preloads.length}`);
}

if (problems.length > 0) {
  console.error("[verify:bundle] FALLO con " + problems.length + " problema(s):");
  for (const problem of problems) {
    console.error("  - " + problem);
  }
  process.exit(1);
}

console.log("[verify:bundle] OK: sin chunks circulares y sin precarga de three/fiber/drei.");
