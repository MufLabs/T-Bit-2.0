# DECISIONES — T-Bit 2.0 (rama `feature/completar-app`)

> Registro de decisiones autónomas tomadas durante la completación de la app.
> Cada entrada: decisión, alternativas consideradas, motivo basado en evidencia del repo.

## D1 — Corregir el test del inventario de agentes (no eliminar el GraphEngineeringAgent)

- **Decisión:** Actualizar `tests/agentSpecs.inventory.test.ts` para reflejar el baseline real de **18 especificaciones**, incluyendo `GraphEngineeringAgent.agent.md` como contrato válido.
- **Alternativas:** (a) eliminar el agente para volver a 17; (b) dejar el test en rojo.
- **Motivo:** `engineering/Ai_evolution_roadmap.md` §6 declara explícitamente "GraphEngineeringAgent.agent.md already exists — Do NOT create a duplicate. Do NOT replace it. Use the existing definition as the authoritative project agent definition". El commit `c434507` ("GraphEngineering creation") lo añadió de forma intencional; el test había congelado un baseline anterior (17). Eliminar el agente contradiría el roadmap de ingeniería; dejar el test en rojo viola el criterio "todos los tests pasan".

## D2 — `"types": ["vite/client"]` en `tsconfig.json` para `import.meta.env`

- **Decisión:** Añadir los tipos de cliente de Vite a `tsconfig.json` (compilerOptions.types).
- **Alternativas:** (a) declarar `ImportMeta` a mano en un `.d.ts`; (b) cambiar cada uso a `process.env`.
- **Motivo:** Vite ya es la herramienta de build del proyecto (`vite.config.ts` presente); los tipos oficiales de Vite son la forma estándar y soportada de tipar `import.meta.env`. No añade dependencia (vite ya está en devDependencies) ni cambia comportamiento en runtime. Las alternativas duplican tipos oficiales o romperían el modo dev de Vite.

## D3 — `QuantumTelemetryRay.tsx` con objetos THREE explícitos + `<primitive>`

- **Decisión:** Construir los `THREE.Line` con `LineDashedMaterial` de forma imperativa (`useMemo`) y montarlos con `<primitive object={...} />`, en lugar del JSX `<line>`/`<lineDashedMaterial>`.
- **Alternativas:** (a) suprimir errores con `@ts-expect-error`; (b) castear refs a `any`.
- **Motivo:** En esta versión de `@react-three/fiber` + React 18, el elemento JSX `line` colisiona con el elemento SVG `line` del DOM y produce 4 errores de tipos reales. El objeto imperativo produce exactamente el mismo render (línea discontinua animada + anti-línea + esfera + modo compresión de gravedad) sin suprimir el type-checker. Se preserva la API del componente (`QuantumTelemetryRay` default + named export) y el store `useTBitStore`.

## D4 — Corrección de tipos del cliente semántico según el contrato real del backend

- **Decisión:** En `src/App.tsx`, usar `response.index.model` (búsqueda) y `response.index.totalRecords`/`response.index.model` (rebuild), y `result.textPreview` en la lista de resultados; tipar `semanticIndexClient.rebuild()` con el shape real.
- **Alternativas:** Silenciar con cast `as any`.
- **Motivo:** Verificado contra `server.ts` (`/api/semantic/rebuild` devuelve `{ ok, index: { builtAt, totalRecords, model, dimensions } }`) y contra `SemanticSearchResult` (tiene `textPreview`, no `snippet`). El código anterior interpolaba campos inexistentes → en runtime mostraban `undefined` en los mensajes de estado. Corregirlo arregla tanto el tipo como un bug visible real.

## D5 — No añadir dependencias nuevas

- **Decisión:** Ninguna dependencia nueva. Todos los fixes usan el stack existente (crypto de Node, three, vitest, vite).
- **Motivo:** Ningún problema verificado lo requería. Se cumple la restricción de no añadir dependencias salvo justificación estricta.

## D6 — API key con comparación timing-safe (hardening sin cambio de comportamiento)

- **Decisión:** Comparar la API key recibida contra la esperada con SHA-256 + `crypto.timingSafeEqual` (mismo patrón que ya usa el proyecto para HMAC), tanto en el middleware global (`app.use("/api", ...)`) como en `requireSymbolicApiKey`.
- **Alternativas:** Dejar `!==` (funciona, pero filtra timing en teoría).
- **Motivo:** El proyecto ya exige comparación timing-safe para HMAC de metadata (documentado en `docs/T-BIT_BOOK.md` §4 y `PROJECT_STATE.MD`); aplicar el mismo estándar a la llave de API es consistente y no cambia mensajes, códigos ni comportamiento externo.

## D7 — Commitear `engineering/reports/AI-EVOLUTION-BASELINE.md` con addendum de verificación

- **Decisión:** Commitear el reporte de Phase 0 (hasta ahora untracked) añadiendo un addendum que corrige sus hallazgos P3 y P4 con evidencia de runtime.
- **Alternativas:** (a) no commitearlo; (b) reescribir sus secciones internas.
- **Motivo:** El roadmap de ingeniería (§29) exige producir ese reporte como artefacto de Phase 0; dejarlo untracked rompe la trazabilidad del ECR. P3 ("`/api/ai/inject` y `/api/ai/oracle` sin protección") quedó refutado en runtime: el middleware global `app.use("/api", ...)` (server.ts L268) devuelve 401 sin llave para TODOS los endpoints `/api` (verificado con `POST /api/ai/inject` sin header → 401). P4 ("`operar_simbolicamente` no declarada") quedó refutado leyendo `TBitToolSchemas.ts` L121-124: se declara vía spread de `tbitSymbolicTools`. Se corrige con addendum y constancia en el changelog en lugar de reescribir el hallazgo original, preservando la historia del documento.

## D8 — Actualizar snapshot de docs contra el árbol real; no reestructurar el código

- **Decisión:** Regenerar la lista de archivos de `docs/ProjectSnapshot.txt` para reflejar los archivos que existen realmente (p. ej. `assetManagerClient.ts` en lugar de `assetClient.ts`; componentes consolidados en `App.tsx`), en lugar de "recrear" los archivos que el snapshot lista pero no existen.
- **Alternativas:** (a) crear ~10 componentes/clients inexistentes para que el snapshot sea cierto; (b) dejar el snapshot desactualizado.
- **Motivo:** No hay evidencia de que falte funcionalidad por esos archivos ausentes: `App.tsx` contiene las implementaciones correspondientes (settings modal, first-run setup, mapa Q-Vault, chat console, etc. — verificables en el código fuente). La documentación debe seguir al código, no al revés. Reestructurar el monolito de 285 KB contradiría la regla "extender, no reemplazar".

## D9 — Artefactos runtime de pruebas fuera del commit

- **Decisión:** Excluir de los commits los artefactos runtime creados por las pruebas de humo (`data/spaces/`, `*.tbit.lock`) añadiéndolos a `.gitignore`; restaurar los contenedores binarios trackeados modificados por las pruebas (`universo.tbit`, `data/ai_memoria.tbit*`) a su estado en HEAD antes de commitear.
- **Alternativas:** Commitear los contenedores con datos de prueba.
- **Motivo:** Los contenedores `.tbit` del repo son artefactos de demostración del estado inicial; commitear mutaciones de smoke test ensuciaría la historia. `docs/ProjectSnapshot.txt` ya declara `data/*.tbit` y WAL como "runtime/generated, not canonical".

## D10 — Alcance: no implementar el Agent Runtime multi-agente (fases 1–11)

- **Decisión:** No implementar las fases 1–11 del blueprint de evolución IA (Agent Loader, Registry, PolicyOverlay, Graph Runtime, Consenso, etc.) en esta pasada.
- **Alternativas:** Implementar la Fase 1 del roadmap.
- **Motivo:** El objetivo del encargo es que la app quede "completamente funcional, usable y lista para ejecutarse, cumpliendo el propósito que la documentación y el código ya definen". La documentación de ingeniería (roadmap §29, PROJECT_STATE) exige un flujo ECR con revisión/aprobación entre fases y el propio roadmap clasifica esas fases como no implementadas por diseño ("Do not proceed from one phase until the previous phase is verified"). La app ES completamente funcional hoy (verificado) sin ese runtime: es una capa futura de evolución, no una funcionalidad faltante. Implementarla de forma unilateral contradiría el flujo ECR vigente del proyecto.

## D11 — Crear `docs/CHANGELOG.md` como registro de cambios

- **Decisión:** Crear un registro de cambios nuevo en `docs/CHANGELOG.md` con entradas datadas (fecha, descripción, archivos, motivo).
- **Alternativas:** Repartir el registro en los archivos afectados.
- **Motivo:** El encargo exige un registro de cambios; no existe ninguno previo en `docs/` (verificado por listado). Un único archivo en la carpeta canónica de documentación, indexado desde `docs/README.md`, mantiene una sola fuente de verdad respetando la política documental existente.

