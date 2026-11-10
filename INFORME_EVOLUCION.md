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

---

# TANDA 3 — Interfaz, UX y multiplataforma (2026-11-07)

Rama: `feature/evolucion-tbit`. Commits: `be6ceea` (F74), `7369732` (F75), `8f18333` (F76),
`96f6e65` (F77), `c19d034` (F78). Línea base heredada verificada: 89/89 tests, tsc 0 errores,
build PASS. Fuente documental: `docs/T-BIT_BOOK.md` (Fases 74–78 añadidas).

## Qué se verificó (con evidencia ejecutada)

1. **Auditoría de portabilidad (F74).** 8 puntos auditados en todo el código y scripts npm:
   rutas/separadores, comandos de shell, `child_process`, casing de imports, finales de línea,
   APIs de archivo, locks de contenedor (`wx` + mtime) y escritura atómica (temp+rename).
   Resultado: todo multiplataforma por construcción. Gap real encontrado y corregido por
   causa raíz: `withIndexWriteLock` es solo intraproceso → nuevo guard de instancia única en
   `server.ts` (`acquireServerInstanceLock`: lock `wx` + vitalidad del titular por PID señal 0,
   reclamo de huérfanos). Verificado en runtime con 5 escenarios: arranque, rechazo de segunda
   instancia (`SERVER_ALREADY_RUNNING`), no-robo del lock, muerte forzada (`taskkill /F`) y
   reclamo al reiniciar. Durante la verificación se detectó y corrigió un bug del propio guard:
   la detección de huérfanos por mtime (60 s) robaba el lock de un servidor vivo; se sustituyó
   por comprobación de vitalidad por PID.
2. **CI multiplataforma (F75).** `.github/workflows/ci.yml` creado con matriz
   ubuntu/macos/windows: `npm ci`, `logic:build`, `tsc --noEmit`, `npm test`, `npm run build`.
   Sin push en esta sesión (según directiva).
3. **Interfaz y experiencia asistente (F76).** Design system aditivo en `index.css` (tokens,
   primitivas `.tbit-*`, foco visible, `prefers-reduced-motion`, scrollbars); estados
   accesibles de carga/vacío/error (`src/components/ui/StateViews.tsx`) integrados en
   `AgentRuntimePanel`; aviso del eslabón determinista como banner ámbar distintivo
   (`kind: "deterministic-notice"`) y chip "Motor de respuesta" en el chat de Q-Vault OS.
   Quantum Engine intacto.
4. **Empaquetado de escritorio (F77).** Sin tecnología previa definida (el libro decía "no hay
   instalador desktop todavía"). Elegida la opción más ligera sin dependencias nuevas
   (D-005): `scripts/launch-desktop.cjs` (`npm run start:desktop`) + serving del frontend
   construido desde el proceso del API (fallback SPA que excluye `/api`). Smoke real en
   Windows: frontend HTTP 200, API 401 sin clave (auth intacta), un solo proceso sobre el
   vault, navegador abierto.
5. **Conectores locales (F78).** Sondeo real: Ollama (11434) y LM Studio (1234) NO
   ACCESIBLES (ECONNREFUSED).
6. **Rendimiento de carga (F78).** `manualChunks` por paquete en `vite.config.ts`. Medición
   real: 1 chunk de 1.403,10 kB → 7 fragmentos (app 261,57 kB; three-core 810,57 kB aislado;
   react 260,27 kB; fiber/drei/misc <32 kB). Verificado en runtime: frontend 200 y chunk de
   app cargando (261.437 bytes) vía el lanzador.

## Qué falló y qué se corrigió

- **TS6305 al inicio de sesión:** `dist/` obsoleto respecto a fuentes al ejecutar `tsc
  --noEmit` antes/ durante `logic:build`. Ya documentado como procedimiento (no bug de código).
- **Bug del guard de instancia (detectado en la propia verificación):** la detección de lock
  huérfano por mtime (STALE_LOCK_MS = 60 s) consideraba huérfano el lock de un servidor vivo
  con más de 60 s de actividad, permitiendo que una segunda instancia lo robara. Corregido por
  causa raíz: vitalidad por PID (señal 0), con EPERM tratado como "vivo". Re-verificado en los
  5 escenarios.
- **Import con ruta incorrecta** (`../ui/StateViews` → `./ui/StateViews`): detectado por
  `tsc` y por `vite build`; corregido de inmediato.

## Qué quedó NO VERIFICADO (regla de veracidad)

- **Paridad macOS/Linux:** el flujo CI existe pero no se ha ejecutado (no se hace push en esta
  sesión). Todo lo verificado en esta tanda lo fue solo en Windows.
- **Visual de la interfaz:** no hay herramienta de navegador disponible; el resultado visual
  (design system, banner determinista, chip) queda NO VERIFICADO por captura. Verificado por
  compilación, tipos y suite.
- **Ollama / LM Studio en runtime:** sin servidores locales accesibles (ECONNREFUSED); los
  conectores existen y están configurados por variables de entorno, pero no se probaron contra
  un servidor real.
- **Instalador nativo:** no se produce (.msi/.dmg/.AppImage); el empaquetado requiere Node
  instalado. Documentado en D-005.
- **Carga bajo demanda total de Quantum Engine:** diferida por alto riesgo de regresión
  (extraer la escena 3D de `App.tsx`, 5.5k líneas); registrado como limitación en el libro.

## Estado final de la Tanda 3

```text
npm test            -> 89/89 PASS (13 archivos)
npm run logic:build -> PASS
npx tsc --noEmit    -> 0 errores
npm run build       -> PASS (7 fragmentos; antes 1 chunk de 1.403 kB)
Árbol limpio en feature/evolucion-tbit; libro actualizado (Fases 74-78);
PLAN_EVOLUCION.md y DECISIONES_EVOLUCION.md (D-005) al día.
```

# TANDA 4 — Corrección de la regresión del frontend compilado (2026-11-09)

Commit: `d3346d7` (Fase 79). Alcance exclusivo: corregir la regresión reportada por el
usuario en un navegador real. No se añadieron funciones de agentes, skills ni memoria, ni
cambios visuales nuevos.

## Qué se verificó (con evidencia ejecutada)

- **Línea base en verde antes de tocar nada:** 89/89 tests (13 archivos), `logic:build`
  PASS, `tsc --noEmit` 0 errores, `npm run build` PASS reproduciendo el aviso
  "Circular chunk: vendor-misc -> vendor-react -> vendor-misc" y el modulepreload de
  vendor-three-core (810 kB), vendor-fiber y vendor-drei en `dist/index.html`.
- **Síntoma B reproducido con el servidor real:** `curl -i http://localhost:3111/`
  devolvía el HTML con `Content-Type: application/json; charset=utf-8` (por eso el
  navegador lo mostraba como texto). Las cabeceras `Accept-Ranges`/`ETag` de la respuesta
  demostraron que `express.static` sirvió el archivo sin poder sobreescribir el
  Content-Type preestablecido por el middleware global de `server.ts`.
- **Síntoma A diagnosticado en el grafo del bundle:** `App.tsx` importaba three/fiber/drei
  de forma estática (la "carga diferida de Quantum Engine" de la Fase 78 nunca se
  implementó; así está registrado en PLAN_EVOLUCION) y `manualChunks` forzaba fragmentos
  genéricos con dependencia circular, que rompen el orden de inicialización en el
  navegador.
- **Corrección verificada de punta a punta:**
  - `npm test` -> **97/97 PASS (14 archivos)**; `tsc --noEmit` -> 0 errores;
    `npm run verify:bundle` -> OK (0 modulepreload de three/fiber/drei, sin chunks
    circulares; entrada 407,45 kB + chunk asíncrono QuantumScenes 996,59 kB).
  - **Navegador real (Chromium del sistema, headless, `scripts/verify-browser.cjs`):**
    los TRES escenarios dibujan la pantalla de primer arranque "Configura tu Q-Vault OS"
    sin excepciones no capturadas: dev (5173), `vite preview` (4173) y `start:desktop`
    (servidor real en el puerto 3222).
  - `curl` contra el servidor real: `/` -> 200 `text/html; charset=UTF-8` + nosniff;
    JS -> `text/javascript`; CSS -> `text/css`; asset inexistente -> 404 JSON (nunca
    HTML); reserva SPA solo con Accept: text/html; `/api/test` -> 401 JSON (autenticación
    intacta). El guard de instancia única se verificó de facto: el segundo servidor fue
    rechazado con `SERVER_ALREADY_RUNNING` mientras el diagnóstico seguía activo.

## Qué falló (y cómo se detectó)

1. **Middleware global de Content-Type (causa raíz del síntoma B):** fijaba
   `application/json` en todas las respuestas desde antes de la Fase 77; al añadir la
   entrega estática en esa fase, el HTML pasó a servirse como JSON. Las pruebas existentes
   solo comprobaban códigos 200 y nunca abrían un navegador: la regresión pasó inadvertida.
2. **`manualChunks` de la Fase 78 (causa raíz del síntoma A):** la división manual creó
   chunks circulares. El primer intento de arreglo (aislar solo three/fiber/drei) produjo
   OTRO ciclo (`vendor-fiber -> vendor-three-core -> vendor-fiber`), detectado por el
   propio `verify:bundle`; la solución correcta fue eliminar `manualChunks` y dejar que
   Rollup coloque la pila 3D (exclusiva del módulo de importación dinámica) en el chunk
   asíncrono.
3. **Defecto latente:** `vite build` vaciaba `dist/` y borraba `dist/server.js` (dos
   builds compartiendo outDir). Detectado al reproducir el síntoma B
   (`Cannot find module 'dist\server.js'`).

## Qué se corrigió

- `src/staticFrontend.ts` (nuevo): entrega estática con Content-Types reales, 404 JSON
  para `/assets/*` inexistentes, reserva SPA solo para navegación y
  `X-Content-Type-Options: nosniff`; en `server.ts` el JSON quedó acotado a `/api` (D-011).
- `src/quantum/QuantumScenes.tsx` + `src/quantum/quantumTypes.ts` (nuevos): escenas 3D
  extraídas verbatim de `App.tsx`, cargadas con `React.lazy` + `Suspense` y fallback
  accesible (`role="status"`); sin `manualChunks` (D-012).
- `vite.config.ts`: outDir `dist/frontend` (D-013); `server.ts` y
  `scripts/launch-desktop.cjs` actualizados.
- `npm run verify:bundle` (`scripts/verify-bundle.cjs`) añadido a CI tras `npm run build`;
  8 tests nuevos con servidor HTTP real (`tests/StaticFrontend.phase79.test.ts`);
  `npm run verify:browser` (`scripts/verify-browser.cjs`) con `playwright-core` y el
  Chrome/Edge del sistema, sin descarga de navegadores (D-014).

## Qué quedó NO VERIFICADO (regla de veracidad)

- **Comprobación manual en macOS y Linux:** este entorno es Windows. El flujo CI (Fase 75)
  ejecutará build + verify:bundle en los tres sistemas al correr en GitHub Actions; la
  verificación visual interactiva en esos sistemas queda para el usuario.
- **`npm run start:desktop` con apertura automática de navegador** en el flujo completo del
  lanzador: se verificó el servidor y su entrega (puerto 3222 con `PORT`), no la apertura
  del navegador del sistema por el lanzador.
- **Errores de consola residuales (preexistentes, no regresión):** llamadas a la API en
  `http://localhost:3000` (default de `VITE_TBIT_API_BASE_URL`) cuando no hay API en ese
  puerto, y `GET /favicon.ico` -> 404 (el proyecto no define favicon).

## Estado final de la Tanda 4

```text
npm test              -> 97/97 PASS (14 archivos)
npm run logic:build   -> PASS
npx tsc --noEmit      -> 0 errores
npm run build         -> PASS (entrada 407 kB + chunk 3D asíncrono 997 kB)
npm run verify:bundle -> OK (0 modulepreload de 3D; sin chunks circulares)
Navegador real        -> dev OK | preview OK | start:desktop OK (primer arranque dibujado)
Árbol limpio en feature/evolucion-tbit; libro actualizado (Fase 79);
PLAN_EVOLUCION.md y DECISIONES_EVOLUCION.md (D-011..D-014) al día.
```

## Comprobaciones que el usuario debe hacer a mano en su navegador

```text
1. npm run dev            -> http://127.0.0.1:5173 debe mostrar "Configura tu Q-Vault OS".
2. npm run build && npx vite preview -> http://localhost:4173 debe mostrar la interfaz
                             (antes: pantalla negra).
3. npm run start:desktop  -> http://localhost:3000 debe mostrar la interfaz
                             (antes: código HTML como texto).
4. F12 (consola) en las tres rutas: sin errores en rojo, salvo las llamadas a la API sin
   clave o sin API en el puerto 3000 y el 404 de favicon (esperados).
5. (Opcional) En la vista de mapa Q-Vault, cambiar a "escena 3D": la escena debe cargar
   con un breve estado "Cargando escena cuantica..." (chunk diferido de three.js).
```


