# AI-EVOLUTION-BASELINE — PHASE 0 (BASELINE)

> Roadmap canónico: `engineering/AI_EVOLUTION_ROADMAP.md` (§8 PHASE 0 — BASELINE, commit b46575d).
> Git HEAD en el momento del análisis: `b46575d` ("Ai Roadmap"). Árbol de trabajo limpio (`git status --porcelain` vacío).
> Fecha del análisis: 2026-09-24. Modo: análisis factual únicamente. Sin implementación, sin correcciones.
> Clasificaciones: VERIFIED IMPLEMENTATION · PARTIAL IMPLEMENTATION · DOCUMENTATION ONLY · MISSING CAPABILITY · PRE-EXISTING FAILURE · NEW FAILURE · UNKNOWN — REQUIRES VERIFICATION.

---

## 1. ESTRUCTURA DEL REPOSITORIO (VERIFIED IMPLEMENTATION)

```
TBit2.0/
├── server.ts (91 KB)        API Express + storage + IA (monolito backend en raíz)
├── *.ts (~50 módulos)        Storage, IA, memoria, índices, extractores (backend plano en raíz)
├── src/                      Frontend React (App.tsx 285.8 KB monolítico + components/ + clients)
├── tests/                    4 suites vitest (26 tests) — ver §9
├── scripts/                  setup-secret.cjs, dev-vite.cjs, agent-inventory.cjs
├── .github/agents/           18 especificaciones .agent.md (declarativas)
├── .github/standards/        11 estándares de ingeniería MUF Labs
├── .github/templates/        7 plantillas
├── .github/instructions/     3 archivos VACÍOS (0 bytes): ACT_MODE, MUF_ENGINEERING_DIRECTIVE, PLAN_MODE
├── .clinerules               VACÍO (0 bytes)
├── docs/                     Documentación canónica (ver §2)
├── engineering/              ECR, workflows, reports, AI_EVOLUTION_ROADMAP.md, engineering_tree.txt
├── data/                     Contenedores runtime (universo.tbit, ai_memoria.tbit, índices) — NO canónico
└── dist/, node_modules/, replica/, video_frames/   Runtime/generados — NO canónico
```

Historial git: `4b4641f` First Upload · `c9973bf` commit · `c434507` GraphEngineering creation (añade GraphEngineeringAgent.agent.md, 294 líneas) · `b46575d` Ai Roadmap (añade AI_EVOLUTION_ROADMAP.md, 814 líneas).

**Fuera de alcance confirmado como intocado:** Q-Vault, `.tbit`, `TBitFileSystem.ts`, `TBitStorageService.ts`, `AllocationMap.ts`, visualizaciones 2D/3D (`MemoryGraphPanel.tsx`, `QVaultLiveMap.tsx`, `WikiLinksMesh.tsx`, `QuantumTelemetryRay.tsx`). NINGUNO fue modificado por PHASE 0.

---

## 2. INVENTARIO DE DOCUMENTACIÓN

| Documento | Estado | Observación |
|---|---|---|
| `engineering/AI_EVOLUTION_ROADMAP.md` | VERIFIED (como documento) | Roadmap canónico; sus fases 1–11 = DOCUMENTATION ONLY (no implementadas) |
| `docs/T-BIT_BOOK.md` (177 KB) | VERIFIED (parcial vs código) | Libro canónico (roadmap §7). Documenta storage/Vit/Anti-V/WAL/HMAC/AES-GCM. La capa IA moderna está poco documentada (3 menciones de ChatEngine) |
| `docs/README.md` | VERIFIED | **CONTRADICCIÓN:** declara `engineering_tree.txt` superseded; el archivo sigue en `engineering/` |
| `docs/ProjectSnapshot.txt` (2026-08-11) | VERIFIED (desactualizado) | No lista `tests/`, `vitest.config.ts`, `GraphEngineeringAgent.agent.md`, `.github/standards|templates|instructions`; lista archivos inexistentes (`eslint.config.js`, `src/store/useTBitStore.ts`) |
| `docs/T-BIT_PHASE_SUMMARY_2026-08-11.md` | VERIFIED (histórico) | Resumen de fases de producto |
| `docs/T-BIT_EVALUACION_FINAL_2026-08-11.md` | VERIFIED (histórico) | Evaluación previa |
| `docs/AUDITORIA_MULTILLM_SINTESIS.md` (241 KB) | VERIFIED (histórico) | Auditorías multi-LLM previas — hipótesis, no evidencia |
| `docs/Audits/*.docx` (4) | VERIFIED (histórico) | Auditorías externas binarias |
| `.github/standards/` (11 archivos) | DOCUMENTATION ONLY | `REPORT_STANDARD.md` leído completo: estructura estándar de agentes + formato de reportes |
| `.github/templates/` (7 archivos) | DOCUMENTATION ONLY | ADR_TEMPLATE, ROADMAP_TEMPLATE, NEW_AGENT_TEMPLATE, etc. |
| `.github/instructions/` (3) + `.clinerules` | **DOCUMENTATION ONLY (VACÍOS, 0 bytes)** | Placeholders sin contenido |
| `README.md` (raíz) | VERIFIED | Resumen público |
| `engineering/engineering_tree.txt` | OBSOLETO (según docs/README.md) | Snapshot de árbol de disco |

---

## 3. ARQUITECTURA AI EXISTENTE (VERIFIED IMPLEMENTATION)

| Componente | Archivo | Función verificada |
|---|---|---|
| Contrato de provider | `AiProvider.ts` | Interfaz `AiProvider.generateWithTools`; tipos `AiMessage/AiToolCall/AiToolSchema`; `DeterministicTBitProvider` (ruta sin LLM: reglas "recuerda/consulta/cuando" → tool calls) |
| Fábrica de providers | `AiProviderFactory.ts` | Catálogo de **10 descriptors** (§4) + `createAiProviderRuntimeFromConfig` |
| Adaptador OpenAI-compatible | `OpenAICompatibleProvider.ts` | Protocolo openai-compatible |
| Providers universales | `UniversalAiProviders.ts` | Definiciones nativas (gemini/claude) |
| Motor de chat | `TBitChatEngine.ts` | `procesarMensajeUsuario` — ruta SIMPLE única: 1ª llamada `toolChoice:"auto"` → si hay `tool_calls`: ejecuta cada tool vía `toolExecutor`, agrega mensajes `role:"tool"` → 2ª llamada `toolChoice:"none"` → sanitiza. Historial: `Map` **en memoria** (se pierde al reiniciar), clamp `maxHistoryMessages` (default 24). El clamp puede dejar el historial iniciando con un assistant cuyo turno user fue descartado |
| Prompts | `TBitPrompts.ts` | `generarSystemPromptOrquestador` |
| Puente legacy | `TBitAiBridge.ts` | `TBIT_AI_SYSTEM_PROMPT` + `tbitAiTools` — **DUPLICACIÓN** paralela con `TBitPrompts.ts`/`TBitToolSchemas.ts` |
| Ejecutor de tools | `TBitLocalToolExecutor.ts` | 7 tools (§5), con `assertAiPermission` por operación |
| Schemas de tools | `TBitToolSchemas.ts` | `tbitCoreTools`: 6 tools (§5) |
| Permisos IA | `aiPermissions.ts` + `data/ai-permissions.json` + `AiPermissionsPanel.tsx` | Políticas write/read/search/compute/delete, límites de bytes, confirmación humana en delete |
| Memoria IA | `memoryCore.ts` sobre `data/ai_memoria.tbit` | Registros indexados, links/backlinks, grafo de memoria persistente |
| Índices | `queryIndex.ts`, `semanticIndex.ts` | Índice lógico + índice semántico |
| Capas auxiliares | `guardianObserver.ts`, `codeGraphExtractor.ts`, `webResearch.ts`, `documentQa.ts`, `computableMemory.ts`, `symbolicEngine.ts`, `temporalSemantics.ts`, `semanticCompression.ts` | Crítico pasivo (solo sugerencias), grafo de código (análisis estático, NO runtime), research web, QA documental, memoria computable, motor simbólico, semántica temporal, compresión |

## 4. PROVIDERS AI (VERIFIED IMPLEMENTATION)

Catálogo en `AiProviderFactory.ts` — **10 descriptors**:

| id | mode | protocol | Líneas |
|---|---|---|---|
| deterministic | deterministic | deterministic | L36–42 |
| openai | remote | openai-compatible | L45–52 |
| gemini | remote | native | L55–62 |
| claude | remote | native | L65–71 |
| grok | remote | openai-compatible | L74–80 |
| qwen | remote | openai-compatible | L83–89 |
| hermes | local | openai-compatible | L92–99 |
| ollama | local | openai-compatible | L102–109 |
| lmstudio | local | openai-compatible | L112–119 |
| openai-compatible | remote | openai-compatible | L122–128 |

**PARTIAL IMPLEMENTATION (routing):** la selección es por config (`TBIT_AI_PROVIDER` o request), NO existe routing por capacidades/health/coste. `.env.example` documenta 7 valores; `grok`, `qwen`, `hermes` existen en la fábrica pero no en `.env.example` (DOCUMENTATION ONLY para esos 3).

## 5. HERRAMIENTAS AI (VERIFIED + PARTIAL)

**Implementadas en `TBitLocalToolExecutor.ts` (7):** `memorizar_en_vacio` (L61), `consultar_oraculo` (L79), `buscar_indice_tbit` (L86), `investigar_web` (L99), `resolver_ecuacion` (L111), `operar_simbolicamente` (L122), `eliminar_memoria` (L132).

**Declaradas en `TBitToolSchemas.ts` — `tbitCoreTools` (6):** `memorizar_en_vacio` (L8), `consultar_oraculo` (L29), `buscar_indice_tbit` (L46), `investigar_web` (L69), `resolver_ecuacion` (L85), `eliminar_memoria` (L103).

**DISCREPANCIA VERIFICADA (PRE-EXISTING):** `operar_simbolicamente` está implementado en el executor pero **no declarado en `tbitCoreTools`** → no invocable por el LLM vía tool-loop del chat (solo por endpoints directos).

Además: `webResearch` tiene camino *pre-fetch* en `/api/ai/chat` (`isWebResearchIntent` + `extractFirstUrlFromText`, máx. 12.000 chars inyectados al prompt) — atajo pre-LLM, no un tool call del modelo.

---

## 6. FLUJO REAL DE EJECUCIÓN AI (VERIFIED IMPLEMENTATION)

Único flujo de chat (`server.ts` L1908–1974):

```text
POST /api/ai/chat  (requireSymbolicApiKey; rate-limit global 120 req/min, L88)
  → body {sessionId, message, userId, provider?}
  → createAiProviderRuntimeFromConfig(providerConfigFromRequest)   [L1911]
  → si isWebResearchIntent(message) y hay URL:
      researchWebPage (750 KB máx, 12.000 chars) → buildWebResearchPrompt [L1921–1945]
  → procesarMensajeUsuario [L1947]
      → system prompt (generarSystemPromptOrquestador + USUARIO ACTIVO si userId)
      → 1ª llamada provider: tools=tbitCoreTools, toolChoice:"auto"
      → si tool_calls: por cada call → tbitChatToolExecutor
        (args acotados al usuario vía scopeAiToolArgsToUser) →
        assertAiPermission → ai_memoria.tbit → mensaje role:"tool"
      → 2ª llamada provider: toolChoice:"none"
      → sanitizeAssistantText (redacción de process.env.*, TBIT_*, prompt interno)
  → respuesta {tipo:"TEXTO", data, toolResults, provider label, providerInfo}
DELETE /api/ai/chat/:sessionId → resetTBitChatSession [L1976]
```

Otros endpoints AI verificados: `POST /api/ai/inject` (L1447), `POST /api/ai/oracle` (L1465), `POST /api/ai/symbolic` (L1718), `GET /api/ai/provider|providers` (L1771/1778), `POST /api/ai/provider/test` (L1786), `POST /api/web/research` (L1877), `POST /api/ai/compress` (L1981), `POST /api/guardian/observe` (L2281), `GET|POST /api/ai/permissions` (L2346/2358).

**PRE-EXISTING (seguridad):** `/api/ai/inject` y `/api/ai/oracle` **NO tienen** el middleware `requireSymbolicApiKey`, a diferencia del resto de endpoints IA.

**NO existe en el flujo:** orquestación multi-agente, grafo de ejecución, consenso runtime, segunda pasada de verificación, routing por capacidades, ni agentes. El único "orquestador" es el tool-loop de `TBitChatEngine`.

---

## 7. AGENTES — `.github/agents/*.agent.md` (DOCUMENTATION ONLY como runtime)

**18 archivos** (17 previos + `GraphEngineeringAgent.agent.md`, commit c434507, 294 líneas). Contrato de frontmatter verificado en los 18: `name`, `description`, `capabilities` (4–14 items), `tools` (inline `['read','search',...]` o block-list — solo ContextEngineer usa block-list), `argument-hint`. **`permissions` y `modelRequirements` ausentes en todos.** Vocabulario tools: `read|search|edit|vscode|agent`.

Roles: AiSystemEngineer, BackendEngineering, ChiefArchitect, CodeReviewer, ConsensusAgent, ContextEngineer, DatabaseIntegrationEngineer (rol: "Database Integration Manager"), DeveloperAgent, DevOpsEngineer, DocumentationEngineer, EngineeringManager, **GraphEngineeringAgent** (nuevo), PerformanceEngineer, PromptEngineer, SecurityAuditor, StorageEngineer, UI-UXArchitect, ValidationEngineer.

**VERIFICACIÓN CRÍTICA:** **NINGÚN módulo de runtime importa o referencia estos archivos.** No existe AgentSpecLoader, AgentRegistry, AgentRuntime, Graph Runtime ni runtime de Consensus. Los `.agent.md` son **definiciones declarativas, no ejecutables** (roadmap §4 correcto). La existencia de `ConsensusAgent.agent.md` NO implica consenso implementado. La existencia de `GraphEngineeringAgent.agent.md` NO implica Graph Engineering runtime; `codeGraphExtractor.ts` es análisis estático, no ejecución de grafos.

Inventarios previos (`engineering/reports/PHASE-0-AGENT-INVENTORY.md`, `phase-0-agent-inventory.json`, sección de agentes de `PROJECT_STATE.MD`) quedaron **desactualizados**: registran 17 agentes y afirman que GraphEngineeringAgent "no existe" — cierto antes del commit c434507, falso ahora.

## 8. TESTS EXISTENTES (VERIFIED IMPLEMENTATION)

Única suite: `tests/` — 4 archivos, 26 tests, vitest 3.2.4 (`vitest.config.ts`, `fileParallelism:false`, `pool:"forks"`), script `npm test`. Los `*-demo.ts` de la raíz NO son tests.

| Suite | Tests | Cobertura |
|---|---|---|
| `tests/TBitStorageService.smoke.test.ts` | 8 | Roundtrip storage, HMAC tamper, WAL, recover, collapse, batch, checksum |
| `tests/TBitChatEngine.parity.test.ts` | 7 | Paridad ruta SIMPLE: tool-loop, sanitización, historial/clamp, userId |
| `tests/agentSpecs.inventory.test.ts` | 7 | Contrato frontmatter de `.agent.md` |
| `tests/AiProvider.deterministic.test.ts` | 4 | Provider determinista |

## 9. RESULTADO DEL TEST SUITE (exacto)

`npm test` — **24 passed / 2 failed (26 total, 4 archivos), 1.84s**:

```
✓ tests/TBitStorageService.smoke.test.ts  (8 tests)
✓ tests/TBitChatEngine.parity.test.ts    (7 tests)
× tests/agentSpecs.inventory.test.ts     (7 tests | 2 failed)
   → L93:  AssertionError: expected 18 to be 17   (el repo tiene 18 agentes)
   → L126: AssertionError: expected [ { …(8) } ] to deeply equal []
           (GraphEngineeringAgent.agent.md ahora existe)
✓ tests/AiProvider.deterministic.test.ts (4 tests)
Test Files: 1 failed | 3 passed (4)
```

**Clasificación: PRE-EXISTING FAILURE.** Ambas fallas existían antes de PHASE 0: el test congeló el baseline de 17 agentes y el commit c434507 dejó la aserción obsoleta. **No se corrigieron** (regla PHASE 0). Deben actualizarse en PHASE 1 (AGENT-INVENTORY, roadmap §9), no antes.

## 10. BUILD / TYPE CHECKS (exacto)

| Comando | Resultado | Clasificación |
|---|---|---|
| `npm run build` (vite) | **PASS** — 2.363 módulos, 11.24s. Warning: chunk JS 1.392,60 kB > 500 kB | PRE-EXISTING (warning bundle) |
| `npx tsc --noEmit` (incluye solo `src/`) | **FAIL — 32 errores en 19 archivos frontend** (App.tsx 8, QuantumTelemetryRay.tsx 4, networkSyncClient.ts 3, containerHealthClient.ts 2, 15×1; mayormente `import.meta.env` sin tipos vite/client y null-checks) | PRE-EXISTING FAILURE |
| `npm run logic:build` (tsconfig.node.json) | **PASS — 0 errores** | VERIFIED |

Backend compila limpio; los 32 errores de tipos son exclusivamente de `src/` (frontend) y ninguno fue introducido por este trabajo.

---

## 11. REGISTRO DE PROBLEMAS PRE-EXISTENTES (no corregidos en PHASE 0)

| # | Problema | Evidencia | Severidad |
|---|---|---|---|
| P1 | 2 tests de `agentSpecs.inventory.test.ts` fallan (baseline 17 obsoleta vs 18 agentes actuales) | L93, L126; commit c434507 | MEDIA |
| P2 | 32 errores de tipos en frontend (`npx tsc --noEmit` FAIL) | 19 archivos `src/` | ALTA (bloquea CI estricto) |
| P3 | `/api/ai/inject` y `/api/ai/oracle` sin `requireSymbolicApiKey` | server.ts L1447, L1465 vs L1908 | ALTA (seguridad) |
| P4 | `operar_simbolicamente` implementado pero no declarado en `tbitCoreTools` | TBitLocalToolExecutor L122 vs TBitToolSchemas | MEDIA |
| P5 | Duplicación legacy: `TBitAiBridge.ts` (`TBIT_AI_SYSTEM_PROMPT`+`tbitAiTools`) paralelo a `TBitPrompts.ts`/`TBitToolSchemas.ts` | TBitAiBridge L60, L78 | MEDIA |
| P6 | `sessionHistories` en memoria: pérdida de sesiones al reiniciar | TBitChatEngine L28 | MEDIA (limitación conocida) |
| P7 | Bundle frontend 1,39 MB en un solo chunk (App.tsx 285,8 KB monolítico) | vite build warning | MEDIA |
| P8 | `.github/instructions/*` (3) y `.clinerules` vacíos (0 bytes) | filesystem | BAJA |
| P9 | `docs/ProjectSnapshot.txt` desactualizado (no lista tests/, vitest, 18º agente; lista archivos inexistentes) | docs/ProjectSnapshot.txt | BAJA |
| P10 | Contradicción: `docs/README.md` declara `engineering_tree.txt` superseded; sigue presente | docs/README.md vs engineering/ | BAJA |
| P11 | Inventarios previos obsoletos (17 agentes; "GraphEngineeringAgent no existe") | PHASE-0-AGENT-INVENTORY.md, phase-0-agent-inventory.json, PROJECT_STATE.MD | BAJA |
| P12 | server.ts monolítico de 91 KB (mantenibilidad) | filesystem | INFORMACIONAL |

**NEW FAILURE: NINGUNA.** PHASE 0 no modificó código, tests ni configuración; el único artefacto creado es este reporte.

## 12. RESUMEN DE CLASIFICACIÓN

| Categoría | Elementos |
|---|---|
| VERIFIED IMPLEMENTATION | Storage+WAL+HMAC+AES-GCM (`TBitStorageService/ TBitFileSystem`), `TBitChatEngine` (ruta SIMPLE con tool-loop), `AiProviderFactory` (10 providers), `DeterministicTBitProvider`, `OpenAICompatibleProvider`, `TBitLocalToolExecutor` (7 tools), `tbitCoreTools` (6 schemas), `aiPermissions`, `memoryCore`/`queryIndex`/`semanticIndex` sobre `ai_memoria.tbit`, `guardianObserver` (pasivo), `webResearch`/`documentQa`/`computableMemory`/`symbolicEngine`/`temporalSemantics`/`semanticCompression`/`codeGraphExtractor` (análisis), rate-limit 120/min, harness vitest (26 tests), `logic:build` PASS |
| PARTIAL IMPLEMENTATION | Model routing (selección por config, sin capacidades/health), web research (pre-fetch acoplado al endpoint, no tool call), herramientas (7 implementadas vs 6 expuestas), observabilidad IA (telemetría de UI existe; sin trazas/lineage de ejecución AI) |
| DOCUMENTATION ONLY | 18 `.agent.md` (declarativos, sin runtime), fases 1–11 del roadmap, `.github/standards|templates`, `.github/instructions` (vacíos), providers grok/qwen/hermes en `.env.example`, consenso/graph runtime como concepto |
| MISSING CAPABILITY | AgentSpecLoader, AgentRegistry, AgentRuntime, contrato/validador/executor de grafos, runtime de Consenso, Arbitration, LoopEngine, PromptRegistry, EvaluationEngine, ExecutionTracer/LineageStore, ContextBuilder explícito, TaskClassifier/CapabilityMatcher, persistencia de artefactos de ejecución IA (decisión `ai_exec.tbit` pendiente) — **NOT FOUND IN THE REPOSITORY** |
| PRE-EXISTING FAILURE | P1–P12 (§11) |
| NEW FAILURE | Ninguna |
| UNKNOWN — REQUIRES VERIFICATION | Ninguna pendiente para PHASE 0; el comportamiento runtime de providers remotos reales (openai/gemini/claude/grok/qwen) no fue verificado en vivo (requieren API keys) — se deja constancia como limitación del análisis, no como capacidad |

## 13. CONCLUSIÓN DE PHASE 0

El sistema AI actual de T-Bit es **una ruta de chat única** (provider → tool-loop de 2 pasos → sanitización) sobre una fundación de storage verificable madura. No existe multi-agente, ni runtime de grafos, ni consenso, ni loops controlados: todo eso es **DOCUMENTATION ONLY / MISSING CAPABILITY**. La infraestructura de tests existe y protege la ruta SIMPLE y el storage. Los únicos fallos del baseline son conocidos y catalogados (P1–P12), ninguno introducido por este análisis.

**PHASE 0 está COMPLETA.** PHASE 1 (AGENT DEFINITION VALIDATION + AGENT-INVENTORY) solo debe iniciarse tras revisión y aprobación de este reporte, conforme al roadmap §29.

## APÉNDICE — COMANDOS EJECUTADOS

```text
git log --oneline -8; git status --porcelain; git show --stat b46575d c434507
Get-ChildItem (raíz, .github, docs, .github/agents, .github/instructions, .github/standards)
npm test                                    → 24 passed / 2 failed (26)
npx tsc --noEmit                            → 32 errores (src/, preexistentes)
npm run logic:build                         → 0 errores
npm run build (vite)                        → PASS 11.24s (warning chunk >500 kB)
Select-String sobre: server.ts, AiProviderFactory.ts, TBitToolSchemas.ts,
  TBitLocalToolExecutor.ts, TBitStorageService.ts, TBitChatEngine.ts, TBitAiBridge.ts,
  tests/agentSpecs.inventory.test.ts, docs/T-BIT_BOOK.md, .github/agents/*.agent.md
Read completos: AI_EVOLUTION_ROADMAP.md, REPORT_STANDARD.md, docs/README.md,
  docs/ProjectSnapshot.txt, GraphEngineeringAgent.agent.md (frontmatter+estructura)
```

---

## ADDENDUM DE VERIFICACIÓN — 2026-10-07 (rama `feature/completar-app`)

> Addendum añadido durante la pasada de completación. No se reescriben los
> hallazgos originales; se registran refutaciones con evidencia ejecutada.
> Constancia completa en `docs/CHANGELOG.md`.

### Refutación de P3 — "Los endpoints `/api/ai/inject` y `/api/ai/oracle` no exigen API key"

**Falso positivo.** El análisis leyó los handlers individuales (L1447, L1465)
pero pasó por alto el middleware global registrado en `server.ts` L268:

```ts
app.use("/api", (request, response, next) => {
  const providedKey = request.header("x-tbit-api-key");
  if (!safeApiKeyEquals(providedKey, API_KEY)) { /* 401 */ }
  next();
});
```

`app.use("/api", ...)` se aplica a TODOS los endpoints bajo `/api`, con o sin
`requireSymbolicApiKey` en el handler (que actúa como defensa en profundidad).
**Verificado en runtime (2026-10-07):** `POST /api/ai/inject` sin header
`x-tbit-api-key` → `401 {"ok":false,"error":"API key T-BIT invalida o ausente."}`.
P3 se reclasifica: NO EXISTE (los endpoints están protegidos).

### Refutación de P4 — "`operar_simbolicamente` implementado pero no declarado en `tbitCoreTools`"

**Falso positivo.** `TBitToolSchemas.ts` L121-124 extiende el catálogo con el
spread de `tbitSymbolicTools` (definido en `TBitSymbolicBridge.ts` L18-49):

```ts
...(tbitSymbolicTools.map((tool) => ({ ... })) satisfies AiToolSchema[]),
```

La tool `operar_simbolicamente` SÍ queda expuesta a los providers a través de
`tbitCoreTools`. El conteo correcto es 7 tools expuestas = 6 core + 1 simbólica.
P4 se reclasifica: NO EXISTE.

### Nota sobre P1

P1 (2 tests del inventario en rojo) era correcto y fue corregido el 2026-10-07:
el contrato de `tests/agentSpecs.inventory.test.ts` se actualizó al baseline
real de 18 especificaciones (GraphEngineeringAgent incluido como definición
autoritativa). `npm test` → 26/26 PASS.

### Estado de este reporte

Este archivo quedó commiteado (antes estaba untracked) como artefacto oficial
de PHASE 0 conforme al roadmap §29, con este addendum como parte integral.

