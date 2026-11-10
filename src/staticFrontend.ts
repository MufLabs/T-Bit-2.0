/**
 * staticFrontend — Tanda 4 (Fase 79): correccion de la regresion del frontend.
 *
 * Entrega del frontend compilado (Q-Vault OS) desde el proceso del API con los
 * tipos de contenido correctos. Causa raiz corregida: un middleware global de
 * server.ts fijaba `Content-Type: application/json` en TODAS las respuestas y
 * la libreria `send` (express.static / res.sendFile) no sobreescribe un
 * Content-Type ya presente, de modo que el HTML se entregaba como JSON y el
 * navegador lo mostraba como texto.
 *
 * Contrato:
 *  - `/` y recursos existentes: servidos por express.static con su MIME real
 *    (text/html, text/javascript, text/css, ...).
 *  - `/assets/*` inexistente: 404 JSON, NUNCA el HTML de la SPA.
 *  - Fallback SPA: solo para navegacion (Accept incluye text/html) y nunca
 *    para /api ni /assets.
 *  - Cabecera X-Content-Type-Options: nosniff en todas las respuestas.
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import express from "express";
import type { Express, NextFunction, Request, RequestHandler, Response } from "express";

/** Cabeceras de seguridad coherentes para toda respuesta (API y estaticos). */
export const securityHeadersMiddleware: RequestHandler = (_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  next();
};

/**
 * Registra la entrega estatica del frontend construido sobre la app Express.
 * Devuelve true si existe dist/index.html y el frontend queda registrado.
 * Debe llamarse DESPUES de todas las rutas /api para no sombrearlas.
 */
export function registerStaticFrontend(app: Express, frontendDistDir: string): boolean {
  const frontendIndexHtml = resolve(frontendDistDir, "index.html");
  if (!existsSync(frontendIndexHtml)) {
    return false;
  }

  app.use(securityHeadersMiddleware);

  // 1) Archivos existentes con su Content-Type real (index.html incluido en /).
  //    express 4 resuelve .js como "application/javascript"; la directiva de
  //    entrega exige "text/javascript", se fija explicitamente.
  app.use(
    express.static(frontendDistDir, {
      index: "index.html",
      setHeaders: (res, filePath) => {
        if (/\.(js|mjs)$/i.test(filePath)) {
          res.setHeader("Content-Type", "text/javascript; charset=UTF-8");
        }
      },
    }),
  );

  // 2) Recursos /assets inexistentes: 404 JSON; el HTML de la SPA nunca
  //    enmascara un recurso que falta (eso degradaba el diagnostico).
  app.use("/assets", (_req: Request, res: Response) => {
    res.status(404).json({ ok: false, error: "Recurso estatico no encontrado." });
  });

  // 3) Reserva SPA solo para navegacion: si el cliente no acepta text/html
  //    (por ejemplo fetch de un recurso), se continua hacia el 404 normal.
  app.get(/^\/(?!api(\/|$)).*/, (req: Request, res: Response, next: NextFunction) => {
    const accept = req.headers.accept;
    if (typeof accept === "string" && accept.length > 0 && !accept.includes("text/html")) {
      next();
      return;
    }
    res.sendFile(frontendIndexHtml, (error) => {
      if (error) next(error);
    });
  });

  return true;
}
