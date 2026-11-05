# PLAN — Completar T-Bit 2.0 (rama `feature/completar-app`)

> Fecha: 2026-10-07. Basado en evidencia verificada ejecutando el repositorio
> (ver `engineering/reports/AI-EVOLUTION-BASELINE.md` y la sección
> "Línea base verificada" más abajo). Este plan se actualiza conforme avanza el trabajo.

## Línea base verificada (ejecutada, no asumida)

| Verificación | Resultado |
|---|---|
| `npm test` (vitest, 4 archivos) | **24 passed / 2 failed (26)** — falla `tests/agentSpecs.inventory.test.ts` (L93 y L126) |
| `npx tsc --noEmit` (frontend `src/`) | **FAIL — 33 errores** en 19 archivos (mayoría `import.meta.env` sin tipos `vite/client`) |
| `npm run logic:build` (tsc backend) | **PASS — 0 errores** |
| `npm run build` (vite) | **PASS** (warning: chunk JS 1.39 MB) |
| Arranque `npx tsx server.ts` | **OK** — API en :3000, recovery WAL completado |
| `GET /api/health/container` | **OK** — status HEALTHY |
| `POST /api/inyectar` / `POST /api/recuperar` | **OK** — escritura física + integridad confirmada |
| `POST /api/ai/chat` (provider determinista) | **OK** — tool-loop con `memorizar_en_vacio` persistiendo en `ai_memoria.tbit` |
| Protección API key de TODOS los endpoints `/api` | **VERIFICADA** — middleware global `app.use("/api", ...)` (server.ts L268); sin llave → 401 |

### Inventario del análisis

**Implementado y funcionando (verificado):**

- Motor de storage: `TBitStorageService` + `TBitFileSystem` (Vit/Anti-Vit, AES-256-GCM, HMAC, WAL, snapshots, probing determinista, cuotas dinámicas, batch).
- API Express (57 endpoints): raw, IA, memory core, query/semantic index, health, assets, markdown, red/anti-entropía, permisos IA, espacios de usuario.
- Capa IA: `TBitChatEngine` (ruta SIMPLE con tool-loop de 2 pasos), `AiProviderFactory` (10 providers), `TBitLocalToolExecutor` (7 tools, todas declaradas en `TBitToolSchemas` — incluida `operar_simbolicamente` vía `tbitSymbolicTools`), permisos IA.
- Frontend React/Three.js: `src/App.tsx` (monolito 285 KB) + componentes/clients.
- Harness de tests vitest (4 suites) y `npm run agents:inventory`.

**Roto o desactualizado:**

1. [P1] `tests/agentSpecs.inventory.test.ts` congelado en baseline de 17 agentes; el repo tiene 18 (commit `c434507` añadió `GraphEngineeringAgent.agent.md`, que el roadmap de ingeniería declara autoritativo). **2 tests fallan.**
2. [P2] `npx tsc --noEmit` falla con 33 errores de tipos en `src/` (bloquea cualquier CI estricto).
3. [P9] `docs/ProjectSnapshot.txt` desactualizado: lista archivos inexistentes (`eslint.config.js`, clients con nombres viejos, ~10 componentes "faltantes" que en realidad viven dentro de `App.tsx`) y omite `tests/`, `vitest.config.ts`, `scripts/agent-inventory.cjs`, `GraphEngineeringAgent.agent.md`.
4. [P10] `docs/README.md` declara `engineering_tree.txt` superseded pero el archivo sigue en `engineering/` (contradicción declarativa).
5. [P11] `PROJECT_STATE.MD`, `engineering/reports/PHASE-0-AGENT-INVENTORY.md` y `phase-0-agent-inventory.json` dicen "17 agentes" y "GraphEngineeringAgent no existe" — falso hoy.
6. `engineering/reports/AI-EVOLUTION-BASELINE.md` (Phase 0 del roadmap) está **sin commitear**; además sus hallazgos P3 y P4 son **falsos positivos** verificados en runtime (los endpoints `api/ai/inject|oracle` SÍ están protegidos por el middleware global; `operar_simbolicamente` SÍ está declarada en los schemas).
7. Menor: comparación de API key con `!==` (no timing-safe) en los dos middlewares de server.ts.

**Deuda técnica conocida (no bloqueante, registrada, fuera del alcance de esta pasada):**

- Bundle frontend 1.39 MB en un chunk (App.tsx monolítico) [P7].
- `sessionHistories` del chat en memoria (se pierde al reiniciar) [P6].
- Duplicación legacy `TBitAiBridge` vs `TBitPrompts`/`TBitToolSchemas` [P5].
- Agent runtime multi-agente (fases 1–11 del roadmap de evolución IA): DOCUMENTATION ONLY por diseño; no se implementa en esta pasada (no es requerido para que la app funcione).
- Empaquetado desktop/instalador: pendiente declarado en la evaluación final.

## Prioridades y ejecución

1. **(Arranque/funcionamiento)** Ya verificado que la app arranca y los flujos principales funcionan. Se re-verificará al final.
2. **(Tests)** Incremento A: actualizar `tests/agentSpecs.inventory.test.ts` al baseline real de 18 agentes (Graph Engineering Agent presente y con contrato válido) + regenerar `phase-0-agent-inventory.json` + actualizar `PHASE-0-AGENT-INVENTORY.md` y `PROJECT_STATE.MD`. Criterio: `npm test` 26/26 en verde.
3. **(Type check)** Incremento B: corregir los 33 errores de `tsc --noEmit` sin cambiar comportamiento: `"types": ["vite/client"]` en `tsconfig.json`, fixes puntuales en `App.tsx` (5), `QuantumTelemetryRay.tsx` (4), `semanticIndexClient.ts`, `networkSyncClient.ts`. Criterio: `npx tsc --noEmit` → 0 errores; `npm run build` sigue PASS.
4. **(Hardening mínimo)** Incremento C: comparación timing-safe de la API key en los dos middlewares (mensajes y códigos idénticos). Verificación runtime 401/200.
5. **(Documentación sincronizada)** Incremento D: `docs/ProjectSnapshot.txt` regenerado contra el árbol real; `docs/README.md` (contradicción resuelta); `PROJECT_STATE.MD`; `docs/T-BIT_BOOK.md` (nueva sección de actualización + sección 20 con `npm test` y `agents:inventory`); addendum P3/P4 + commit de `AI-EVOLUTION-BASELINE.md`; crear `docs/CHANGELOG.md`; `README.md` (estructura corregida).
6. **(Entregables)** Incremento E: `PLAN.md` (este archivo), `DECISIONES.md`, `INFORME_FINAL.md`, commits atómicos en `feature/completar-app`.
7. **(Validación final)** Re-ejecutar: `npm test`, `npx tsc --noEmit`, `npm run build`, `npm run logic:build`, reinicio del servidor y smoke test de flujos (inyectar/recuperar/health/chat).

## Estado de avance

- [x] FASE 1 — Análisis completo (docs + código + runtime).
- [x] FASE 2 — Plan (este archivo).
- [x] Incremento A — Tests del inventario de agentes actualizados al baseline real (18). `npm test` 26/26 PASS.
- [x] Incremento B — `npx tsc --noEmit` PASS (0 errores). `npm run build` PASS.
- [x] Incremento C — API key timing-safe en server.ts. Verificado 401/200 en runtime.
- [x] Incremento D — Documentación sincronizada (book, snapshot, README docs, PROJECT_STATE, baseline, changelog).
- [x] Incremento E — Entregables (DECISIONES.md, INFORME_FINAL.md).
- [x] Validación final re-ejecutada (26/26 PASS, tsc 0 errores, builds PASS, smoke de flujos OK).
