# PROJECT_STATE — T-Bit 2.0

> Estado del proyecto según evidencia verificada del repositorio (2026-09-23;
> actualizado 2026-10-07 en la rama `feature/completar-app`).
> Este archivo es entrada declarada del Context Engineer y del flujo ECR
> (MUF Labs Engineering Framework). Actualizar en el cierre de cada fase.

## Qué es T-Bit 2.0

Contenedor de datos `.tbit` con interfaz visual 2D/3D (React + Three.js), backend
Express y capa de IA multi-provider con tools, memoria persistente y permisos.

## Estado actual (VERIFICADO en runtime, 2026-10-07)

- **Almacenamiento (fundación estable, NO tocar):** `TBitStorageService` + `TBitFileSystem` — WAL (`PENDING/COMMITTED/ABORTED`), HMAC-SHA256 con comparación timing-safe sobre metadata, cifrado AES-256-GCM en reposo (obligatorio, requiere `TBIT_ENCRYPTION_SECRET`), snapshots/rollback, réplica, checksum global. Cobertura por tests: `tests/TBitStorageService.smoke.test.ts`. Flujos raw (inyectar/recuperar), health y chat IA verificados de punta a punta contra `npx tsx server.ts`.
- **Capa IA actual:** `TBitChatEngine` (ruta SIMPLE con tool-loop de 2 pasos: `auto` → ejecutar tools → `none`), `AiProviderFactory` (10 providers del catálogo), `TBitLocalToolExecutor` (7 tools, todas declaradas en `TBitToolSchemas.ts`, incluida `operar_simbolicamente` vía `tbitSymbolicTools`), `aiPermissions`, `memoryCore`/`queryIndex`/`semanticIndex` sobre `data/ai_memoria.tbit`. Paridad congelada por tests: `tests/TBitChatEngine.parity.test.ts`, `tests/AiProvider.deterministic.test.ts`.
- **Tests:** harness vitest operativo (`npm test`): 26 tests, 4 archivos, todos pasando (el contrato de agentes quedó actualizado al baseline real de 18 specs; antes fallaban 2 tests por un baseline desactualizado de 17).
- **Type-check:** `npx tsc --noEmit` (frontend) y `npm run logic:build` (backend) en 0 errores; `npm run build` PASS.
- **Agentes:** 18 especificaciones en `.github/agents/` (MUF Labs Engineering Framework) — ver `engineering/reports/PHASE-0-AGENT-INVENTORY.md`. Son specs, no runtime. **GraphEngineeringAgent.agent.md existe** (commit `c434507`; el roadmap de ingeniería §6 lo declara autoritativo). Falta `permissions` y `modelRequirements` (los cubrirá el PolicyOverlay). No existe runtime de grafos de ejecución.
- **Flujo de ingeniería:** ECR activo en `engineering/` (ECR-0001). Workflow: carga de contexto → análisis → consenso → implementación → validación → cierre. Phase 0 del roadmap de evolución IA completada: `engineering/reports/AI-EVOLUTION-BASELINE.md` (con addendum de verificación 2026-10-07 que refuta sus hallazgos P3/P4).

## Evolución en curso

Baseline de evolución: `docs/TBit_AI_Evolution_Blueprint.md` (roadmap 0–11).
Roadmap operativo: `engineering/Ai_evolution_roadmap.md`.
Regla central: **extender, no reemplazar**. Fuera de scope: Q-Vault, storage físico, WAL, mapas 2D/3D de memoria.

- [x] Fase 0 (completa): harness de tests + inventario de agentes (18) + paridad de la ruta SIMPLE + baseline `AI-EVOLUTION-BASELINE.md` + type-check del frontend en verde (2026-10-07)
- [ ] Fase 0 (restante): decisión `ai_exec.tbit` (criterios: qué artefactos persisten, retención, aislamiento por usuario; probablemente no necesaria hasta Fase 5)
- [ ] Fase 1: Agent Loader → Registry → PolicyOverlay → Agent Runtime (1 agente, modo off/shadow/on)
- [ ] Fases 2–11: ver blueprint

## Documentación clave

- `docs/T-BIT_BOOK.md`, `docs/README.md` — documentación del sistema
- `docs/CHANGELOG.md` — registro de cambios del proyecto
- `docs/TBit_AI_Evolution_Blueprint.md` — plano de evolución (roadmap 0–11)
- `engineering/Ai_evolution_roadmap.md` — roadmap operativo de evolución IA
- `engineering/reports/AI-EVOLUTION-BASELINE.md` — baseline verificado de Phase 0
- `engineering/reports/PHASE-0-AGENT-INVENTORY.md` — inventario real de agentes (18)
- `engineering/reports/phase-0-agent-inventory.json` — inventario machine-readable (`npm run agents:inventory`)

## Comandos

```bash
npm run dev:all        # backend + frontend
npm test               # suite completa (vitest, 26 tests)
npx tsc --noEmit       # type-check estricto del frontend
npm run build          # build frontend (vite)
npm run logic:build    # build lógico del backend (tsc)
npm run agents:inventory
```

