# DECISIONES_EVOLUCION.md — Registro de decisiones de arquitectura

Cada entrada registra: decisión, alternativas consideradas y motivo. Formato acumulativo (más reciente al final).

---

## D-001 — Rama de trabajo y estrategia de no regresión
- **Decisión:** trabajar en rama `feature/evolucion-tbit` creada desde `main` (`bcf7988`). Código nuevo en módulos nuevos; integración con `server.ts` solo mediante rutas nuevas; sin modificaciones al motor físico `.tbit`.
- **Alternativas:** trabajar sobre `main` (rechazado: la directiva lo prohíbe); refactorizar `server.ts` en routers (rechazado: riesgo innecesario de regresión en un archivo de 2.358 líneas que funciona).
- **Motivo:** guardarraíl no destructivo de la directiva y minimización del blast radius.

## D-002 — Sin dependencias nuevas para el runtime multi-agente
- **Decisión:** implementar el orquestador con un pool de concurrencia propio (semáforo asíncrono en TypeScript puro) sobre `Promise.all` acotado, en lugar de `worker_threads` o librerías como `p-limit`/`piscina`.
- **Alternativas:** (a) `worker_threads` por agente — rechazada: los agentes ejecutan I/O de red (proveedores IA), no CPU intensivo; los workers añaden complejidad de serialización sin beneficio; (b) `p-limit` — rechazada: dependencia nueva trivial de implementar en ~30 líneas, y la directiva exige justificar cada dependencia.
- **Motivo:** la saturación de la API Express proviene de I/O no bloqueante mal acotado, no de falta de hilos. Node.js ya es asíncrono; un pool con límite configurable (`TBIT_AGENT_MAX_CONCURRENCY`) evita condiciones de carrera y sobrecarga sin cambiar el modelo de ejecución.

## D-003 — Fuente de especificaciones de agentes: `.github/agents/*.agent.md`
- **Decisión:** el runtime carga las 18 especificaciones directamente desde `.github/agents/` con un `AgentSpecLoader` que respeta el contrato de frontmatter ya congelado por `tests/agentSpecs.inventory.test.ts`.
- **Alternativas:** duplicar las specs en código TypeScript (rechazada: dos fuentes de verdad); usar el JSON de `engineering/reports/phase-0-agent-inventory.json` (rechazada: es un reporte generado, no la fuente).

## D-005 — Failover de proveedores IA sin dependencias nuevas
- **Decisión:** `FallbackProviderChain` implementado como un `AiProvider` decorador que envuelve la cadena de runtimes existentes; detección de fallo por clasificación de error (HTTP 429/500/503/504, timeout, cuota), cooldown con expiración por proveedor y registro de latencia/éxitos en memoria.
- **Alternativas:** usar un proxy/balanceador externo (rechazada: infraestructura nueva no solicitada); librerías de circuit-breaker (rechazada: dependencia nueva innecesaria para ~150 líneas).
- **Motivo:** `AiProvider` ya es la interfaz única usada por `TBitChatEngine`; un decorador mantiene la API pública intacta y el failover transparente para todo el sistema.

## D-006 — Proveedor determinista local como último eslabón de la cadena
- **Decisión:** la cadena de failover siempre termina en `DeterministicTBitProvider`, de modo que una solicitud de chat nunca falla por cuotas agotadas de todos los proveedores remotos.
- **Alternativas:** devolver error 503 al usuario cuando todos los proveedores fallan (rechazada: la directiva exige no interrumpir la respuesta).
- **Motivo:** el proveedor determinista ya existe, es local y no depende de red; garantiza degradación elegante.

## D-007 — Skills como definiciones declarativas, nunca código ejecutable
- **Decisión:** `DynamicSkillManager` solo carga skills `.md`/`.json` (instrucciones, patrones, checklists). Una skill "se ejecuta" inyectando su contenido declarativo como contexto al agente/proveedor; nunca se ejecuta código descargado. Skills remotas: commit fijado por variable de entorno + verificación de integridad sha256 del contenido + validación por `aiPermissions.ts`.
- **Alternativas:** sandbox de ejecución de código de skills (rechazada: riesgo de cadena de suministro injustificado y fuera del alcance).
- **Motivo:** regla de seguridad de la cadena de suministro del Objetivo 4; las instrucciones de skills externas nunca prevalecen sobre el libro ni los guardarraíles.

## D-008 — Persistencia de memoria evolutiva vía `memoryCore.ts` existente
- **Decisión:** las ejecuciones de agentes, bitácoras de consenso y skills instaladas se persisten reutilizando `indexExternalMemoryRecord()` / `rememberMemory()` de `memoryCore.ts` (con sources dedicados `agent-runtime`, `agent-consensus`, `skill`), lo que sincroniza automáticamente Query Index y queda visible en Q-Vault.
- **Alternativas:** crear un almacén paralelo para el runtime de agentes (rechazada: fragmentaría la memoria; el libro define Q-Vault como fuente única de verdad).
- **Motivo:** reutiliza el pipeline determinista existente (`.tbit` + índices + wikilinks) sin duplicar infraestructura.

## D-009 — Verificación cruzada anti-alucinación con herramientas existentes
- **Decisión:** antes de consolidar la respuesta final, el orquestador contrasta las afirmaciones clave contra `searchQueryIndex()` (Query Index) y, cuando aplica, `documentQa`; si el contexto recuperado contradice una afirmación, se marca la premisa como no verificada y se cita la fuente de Q-Vault.
- **Alternativas:** confiar solo en el consenso multi-IA (rechazada: los modelos comparten sesgos; la verificación debe ser contra el vault persistido).
- **Motivo:** Objetivo 3 (autocorrección sin alucinación) usando la infraestructura existente.

## D-010 — Empaquetado multiplataforma
- **Decisión:** la app se distribuye como aplicación web local (Node + Express + Vite) que funciona idéntica en Windows/macOS/Linux, sin añadir Electron/Tauri en esta evolución. Rutas y paths ya son multiplataforma (`path`, `tbitRuntimePaths.ts`).
- **Alternativas:** añadir Electron (rechazada: dependencia pesada nueva, alto riesgo, el libro lista "instalador desktop/empaquetado cross-platform" como pendiente futuro, no como capacidad actual); Tauri (rechazada: requiere toolchain Rust ajeno al stack).
- **Motivo:** restricción de no sustituir tecnología y de justificar dependencias; la paridad real del stack actual es total al ser una app web local. Limitación documentada: no se verificó ejecución en macOS/Linux desde este entorno Windows.

- **Motivo:** los `.agent.md` son la definición autoritativa (así lo declara el test y el roadmap de ingeniería). El loader reutiliza la misma semántica de parseo del test para que ambos no puedan divergir silenciosamente.

## D-004 — Permisos/modelRequirements ausentes en specs → PolicyOverlay en runtime
- **Decisión:** los gaps documentados (`permissions`, `modelRequirements` ausentes en los 18 markdown) se cubren con una capa de overlay en el runtime (valores por defecto seguros por rol), sin modificar los archivos `.agent.md`.
- **Alternativas:** editar los 18 markdown para añadir frontmatter (rechazada: rompería el test de inventario que congela su ausencia y la directiva prohíbe alterar definiciones vigentes).
- **Motivo:** el propio test documenta que el PolicyOverlay es la solución prevista ("gap que cubrirá el PolicyOverlay como capa versionada, no modificando los markdown").

## D-005 — Empaquetado de escritorio: lanzador propio sin dependencias nuevas (Tanda 3, Fase 77)
- **Decisión:** implementar el empaquetado de escritorio como un lanzador multiplataforma propio (`scripts/launch-desktop.cjs`, script npm `start:desktop`) que construye los artefactos si faltan, arranca UN único proceso `node dist/server.js` y abre el navegador del sistema. `server.ts` sirve el frontend construido (`dist/`) desde el mismo proceso cuando existe `dist/index.html` (middleware estático aditivo + fallback SPA que no toca rutas `/api`).
- **Alternativas:** (a) **Electron** — rechazada: añade ~200 MB de runtime y una dependencia mayor solo para envolver una app web local que ya funciona en navegador; la directiva exige justificar cada dependencia y limitar el cambio a lo imprescindible. (b) **Tauri** — rechazada: requiere toolchain Rust ajeno al stack Node/TypeScript del proyecto. (c) `vite preview` como segundo proceso — rechazada: lanzaría dos procesos para la misma app; aunque `vite preview` no toca el almacenamiento, un solo proceso es más simple y coherente con el guard de instancia única (Fase 74).
- **Motivo:** es la opción más ligera compatible con el stack (cero dependencias nuevas), preserva la API pública y el motor `.tbit`, respeta la restricción de no lanzar procesos paralelos sobre el mismo almacenamiento (un único servidor toca el vault) y funciona idénticamente en Windows/macOS/Linux salvo el comando de apertura de navegador, que se resuelve con `process.platform` en el lanzador (herramienta de desarrollo, no runtime de la app).
- **Limitación:** no hay instalador nativo (.msi/.dmg/.AppImage); el empaquetado es de aplicación local ejecutable con Node instalado. Marcado como NO VERIFICADO en macOS/Linux hasta que el flujo CI (Fase 75) corra en esos sistemas.

## D-011 — Content-Type JSON acotado a /api y entrega estática en módulo propio (Tanda 4, Fase 79)
- **Decisión:** el middleware que fijaba `Content-Type: application/json` en TODAS las respuestas de `server.ts` queda acotado a `/api` (todas las rutas del API son `/api/*`), y la entrega del frontend compilado se extrae a `src/staticFrontend.ts` (`registerStaticFrontend`): Content-Types reales, 404 JSON para `/assets/*` inexistentes, reserva SPA solo para navegación (Accept: text/html) y `X-Content-Type-Options: nosniff`.
- **Alternativas:** (a) eliminar el middleware global por completo — rechazada: aunque `res.json()` fija su propio Content-Type, acotarlo a `/api` preserva el comportamiento exacto de todas las rutas existentes con el cambio mínimo; (b) sobreescribir el Content-Type en el middleware estático tras `sendFile` — rechazada: parche superficial que no corrige la contaminación de origen.
- **Motivo:** causa raíz del síntoma B (HTML mostrado como texto): `send`/`express.static` no sobreescriben un Content-Type ya presente. Verificado con curl contra el servidor real.

## D-012 — Sin manualChunks y carga diferida real de la pila 3D (Tanda 4, Fase 79)
- **Decisión:** se elimina por completo `manualChunks` de `vite.config.ts` y las escenas 3D se extraen verbatim de `App.tsx` a `src/quantum/QuantumScenes.tsx` (tipos compartidos en `src/quantum/quantumTypes.ts`), cargadas con `React.lazy` + `Suspense` y fallback accesible.
- **Alternativas:** (a) mantener `manualChunks` aislando solo three/fiber/drei — rechazada tras medir: produce el chunk circular `vendor-fiber -> vendor-three-core -> vendor-fiber` (cualquier frontera manual entre librerías acopladas crea ciclos); (b) mantener todo estático como antes de la Fase 78 — rechazada: precarga 810 kB de three-core en cada arranque.
- **Motivo:** la pila 3D es exclusiva del módulo de importación dinámica, así que Rollup la coloca solo en el chunk asíncrono sin fronteras artificiales: 0 modulepreload de three/fiber/drei, sin chunks circulares, entrada de 407 kB. `npm run verify:bundle` congela esta garantía en CI.

## D-013 — outDir separados: frontend en dist/frontend (Tanda 4, Fase 79)
- **Decisión:** `vite build` compila en `dist/frontend`; `server.ts` y `scripts/launch-desktop.cjs` apuntan a `dist/frontend/index.html`. La lógica de servidor sigue en `dist/*.js` (tsconfig.node.json).
- **Alternativas:** `emptyOutDir: false` en el outDir compartido — rechazada: acumula assets obsoletos con hashes antiguos y deja los dos builds compitiendo por el mismo directorio.
- **Motivo:** defecto latente detectado en el diagnóstico: `vite build` vaciaba `dist/` y borraba `dist/server.js`. Separar artefactos elimina la colisión de raíz.

## D-014 — playwright-core como devDependency para verificación en navegador real (Tanda 4, Fase 79)
- **Decisión:** se añade `playwright-core` (devDependency) y el script `npm run verify:browser` (`scripts/verify-browser.cjs`), que abre la URL en el Chrome/Edge del sistema (`channel: "chrome"`, con fallback `"msedge"`) y comprueba que `#root` dibuja, que aparece el primer arranque y que no hay excepciones no capturadas.
- **Alternativas:** (a) Playwright completo — rechazada: su postinstall descarga navegadores (~150 MB) y penalizaría `npm ci` en CI en los tres sistemas; (b) no añadir nada y dejar la verificación como procedimiento manual — rechazada: esta clase de regresión (pantalla negra, HTML como texto) es invisible para las pruebas HTTP existentes, que validaban solo códigos 200.
- **Motivo:** la directiva de la Tanda 4 pide verificación en navegador real y permite justificar la devDependency. `playwright-core` no descarga navegadores ni tiene postinstall pesado: CI sigue funcionando sin cambios (el script no forma parte de `npm test` ni del flujo CI; requiere un navegador de sistema, no garantizado en los runners).
