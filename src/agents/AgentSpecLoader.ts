import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * AgentSpecLoader — Fase 64 (Runtime Multi-Agente).
 *
 * Carga las 18 especificaciones de agentes desde `.github/agents/*.agent.md`
 * usando exactamente el mismo contrato de frontmatter congelado por
 * `tests/agentSpecs.inventory.test.ts`:
 *   name, description, capabilities (bloque), tools (inline o bloque),
 *   argument-hint -> presentes en todos.
 *   permissions, modelRequirements -> ausentes (gap cubierto por PolicyOverlay
 *   en el runtime, no modificando los markdown).
 *
 * Los `.agent.md` son la definicion autoritativa (ver
 * engineering/Ai_evolution_roadmap.md y el test de inventario).
 */

export const AGENTS_DIR = join(process.cwd(), ".github", "agents");

export type AgentSpec = {
  file: string;
  name: string;
  description: string;
  capabilities: string[];
  tools: string[];
  argumentHint: string;
  /** Cuerpo markdown del spec (instrucciones de rol), sin el frontmatter. */
  body: string;
};

export type AgentPolicyOverlay = {
  canRead: boolean;
  canSearch: boolean;
  canCompute: boolean;
  canWrite: boolean;
  canDelete: boolean;
  requireDeleteConfirmation: boolean;
  /** Herramientas del vocabulario del runtime que el agente puede invocar. */
  allowedTools: string[];
};

function parseInlineList(value: string): string[] {
  const inner = value.replace(/^\[/, "").replace(/\]$/, "");
  return inner
    .split(",")
    .map((item) => item.trim().replace(/^['"]|['"]$/g, ""))
    .filter(Boolean);
}

function parseBlockList(frontmatter: string, key: string): string[] | null {
  const blockMatch = frontmatter.match(
    new RegExp(`^${key}:\\r?\\n((?:[ \\t]+- .*\\r?\\n?)+)`, "m"),
  );
  if (!blockMatch) return null;
  return blockMatch[1]
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^-[ \t]*/, ""));
}

function scalar(frontmatter: string, key: string): string | null {
  const match = frontmatter.match(new RegExp(`^${key}:[ \\t]*(.*)$`, "m"));
  return match ? match[1].trim() : null;
}

function parseAgentFile(file: string, raw: string): AgentSpec {
  const frontmatterMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!frontmatterMatch) {
    throw new Error(`${file}: no tiene bloque de frontmatter delimitado por ---`);
  }
  const frontmatter = frontmatterMatch[1];
  const body = raw.slice(frontmatterMatch[0].length).trim();

  const toolsScalar = scalar(frontmatter, "tools");
  const tools = toolsScalar
    ? parseInlineList(toolsScalar)
    : parseBlockList(frontmatter, "tools") ?? [];

  const capabilities = parseBlockList(frontmatter, "capabilities") ?? [];
  const description = scalar(frontmatter, "description") ?? "";

  return {
    file,
    name: scalar(frontmatter, "name") ?? "",
    description: description.replace(/^['"]|['"]$/g, ""),
    capabilities,
    tools,
    argumentHint: scalar(frontmatter, "argument-hint") ?? "",
    body,
  };
}

let cachedSpecs: AgentSpec[] | null = null;

export function loadAgentSpecs(agentsDir: string = AGENTS_DIR): AgentSpec[] {
  if (cachedSpecs && agentsDir === AGENTS_DIR) return cachedSpecs;
  const specs = readdirSync(agentsDir)
    .filter((file) => file.endsWith(".agent.md"))
    .sort()
    .map((file) => parseAgentFile(file, readFileSync(join(agentsDir, file), "utf8")));
  if (agentsDir === AGENTS_DIR) cachedSpecs = specs;
  return specs;
}

export function getAgentSpec(name: string, agentsDir: string = AGENTS_DIR): AgentSpec | undefined {
  const normalized = name.normalize("NFC").trim().toLowerCase();
  return loadAgentSpecs(agentsDir).find(
    (spec) => spec.name.toLowerCase() === normalized || spec.file.toLowerCase() === normalized,
  );
}

/**
 * PolicyOverlay (D-004): los specs no declaran `permissions`; el runtime deriva
 * una politica segura por defecto a partir del vocabulario de tools declarado.
 * Ningun agente obtiene borrado sin confirmacion humana.
 */
export function deriveAgentPolicy(spec: AgentSpec): AgentPolicyOverlay {
  const tools = new Set(spec.tools);
  return {
    canRead: tools.has("read") || tools.has("search"),
    canSearch: tools.has("search") || tools.has("read"),
    canCompute: tools.has("read") || tools.has("edit"),
    canWrite: tools.has("edit"),
    canDelete: false,
    requireDeleteConfirmation: true,
    allowedTools: [...tools],
  };
}

export function buildAgentSystemPrompt(spec: AgentSpec, options: { task?: string; userId?: string } = {}): string {
  const lines = [
    "[T-BIT AGENT RUNTIME]",
    `Nombre: ${spec.name}`,
    `Especificacion: ${spec.file}`,
    `Rol operativo: ${spec.description}`,
    `Capacidades: ${spec.capabilities.join(", ")}`,
    `Herramientas declaradas: ${spec.tools.join(", ") || "ninguna"}`,
  ];
  if (options.userId) lines.push(`Usuario activo T-BIT: ${options.userId}`);
  if (options.task) lines.push("", "=== TAREA ASIGNADA ===", options.task);
  lines.push(
    "",
    "=== REGLAS DEL RUNTIME ===",
    "- Opera dentro de tu rol. No inventes capacidades que no estan declaradas.",
    "- Cita registros de Q-Vault cuando uses memoria persistida.",
    "- Si no puedes verificar una afirmacion, marcala explicitamente como no verificada.",
  );
  if (spec.body) lines.push("", "=== INSTRUCCIONES DE LA ESPECIFICACION ===", spec.body);
  return lines.join("\n");
}
