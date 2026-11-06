# INFORME_EVOLUCION.md — Evolución T-BIT CORE v1.1 (Fases 64-68)

**Rama:** `feature/evolucion-tbit` (creada desde HEAD de `main`)
**Fecha de cierre:** 2026-11-05
**Fuente documental única:** `docs/T-BIT_BOOK.md` (secciones 25.30-25.34 añadidas)

---

## 1. Qué se encontró (línea base real, verificada ejecutando)

- Suite base: 26/26 tests PASS (4 archivos), `logic:build` y `tsc --noEmit` limpios, `npm run build` PASS.
- Los 18 agentes existen como `.github/agents/*.agent.md` con inventario congelado por `tests/agentSpecs.inventory.test.ts`; **no existía ningún runtime** que los ejecutara.
- `AiProviderFactory.ts` soportaba proveedores individuales (gemini, openai, anthropic, grok, qwen, ollama, lmstudio, openai-compatible, deterministic) **sin failover**: un 429 o timeout rompía la solicitud.
- `memoryCore.ts` + `queryIndex.ts` eran sólidos pero **solo se alimentaban del chat**, no del runtime de agentes.
- No existía sistema de Skills; `TBitToolSchemas.ts` tenía 8 herramientas simbólicas.
- La UI no exponía agentes, failover ni consenso.

## 2. Qué se hizo (5 tandas, 5 commits atómicos)

| Commit | Fase | Entrega |
|---|---|---|
| `6c29780` | 64 | Runtime multi-agente: `AgentSpecLoader` (18 specs), `AgentEventBus` (journal auditable, 2000 eventos), `AgentOrchestrator` (pool asíncrono sin dependencias, ejecución individual + enjambre paralelo + validación cruzada + consenso), endpoints `/api/agents*`, 7 tests |
| `5c38281` | 65 | `FallbackProviderChain`: failover en caliente (429/5xx/timeout/401/red), cooldown por tipo de fallo, monitoreo de latencia, conector OpenRouter, `createFallbackProviderChain()` con eslabón determinista final, `/api/ai/providers/health`, 12 tests |
| `e2e6808` | 66 | `AgentMemoryBridge`: persistencia automática de ejecuciones y bitácoras de consenso en Q-Vault (`AI::AgentRuntime::*`, `AI::AgentConsensus::*` con wikilinks), contexto recuperado del vault antes de ejecutar, verificación anti-alucinación con citas, 5 tests |
| `ebe67ff` | 67 | `DynamicSkillManager`: skills declarativas (.md/.json), catálogo local semilla (3 skills), detección contextual, instalación con `aiPermissions` + sha256 + commit fijado para remotas, ejecución como contexto NO CONFIABLE, 3 herramientas nuevas para la IA, 7 tests |
| `f98c332` | 68 | `AgentRuntimePanel` en Q-Vault OS: catálogo de agentes, salud de failover visible, journal, ejecutor de enjambre con indicador de razonamiento y verificación Q-Vault |

## 3. Verificación ejecutada (evidencia real)

### Suite automatizada (estado final)

```text
npm test            -> 57/57 PASS (8 archivos; 31 tests nuevos en esta evolución)
npm run logic:build -> PASS (0 errores)
npx tsc --noEmit    -> 0 errores (backend + frontend)
npm run build       -> PASS (vite 6.4.2, 2365 módulos; warning preexistente de chunk 1.4 MB)
```

### Smoke runtime de punta a punta (servidor real en :3000, HTTP con API key)

```text
GET  /api/agents                 -> 18 agentes con política derivada
POST /api/agents/run             -> Code Reviewer completado; ejecución persistida como
                                    AI::AgentRuntime::Code_Reviewer::<taskId> y consultable
                                    después vía POST /api/query/search (source=agent-runtime)
POST /api/agents/swarm           -> 2 agentes en paralelo + Consensus Agent: 2 resultados,
                                    2 veredictos, 9 eventos auditables, respuesta consolidada
GET  /api/agents/events          -> journal del enjambre
GET  /api/ai/providers/health    -> cadena con eslabón determinista disponible
POST /api/ai/chat (provider openai sin clave) -> 200 OK vía failover transparente
Ejecutor de herramientas (tsx): buscar_skill -> code-review-checklist;
ejecutar_skill -> bloque NO CONFIABLE verificado; instalar_skill -> persistida con sha256
```

## 4. Mejoras e innovaciones

1. **Enjambre con consenso multi-IA** sobre pool asíncrono propio (cero dependencias nuevas): paralelismo acotado, validación cruzada y consolidación, todo auditable evento a evento.
2. **Failover continuo con degradación elegante**: el chat nunca falla por cuotas; el último eslabón es siempre el proveedor determinista local T-BIT.
3. **Memoria evolutiva real**: los agentes alimentan y consultan Q-Vault; las respuestas citan fuentes y marcan lo no verificado.
4. **Skills con seguridad de cadena de suministro**: solo definiciones declarativas, commit fijado, integridad sha256 verificada en cada ejecución, permisos obligatorios.
5. **UX legible**: el panel traduce la complejidad (pool, WAL, llaves) a "agentes", "consenso" y "respaldo en Q-Vault".

## 5. Estado de interfaz y plataformas

- Interfaz: React 18 + Vite + Tailwind, identidad visual conservada; panel nuevo integrado en el modo desarrollador sin tocar el chat ni Quantum Engine. Build y type-check en verde.
- Paridad Windows/macOS/Linux: el stack es una app web local sin APIs nativas de plataforma; **paridad por diseño, no verificada en macOS/Linux** (entorno de desarrollo Windows). Empaquetado de escritorio (Electron/Tauri) sigue siendo deuda registrada — decisión D-010.

## 6. Suposiciones registradas

- `getAgentOrchestrator` (helper T0) se sustituyó por instancias explícitas de `AgentOrchestrator` por request, para inyectar executor de herramientas con scoping por usuario y hook de memoria (Fase 66).
- El proveedor determinista no invoca herramientas; el smoke de skills se hizo contra el ejecutor real vía `tsx` (equivalente funcional al camino del chat con proveedor remoto).
- `data/memory-core-index.json` y `data/query-index.json` están versionados en el repo; los cambios generados por smokes se revirtieron antes de cada commit.

## 7. Limitaciones conocidas

- Failover contra proveedores remotos reales (Gemini/OpenAI/OpenRouter con clave) **no verificado**: no hay claves en el entorno. Cubierto por 12 tests con proveedores falsos y smoke con failover a determinista.
- Consulta remota de skills desde los repos de referencia: implementada y protegida (commit fijado obligatorio), **no verificada contra red** por la regla de no depender de servicios externos.
- Bundle frontend monolítico (1.4 MB) y sesiones de chat en memoria: deuda preexistente, no regredida.
- Journal de eventos en memoria (tope 2000): suficiente para auditoría operativa; persistencia de journal completo es mejora futura.

## 8. No regresión (guardarraíles intactos)

- Motor `.tbit` (frames inline, salt 32 bytes, probing, simetría `(V + Anti-V + 1) & 0xff = 0`): sin cambios.
- AES-256-GCM, HMAC timing-safe, WAL, locks, reconciliación de salud: sin cambios.
- Dual-UI Q-Vault OS / Quantum Engine: sin cambios; solo se añadió un panel.
- API pública de `createAiProviderRuntime`/`createAiProviderRuntimeFromConfig`: preservada.
- Cero dependencias nuevas en todo el package.json.

---

# INFORME_EVOLUCION.md — Tanda 2: Verificación y endurecimiento (Fases 69-73)

Fecha: 2026-11-05 a 2026-11-06. Rama: `feature/evolucion-tbit`. Commits atómicos: Fase 69 `fb3b371`, Fase 70 `c2830c8`, Fase 71 `1db66ae`, Fase 72 `098fbaa`, Fase 73 `cb53d74`.

## 1. Qué se verificó (con evidencia ejecutada)

- **Punto 1 — Agentes reales (Fase 69).** Cada agente ejecuta su especificación contra el proveedor activo de la cadena de failover; el eslabón determinista es únicamente el último recurso (`resolveRuntimeProviderChain` + `deterministicAlwaysLast`). Verificado con un servidor local simulado compatible con OpenAI incluyendo respuestas 429, 503 y timeout: el failover funciona y cada `AgentRunResult` registra `providerId`, `providerMode` y `deterministicFallback`. 4 tests nuevos.
- **Punto 2 — Concurrencia (Fase 70).** Estrés con los 18 agentes en paralelo escribiendo a la vez en el journal y en Q-Vault. Se encontró y corrigió por causa raíz una condición de carrera real en `memoryCore` (lectura-modificación-escritura del índice sin exclusión mutua entre rutas async): se añadió un mutex async (`withIndexWriteLock`) aplicado a las 6 rutas que mutan el índice. Tras la corrección: 0 escrituras perdidas, 0 corrupciones de WAL, motor `.tbit` intacto. 5 tests nuevos de estrés.
- **Punto 3 — Proveedores IA (Fase 71).** Auditoría uno por uno del catálogo (Gemini, Grok/xAI, Qwen, Hermes, Ollama, LM Studio, OpenRouter, OpenAI-compatible dinámico): 14 tests. Gaps corregidos: Grok/xAI y Qwen no tenían base URL por defecto (ahora `https://api.x.ai/v1` y DashScope compatible-mode). Configuración 100% por variables de entorno, sin claves en el código, documentadas en el libro (25.37). Verificación de red con fecha (2026-11-05): endpoints operativos (OpenAI 401, Gemini 403, Claude 401, xAI 401, Qwen 401, OpenRouter 200); free tier: Gemini SÍ, OpenRouter 12 modelos `:free` de 454, xAI sin free tier verificado, Qwen no verificado, Ollama/LM Studio locales gratuitos. Visibilidad del eslabón determinista: `/api/ai/chat` devuelve `providerInfo` + `deterministicFallback` y el chat muestra un aviso explícito cuando la respuesta NO proviene de IA.
- **Punto 4 — Anti-alucinación en el chat (Fase 72).** Gap real: el chat principal respondía sin contrastar contra Q-Vault. Integrado con la misma fuente de verdad que los agentes: contexto pre-respuesta (`buildVaultContext`), verificación post-respuesta (`verifyAgainstVault`, con términos verificados/no verificados y citas) y persistencia de interacciones relevantes con wikilinks y refresco del índice semántico. Best-effort garantizado por test: un vault caído nunca rompe la respuesta. 5 tests, incluida integración real contra el vault físico.
- **Punto 5 — Skills remotas (Fase 73).** Con red real disponible: indexación de catálogos vía API de GitHub (`listRemoteCatalog`, 25 SKILL.md en `rmaterile/agent-skills`), manifiesto versionado `skills/remote-catalog.json` con 8 skills reales verificadas (repo@commit + sha256 + bytes, fecha 2026-11-06), instalación con commit fijado y verificación de integridad (`installFromCatalog`), rechazo demostrado de contenido manipulado (sha256 falso → instalación bloqueada). Catálogo ampliado de 3 semilla a 3 + 8 remotas verificadas. Todo el contenido se trata como NO CONFIABLE (nunca se ejecuta código). 4 tests con red real; sin red se omiten como NO VERIFICADO.

## 2. Qué falló (y cómo se detectó)

- **Condición de carrera en `memoryCore`** (Punto 2): detectada por el test de estrés (escrituras perdidas bajo 18 agentes paralelos). Corregida por causa raíz con mutex async, no con reintentos.
- **Grok/xAI y Qwen sin base URL por defecto** (Punto 3): el factory rechazaba proveedores configurables válidos. Corregido con defaults oficiales documentados.
- **Chat sin verificación anti-alucinación** (Punto 4): el chat no aplicaba lo que el runtime de agentes sí hacía desde la Fase 66. Corregido integrando los tres hooks.
- **Manifiesto de skills con BOM y tratado como skill** (Punto 5): detectado por los tests (JSON.parse falló y el conteo local dio 4 en vez de 3). Corregido: tolerancia a BOM y exclusión explícita del manifiesto del catálogo local.

## 3. Qué quedó NO VERIFICADO (regla de veracidad)

- **Failover real con claves de proveedores IA**: el `.env` local no contiene claves de IA (solo secretos T-BIT: HMAC, cifrado, API key local). `.env` está en `.gitignore` (verificado); ninguna clave fue impresa ni versionada. El failover está cubierto por tests con proveedores falsos y mock 429/503/timeout, pero no contra proveedores remotos reales.
- **Cuota gratuita de Qwen**: endpoint operativo (401 sin clave), pero la cuota gratuita de prueba no quedó verificada en la documentación consultada.
- **Hermes, Ollama y LM Studio en runtime**: no había instancias locales activas en este entorno; su configuración está verificada por tests de factory, no contra un servidor real.
- **Paridad macOS/Linux y empaquetado**: fuera del alcance de esta tanda (explícitamente excluido); sigue como deuda D-010.

## 4. Verificación ejecutada (estado final)

```text
npm test            -> 89/89 PASS (13 archivos de prueba)
npm run logic:build -> PASS
npx tsc --noEmit    -> 0 errores
npm run build       -> PASS (vite 6.4.2; warning preexistente de tamaño de chunk)
```

## 5. No regresión (guardarraíles intactos)

- Motor `.tbit` (frames inline, salt 32 bytes, probing, simetría): sin cambios, verificado por el estrés de concurrencia.
- AES-256-GCM, HMAC timing-safe, WAL, locks, reconciliación de salud: sin cambios.
- Seguridad de skills: solo definiciones declarativas, commit fijado obligatorio, sha256 verificado en cada ejecución, permisos obligatorios — ahora también contra el manifiesto.
- Cero dependencias nuevas en todo el package.json.

## 6. Pendiente para futuras tandas

- Failover real con claves de proveedores (requiere claves en el entorno).
- Persistencia completa del journal de eventos y bundle frontend monolítico (deuda preexistente).
- Interfaz y empaquetado multiplataforma (explícitamente excluidos de la Tanda 2).

