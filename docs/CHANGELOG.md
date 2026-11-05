# CHANGELOG — T-Bit 2.0

> Registro de cambios del proyecto. Formato: fecha — descripción — archivos
> afectados — motivo. Los cambios de código y de documentación se registran
> juntos, porque ningún cambio se considera terminado hasta que su
> documentación está actualizada.

---

## 2026-10-07 — Rama `feature/completar-app`: completar la app hasta estado funcional verificado

Trabajo ejecutado sobre la línea base verificada (ver `PLAN.md` y
`INFORME_FINAL.md` en la raíz del repositorio). No se reemplazó ni eliminó
ninguna tecnología, archivo funcional ni dependencia del stack original.

### 1. Test del inventario de agentes actualizado al baseline real (18 specs)

- **Fecha:** 2026-10-07
- **Archivos:** `tests/agentSpecs.inventory.test.ts`,
  `engineering/reports/phase-0-agent-inventory.json` (regenerado con
  `npm run agents:inventory`), `engineering/reports/PHASE-0-AGENT-INVENTORY.md`,
  `.gitignore`
- **Motivo:** el test congelaba un baseline de 17 agentes, pero el commit
  `c434507` añadió `GraphEngineeringAgent.agent.md` como definición autoritativa
  (roadmap de ingeniería §6). Resultado: 2 tests fallando sin causa real. El
  test ahora exige exactamente 18 especificaciones y valida el contrato del
  Graph Engineering Agent. También se gitignoran artefactos runtime
  (`data/spaces/`, `*.tbit.lock`).
- **Verificación:** `npm test` → 26/26 PASS.

### 2. Type-check estricto del frontend en verde (33 errores corregidos)

- **Fecha:** 2026-10-07
- **Archivos:** `tsconfig.json`, `src/App.tsx`, `src/semanticIndexClient.ts`,
  `src/networkSyncClient.ts`, `src/components/QuantumTelemetryRay.tsx`
- **Motivo:** `npx tsc --noEmit` fallaba con 33 errores (P2 del baseline;
  bloqueaba cualquier CI estricto). Cambios:
  - `tsconfig.json`: `"types": ["vite/client"]` para tipar `import.meta.env`
    (20 errores de archivos de clients).
  - `src/App.tsx`: uso de los campos reales del contrato semántico
    (`response.index.model`, `response.index.totalRecords`,
    `result.textPreview`) — esto además corrige mensajes de estado que
    mostraban `undefined` en runtime; predicado de tipo explícito en
    `allPreviewNodes`; null-safety en `isProviderConfigured`.
  - `src/semanticIndexClient.ts`: `rebuild()` tipado según el shape real del
    backend.
  - `src/components/QuantumTelemetryRay.tsx`: los rayos de telemetría se
    construyen como objetos `THREE.Line` imperativos montados con
    `<primitive>` (elimina la colisión de tipos JSX `line`/SVG de R3F) y se
    agrega `computeLineDistances()` para que `LineDashedMaterial` renderice
    guiones como fue diseñado (antes se veían líneas sólidas).
  - `src/networkSyncClient.ts`: anotación de tipo del parámetro `item`.
- **Verificación:** `npx tsc --noEmit` → 0 errores; `npm run build` → PASS;
  `npm test` → 26/26 PASS; `npm run logic:build` → PASS.

### 3. API key local con comparación timing-safe

- **Fecha:** 2026-10-07
- **Archivos:** `server.ts`
- **Motivo:** la API key se comparaba con `!==` (filtraje de timing teórico).
  Ahora se compara con SHA-256 + `crypto.timingSafeEqual`, el mismo patrón
  que el proyecto ya usa para el HMAC de metadata. Mensajes, códigos y
  comportamiento externo sin cambios.
- **Verificación en runtime:** sin llave → 401; llave incorrecta → 401;
  llave válida → 200 `HEALTHY`.

### 4. Documentación sincronizada con el estado real del código

- **Fecha:** 2026-10-07
- **Archivos:** `docs/CHANGELOG.md` (nuevo), `docs/README.md`,
  `docs/ProjectSnapshot.txt`, `docs/T-BIT_BOOK.md`, `PROJECT_STATE.MD`,
  `README.md`, `engineering/reports/AI-EVOLUTION-BASELINE.md` (addendum),
  `PLAN.md`, `DECISIONES.md`, `INFORME_FINAL.md` (nuevos)
- **Motivo:** la documentación describía un estado que ya no era el real:
  - `docs/ProjectSnapshot.txt` listaba archivos inexistentes
    (`eslint.config.js`, clients con nombres antiguos, ~10 componentes que en
    realidad viven consolidados en `App.tsx`) y omitía `tests/`,
    `vitest.config.ts`, `scripts/agent-inventory.cjs` y
    `GraphEngineeringAgent.agent.md`.
  - `PROJECT_STATE.MD` e inventarios decían "17 agentes" y "GraphEngineeringAgent
    no existe" (falso desde `c434507`).
  - `docs/README.md` declaraba `engineering_tree.txt` superseded mientras el
    archivo seguía presente (contradicción aclarada: se conserva como artefacto
    histórico).
  - `AI-EVOLUTION-BASELINE.md` (Phase 0, hasta ahora sin commitear) registraba
    P3 y P4 como fallos; ambos quedaron **refutados** en runtime/lectura de
    código (todos los endpoints `/api` están protegidos por el middleware
    global de API key; `operar_simbolicamente` sí está declarada en
    `TBitToolSchemas.ts` vía `tbitSymbolicTools`). Se añade addendum con la
    evidencia y el archivo se commitea.
  - `docs/T-BIT_BOOK.md`: sección 20 (comandos) actualizada con `npm test`,
    `test:watch` y `agents:inventory`; nueva sección de actualización 2026-10-07.
  - `README.md` (raíz): estructura de repositorio corregida a la real.
- **Verificación:** revisión archivo por archivo contra el árbol real.

### 5. Validación de flujos principales (humo, ejecutada)

- **Fecha:** 2026-10-07
- **Motivo:** criterio de finalización "flujos principales funcionan de punta a
  punta". Ejecutados contra `npx tsx server.ts` (puerto 3000):
  `GET /api/health/container` → HEALTHY; `POST /api/inyectar` →
  ESCRITURA_FISICA_CONFIRMADA; `POST /api/recuperar` → INTEGRIDAD_CONFIRMADA;
  `POST /api/ai/chat` (provider determinista) → respuesta con tool
  `memorizar_en_vacio` persistido en `ai_memoria.tbit`. Detalle y evidencia en
  `INFORME_FINAL.md`.
