# PLAN_EVOLUCION.md — Plan de Evolución T-BIT CORE v1.1

**Rama de trabajo:** `feature/evolucion-tbit` (creada desde `main` @ `bcf7988`)
**Fuente documental única:** `docs/T-BIT_BOOK.md` (leído completo, 4.134 líneas, 63 fases registradas)
**Fecha de inicio:** 2026-11-04

---

## 0. Línea base verificada (FASE A — ejecutada)

| Verificación | Comando | Resultado |
|---|---|---|
| Tests | `npm test` | ✅ 26/26 PASS (4 archivos) |
| Build frontend | `npm run build` | ✅ OK (vite 6.4.2, warning de chunk >500 kB, no bloqueante) |
| Build lógico | `npm run logic:build` | ✅ OK |
| Type-check | `npx tsc --noEmit` | ✅ OK **después** de `logic:build` |

**Nota de causa raíz (TS6305):** `tsconfig.json` referencia `tsconfig.node.json` (composite, `outDir: dist`). Si `dist/` está obsoleto respecto a las fuentes, `npx tsc --noEmit` falla con `TS6305`. No es un error de código: se resuelve ejecutando `npm run logic:build` antes del type-check. Queda documentado como procedimiento, no se modifica la configuración de builds existente.

**Estado real del código vs libro:** el libro prevalece como documento; el código coincide con las fases 1–63 descritas (verificado por lectura directa de `TBitFileSystem.ts`, `TBitStorageService.ts`, `memoryCore.ts`, `queryIndex.ts`, `TBitChatEngine.ts`, `AiProviderFactory.ts`, `server.ts` y la suite de tests).

**Inventario de agentes:** 18 especificaciones en `.github/agents/*.agent.md`, congeladas por `tests/agentSpecs.inventory.test.ts`. Contrato de frontmatter: `name`, `description`, `capabilities`, `tools`, `argument-hint` presentes; `permissions`/`modelRequirements` ausentes (gap cubierto por PolicyOverlay en el runtime, sin modificar los markdown).

---

## 1. Orden de tandas

| Tanda | Objetivo | Alcance | Estado |
|---|---|---|---|
| T0 | Gobernanza | Rama, PLAN, DECISIONES, commit base | ✅ Hecha |
| T1 | Objetivo 1 | Runtime multi-agente: `AgentSpecLoader`, `AgentEventBus`, `AgentOrchestrator` (pool asíncrono, sin dependencias nuevas), endpoints `/api/agents/*`, tests | ✅ Hecha (Fase 64) |
| T2 | Objetivo 2 | `FallbackProviderChain` en `AiProviderFactory.ts`/`UniversalAiProviders.ts`: failover 429/5xx/timeout/cuota, cooldown, monitoreo de latencia, cadena configurable por env | ✅ Hecha (Fase 65) |
| T3 | Objetivo 3 | Memoria evolutiva: persistencia automática de ejecuciones de agentes/consenso en `memoryCore` + verificación cruzada con `documentQa`/`queryIndex` antes de respuestas definitivas | ✅ Hecha (Fase 66) |
| T4 | Objetivo 4 | `DynamicSkillManager.ts`: catálogo local + repos de referencia, skills declarativas (.md/.json), integridad sha256 + commit fijado, permisos vía `aiPermissions.ts`, integración con `TBitToolSchemas.ts`/`TBitLocalToolExecutor.ts` | ✅ Hecha (Fase 67) |
| T5 | Objetivos 5–6 | UX Q-Vault OS: indicadores de razonamiento multi-agente/failover, pulido visual, paridad multiplataforma dentro del stack | ✅ Hecha (Fase 68) |
| T6 | Auditoría | Suite completa PASS, smoke E2E, libro actualizado, `INFORME_EVOLUCION.md` | Pendiente |

Cada tanda termina con: `npm test` en PASS, `npx tsc --noEmit` limpio, commit atómico y libro actualizado en el mismo incremento.

---

## 2. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| No romper el motor `.tbit` ni la API existente | Todo el código nuevo vive en módulos nuevos (`src/agents/`, `src/skills/`); `server.ts` solo recibe rutas nuevas; cero cambios en `TBitFileSystem.ts`/`TBitStorageService.ts` salvo corrección de bug demostrada |
| Proveedores IA remotos sin claves en este entorno | Cadena de failover con proveedor determinista local como último eslabón; tests con providers falsos; proveedores remotos marcados como "no verificado en runtime" |
| Repos de skills externos inaccesibles o mutables | Skills remotas opcionales, desactivadas por defecto, con commit fijado por env y verificación sha256; el catálogo local siempre funciona offline |
| `App.tsx` tiene 5.563 líneas (alto riesgo de regresión UI) | Cambios de UX aditivos: componentes nuevos + wiring mínimo; Quantum Engine intacto |
| Contexto/recursos limitados | Punto limpio al final de cada tanda: tests verdes + commit; estado exacto registrado aquí |

---

## 3. Estado para retomar (se actualiza al cierre de cada tanda)

- **Última tanda completada:** T4 — Skills dinámicas (Fase 67). 57/57 tests PASS, smoke real del ejecutor de herramientas: buscar/ejecutar/instalar skill con verificación de integridad. Libro actualizado (sección 25.33).
- **Última tanda completada:** T5 — UX del runtime multi-agente (Fase 68). `AgentRuntimePanel` montado en Q-Vault OS; build frontend PASS, 57/57 tests. Libro actualizado (sección 25.34).
- **Tanda 2 en curso (2026-11-06):** P1 HECHO (Fase 69, `fb3b371`): agentes reales contra cadena de failover con atribución de proveedor y mock 429/503/timeout. P2 HECHO (Fase 70, `c2830c8`): mutex async en memoryCore + estrés 18 agentes/journal/Q-Vault/WAL sin pérdidas. P3 HECHO (Fase 71, `1db66ae`): defaults oficiales Grok/xAI y Qwen, auditoría uno por uno (14 tests), free-tier con fecha 2026-11-05, visibilidad del eslabón determinista en API y chat. P4 HECHO (Fase 72, `098fbaa`): anti-alucinación integrada en el chat principal (hooks vaultContextProvider/vaultVerifier/interactionPersister, wikilinks e índice semántico, best-effort). P5 HECHO (Fase 73): skills remotas verificadas contra red real — `listRemoteCatalog` (indexación vía API GitHub), manifiesto `skills/remote-catalog.json` con 8 skills reales verificadas (repo@commit+sha256, fecha 2026-11-06), `installFromCatalog` con verificación de integridad y rechazo de manipulación; catálogo 3 semilla + 8 remotas. 89/89 tests, tsc limpio.
- **Pendiente Tanda 2:** cierre INFORME_EVOLUCION.md "Tanda 2". (CERRADO: commit `a1fd804`.)
- **Tanda 3 en curso (2026-11-07):** P1 HECHO (Fase 74): auditoría de portabilidad limpia en 8 puntos (rutas, scripts npm, child_process, casing, EOL, APIs de archivo, locks `wx`, rename atómico); gap corregido por causa raíz — guard de instancia única en `server.ts` (`acquireServerInstanceLock`, lock `wx` + vitalidad por PID señal 0, reclamo de huérfanos) que impide dos procesos de servidor sobre el mismo vault, cerrando la debilidad intraproceso de `withIndexWriteLock`. Verificado en runtime: arranque, rechazo de segunda instancia (`SERVER_ALREADY_RUNNING`), no-robo del lock, muerte forzada y reclamo posterior. 89/89 tests, tsc 0 errores.
- **Pendiente Tanda 3:** (CERRADA — ver INFORME_EVOLUCION.md "Tanda 3"). P6 HECHO (Fase 78): Ollama (11434) y LM Studio (1234) NO ACCESIBLES en este entorno (ECONNREFUSED) — conectores NO VERIFICADOS en runtime, sin inventar resultados. P7 HECHO (Fase 78): `manualChunks` en vite.config.ts — bundle de 1.403 kB (1 chunk) a 7 fragmentos (app 261,6 kB; three-core 810,6 kB aislado; react 260,3 kB); verificado en runtime con el lanzador (frontend 200, chunk de app carga). Carga bajo demanda total de Quantum Engine diferida (extraer escena 3D de App.tsx = alto riesgo de regresión). P2 HECHO (Fase 75): `.github/workflows/ci.yml` creado con matriz ubuntu/macos/windows (`npm ci`, `logic:build`, `tsc --noEmit`, `npm test`, `npm run build`); sin push en esta sesión, paridad macOS/Linux NO VERIFICADA hasta ejecutar el flujo. P3+P4 HECHOS (Fase 76): design system en index.css (tokens + primitivas + accesibilidad), `src/components/ui/StateViews.tsx` (loading/empty/error accesibles) integrado en AgentRuntimePanel, aviso del eslabón determinista como banner ámbar distintivo y chip "Motor de respuesta" en el chat de Q-Vault OS; visual NO VERIFICADO (sin herramienta de navegador). P5 HECHO (Fase 77): empaquetado desktop sin dependencias nuevas — `scripts/launch-desktop.cjs` (`npm run start:desktop`) + serving del frontend desde el proceso del API (D-005); smoke verificado en Windows (frontend 200, API 401 sin clave, proceso único); macOS/Linux NO VERIFICADO.
- **Comandos de verificación:** `npm test`, `npm run logic:build`, `npx tsc --noEmit`, `npm run build`.
- **Nota de entorno:** en PowerShell, `npm ... 2>&1` convierte los avisos de stderr de npm en errores falsos; ejecutar los comandos npm sin redirección.
