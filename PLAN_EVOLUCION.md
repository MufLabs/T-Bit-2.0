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
| T1 | Objetivo 1 | Runtime multi-agente: `AgentSpecLoader`, `AgentEventBus`, `AgentOrchestrator` (pool asíncrono, sin dependencias nuevas), endpoints `/api/agents/*`, tests | ⏳ En curso |
| T2 | Objetivo 2 | `FallbackProviderChain` en `AiProviderFactory.ts`/`UniversalAiProviders.ts`: failover 429/5xx/timeout/cuota, cooldown, monitoreo de latencia, cadena configurable por env | Pendiente |
| T3 | Objetivo 3 | Memoria evolutiva: persistencia automática de ejecuciones de agentes/consenso en `memoryCore` + verificación cruzada con `documentQa`/`queryIndex` antes de respuestas definitivas | Pendiente |
| T4 | Objetivo 4 | `DynamicSkillManager.ts`: catálogo local + repos de referencia, skills declarativas (.md/.json), integridad sha256 + commit fijado, permisos vía `aiPermissions.ts`, integración con `TBitToolSchemas.ts`/`TBitLocalToolExecutor.ts` | Pendiente |
| T5 | Objetivos 5–6 | UX Q-Vault OS: indicadores de razonamiento multi-agente/failover, pulido visual, paridad multiplataforma dentro del stack | Pendiente |
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

- **Última tanda completada:** T0 (gobernanza).
- **Siguiente acción:** implementar T1 (runtime multi-agente) según alcance de la tabla §1.
- **Comandos de verificación:** `npm test`, `npm run logic:build`, `npx tsc --noEmit`, `npm run build`.
