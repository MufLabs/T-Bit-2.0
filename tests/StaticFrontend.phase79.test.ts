/**
 * StaticFrontend.phase79.test.ts — Tanda 4 (Fase 79).
 *
 * Pruebas de la entrega estatica del frontend compilado con un servidor HTTP
 * real (express + app.listen en puerto efugitivo). Reproducen la causa raiz de
 * la regresion: un Content-Type incorrecto convertia la interfaz en texto, y
 * la reserva SPA devolvia HTML para recursos inexistentes.
 *
 * El montaje replica exactamente el orden de server.ts:
 *   securityHeadersMiddleware -> middleware JSON de /api -> registerStaticFrontend.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "node:http";
import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { registerStaticFrontend, securityHeadersMiddleware } from "../src/staticFrontend";

const INDEX_HTML = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <title>T-BIT CORE v1.1</title>
    <script type="module" src="/assets/app-test.js"></script>
    <link rel="stylesheet" href="/assets/app-test.css" />
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>`;

let server: Server;
let baseUrl: string;
let distDir: string;

beforeAll(async () => {
  distDir = mkdtempSync(join(tmpdir(), "tbit-static-frontend-"));
  mkdirSync(join(distDir, "assets"), { recursive: true });
  writeFileSync(join(distDir, "index.html"), INDEX_HTML, "utf8");
  writeFileSync(join(distDir, "assets", "app-test.js"), "console.log(\"tbit-test\");\n", "utf8");
  writeFileSync(join(distDir, "assets", "app-test.css"), "body { color: red; }\n", "utf8");

  const app = express();
  app.use(securityHeadersMiddleware);
  // Replica del middleware de server.ts: JSON solo para /api.
  app.use("/api", (_request, response, next) => {
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    next();
  });
  app.get("/api/test", (_request, response) => {
    response.json({ ok: true, api: true });
  });
  const registered = registerStaticFrontend(app, distDir);
  expect(registered).toBe(true);

  await new Promise<void>((resolveListen) => {
    server = app.listen(0, "127.0.0.1", () => resolveListen());
  });
  const address = server.address();
  if (typeof address !== "object" || address === null) throw new Error("Sin direccion de servidor");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(() => {
  server?.close();
  if (distDir) rmSync(distDir, { recursive: true, force: true });
});

describe("StaticFrontend — entrega del frontend compilado (Tanda 4, Fase 79)", () => {
  it("GET / devuelve el HTML con Content-Type text/html y charset utf-8", async () => {
    const response = await fetch(baseUrl + "/");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect((response.headers.get("content-type") ?? "").toLowerCase()).toContain("utf-8");
    const body = await response.text();
    expect(body).toContain('<div id="root">');
  });

  it("GET / incluye la cabecera X-Content-Type-Options: nosniff", async () => {
    const response = await fetch(baseUrl + "/");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("cada recurso referenciado por index.html se sirve con su Content-Type real", async () => {
    const jsResponse = await fetch(baseUrl + "/assets/app-test.js");
    expect(jsResponse.status).toBe(200);
    expect(jsResponse.headers.get("content-type")).toContain("text/javascript");

    const cssResponse = await fetch(baseUrl + "/assets/app-test.css");
    expect(cssResponse.status).toBe(200);
    expect(cssResponse.headers.get("content-type")).toContain("text/css");
  });

  it("ningun recurso devuelve HTML: un asset inexistente responde 404 JSON", async () => {
    const response = await fetch(baseUrl + "/assets/recurso-inexistente.js");
    expect(response.status).toBe(404);
    const contentType = response.headers.get("content-type") ?? "";
    expect(contentType).toContain("application/json");
    const body = await response.text();
    expect(body).not.toContain("<div id=\"root\">");
    expect(body).not.toContain("<!doctype html");
  });

  it("la reserva SPA responde HTML solo para navegacion (Accept: text/html)", async () => {
    const response = await fetch(baseUrl + "/panel/memoria", {
      headers: { Accept: "text/html,application/xhtml+xml" }
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(await response.text()).toContain('<div id="root">');
  });

  it("la reserva SPA NO captura peticiones que no son navegacion", async () => {
    const response = await fetch(baseUrl + "/panel/memoria", {
      headers: { Accept: "application/json" }
    });
    expect(response.status).toBe(404);
    expect((await response.text())).not.toContain('<div id="root">');
  });

  it("la reserva SPA nunca intercepta /api", async () => {
    const response = await fetch(baseUrl + "/api/test");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toEqual({ ok: true, api: true });
  });

  it("registerStaticFrontend devuelve false cuando no existe el frontend construido", () => {
    const app = express();
    expect(registerStaticFrontend(app, join(tmpdir(), "tbit-directorio-inexistente-xyz"))).toBe(false);
  });
});
