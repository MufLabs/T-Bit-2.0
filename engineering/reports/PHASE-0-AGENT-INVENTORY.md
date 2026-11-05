# PHASE 0 — Inventario de Agentes (baseline verificada)

> Generado el 2026-09-23 desde el repositorio real (`c:\Ai_tools\TBit2.0`).
> **Actualizado 2026-10-07:** el inventario pasó de 17 a **18 especificaciones**
> tras el commit `c434507` ("GraphEngineering creation") que añadió
> `GraphEngineeringAgent.agent.md` — definición que el roadmap de ingeniería
> (`engineering/Ai_evolution_roadmap.md` §6) declara autoritativa.
> Fuente de verdad: frontmatter de `.github/agents/*.agent.md`.
> Este documento corrige la sección §27 del blueprint y refuta dos afirmaciones
> del análisis previo de Qwen: (1) son **18 agentes, no 16**; (2) el
> **Context Engineer SÍ existe**; (3) los specs **SÍ declaran tools y capabilities**
> (la corrección C1 de Qwen solo es válida para `permissions` y `modelRequirements`).
>
> Inventario machine-readable: `engineering/reports/phase-0-agent-inventory.json`
> (regenerable con `npm run agents:inventory`).
> Contrato congelado por tests: `tests/agentSpecs.inventory.test.ts`.

## Inventario real (18 especificaciones)

| # | Archivo | Rol (`name`) | Tools | Capabilities | Formato tools |
|---|---------|--------------|-------|--------------|---------------|
| 1 | AiSystemEngineer.agent.md | AI Systems Engineer | read, search, edit, vscode | 7 | inline |
| 2 | BackendEngineering.agent.md | Backend Engineer | read, search, edit, vscode | 6 | inline |
| 3 | ChiefArchitect.agent.md | Chief Architect | read, search, edit, vscode | 6 | inline |
| 4 | CodeReviewer.agent.md | Code Reviewer | read, search | 5 | inline |
| 5 | ConsensusAgent.agent.md | Consensus Agent | read, search, agent | 4 | inline |
| 6 | ContextEngineer.agent.md | Context Engineer | read, search | 10 | **block-list** |
| 7 | DatabaseIntegrationEngineer.agent.md | Database Integration Manager | read, search, edit, vscode | 5 | inline |
| 8 | DeveloperAgent.agent.md | Developer Agent | read, search | 14 | inline |
| 9 | DevOpsEngineer.agent.md | DevOps Engineer | read, search, edit, vscode | 7 | inline |
| 10 | DocumentationEngineer.agent.md | Documentation Engineer | read, search, edit, vscode | 4 | inline |
| 11 | EngineeringManager.agent.md | Engineering Manager | read, search, agent | 5 | inline |
| 12 | GraphEngineeringAgent.agent.md | Graph Engineering Agent | read, search, edit, vscode | 8 | inline |
| 13 | PerformanceEngineer.agent.md | Performance Engineer | read, search, edit, vscode | 5 | inline |
| 14 | PromptEngineer.agent.md | Prompt Engineer | read, search, edit, vscode | 4 | inline |
| 15 | SecurityAuditor.agent.md | Security Auditor | read, search, edit, vscode | 5 | inline |
| 16 | StorageEngineer.agent.md | Storage Engineer | read, search, edit, vscode | 4 | inline |
| 17 | UI-UXArchitect.agent.md | UI/UX Architect | read, search, edit, vscode | 4 | inline |
| 18 | ValidationEngineer.agent.md | Validation Agent | read, search | 5 | inline |

## Contrato de frontmatter verificado

**Presente en los 18 specs:**
- `name` — nombre del rol (no vacío)
- `description` — responsabilidad (todos > 40 caracteres)
- `capabilities` — lista YAML en bloque (4–14 items por agente)
- `tools` — lista inline `['read','search',...]` **o** bloque YAML (caso ContextEngineer)
- `argument-hint` — entradas esperadas

**Ausente en los 18 specs (gap del PolicyOverlay, Fase 1):**
- `permissions` — políticas de permisos por agente
- `modelRequirements` — requisitos de modelo (capability flags, familias)

**Vocabulario de tools cerrado:** `read`, `search`, `edit`, `vscode`, `agent`
(note: `agent` = invocación de otros agentes; solo ConsensusAgent y EngineeringManager lo declaran).

## Implicaciones para la Fase 1 (Agent Loader → Registry → Runtime)

1. **El loader debe soportar ambos formatos de `tools`** (inline-array y block-list). Ya implementado en `scripts/agent-inventory.cjs` y validado por tests.
2. **El PolicyOverlay se reduce a `permissions` + `modelRequirements`**: no hay que inventar tools, ya están declarados en los specs. El overlay debe ser una matriz versionada en código, NO una modificación de los markdown.
3. **GraphEngineeringAgent ya existe** (commit `c434507`; roadmap §6 lo declara autoritativo). No debe duplicarse ni reemplazarse; el runtime de grafos de ejecución sigue siendo una capacidad faltante (fases posteriores del roadmap).
4. **Ningún módulo del runtime importa hoy estos archivos** — son especificaciones sin conexión, tal como documenta §5 del blueprint. La Fase 1 los convierte en entidades runtime.
5. `DatabaseIntegrationEngineer.agent.md` declara rol "Database Integration Manager" (discrepancia nombre de archivo vs rol, a normalizar en el Registry).

## Cómo regenerar

```bash
npm run agents:inventory   # regenera engineering/reports/phase-0-agent-inventory.json
npm test                   # valida el contrato (tests/agentSpecs.inventory.test.ts)
```
