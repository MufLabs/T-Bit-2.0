#!/usr/bin/env node
/**
 * launch-desktop.cjs — Tanda 3 (Fase 77): empaquetado de escritorio.
 *
 * Lanzador multiplataforma (Windows/macOS/Linux) SIN dependencias nuevas:
 *  1. Verifica que existan los artefactos construidos (frontend dist/index.html
 *     y logica dist/server.js); si faltan, los construye con el toolchain ya
 *     instalado (vite / tsc del propio node_modules).
 *  2. Arranca UN unico proceso de servidor (node dist/server.js). El guard de
 *     instancia unica de server.ts (acquireServerInstanceLock) garantiza que no
 *     haya dos procesos sobre el mismo almacenamiento del vault.
 *  3. Espera a que la API responda y abre el navegador del sistema en la app.
 *
 * Uso: npm run start:desktop   (o node scripts/launch-desktop.cjs)
 */
const { spawn, spawnSync } = require("node:child_process");
const { existsSync } = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const root = path.join(__dirname, "..");
const frontendIndex = path.join(root, "dist", "frontend", "index.html");
const serverEntry = path.join(root, "dist", "server.js");
const viteBin = path.join(root, "node_modules", "vite", "bin", "vite.js");
const tscBin = path.join(root, "node_modules", "typescript", "bin", "tsc");
const port = Number(process.env.PORT || 3000);
const url = `http://localhost:${port}`;

function buildStep(args, label) {
  console.log(`[desktop] ${label}...`);
  const result = spawnSync(process.execPath, args, { cwd: root, stdio: "inherit" });
  if (result.status !== 0) {
    console.error(`[desktop] Fallo en: ${label}`);
    process.exit(result.status ?? 1);
  }
}

if (!existsSync(frontendIndex)) {
  buildStep([viteBin, "build"], "Construyendo frontend (vite build)");
}
if (!existsSync(serverEntry)) {
  buildStep([tscBin, "-p", "tsconfig.node.json"], "Construyendo logica (tsc)");
}

console.log("[desktop] Arrancando T-BIT API (proceso unico)...");
const server = spawn(process.execPath, [serverEntry], { cwd: root, stdio: "inherit" });

server.on("exit", (code) => {
  console.log(`[desktop] Servidor finalizado (codigo ${code ?? 0}).`);
  process.exitCode = code ?? 0;
});

function shutdown(signal) {
  console.log(`[desktop] Cerrando (${signal})...`);
  if (!server.killed) {
    server.kill(signal);
  }
}
process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));

function waitForServer(attempt = 0) {
  const request = http.get(url, (response) => {
    response.resume();
    openBrowser();
  });
  request.on("error", () => {
    if (attempt > 120) {
      console.error("[desktop] El servidor no respondio a tiempo; abre manualmente " + url);
      return;
    }
    setTimeout(() => waitForServer(attempt + 1), 500);
  });
}

function openBrowser() {
  console.log(`[desktop] Abriendo Q-Vault OS en ${url}`);
  try {
    if (process.platform === "win32") {
      spawn("cmd.exe", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
    } else if (process.platform === "darwin") {
      spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
    } else {
      spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
    }
  } catch (error) {
    console.log(`[desktop] No se pudo abrir el navegador automaticamente: abre ${url}`);
  }
}

waitForServer();
