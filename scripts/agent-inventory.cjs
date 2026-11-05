#!/usr/bin/env node
/**
 * Fase 0 — Generador de inventario de agentes (blueprint TBit_AI_Evolution_Blueprint.md, §27).
 *
 * Extrae el frontmatter real de .github/agents/*.agent.md y emite:
 *   - engineering/reports/phase-0-agent-inventory.json (inventario machine-readable)
 *   - resumen por stdout
 *
 * Este script es la base del futuro AgentSpecLoader (Fase 1). No modifica nada:
 * solo lee y reporta. Evidencia > suposicion.
 */
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const AGENTS_DIR = path.join(ROOT, ".github", "agents");
const REPORT_PATH = path.join(ROOT, "engineering", "reports", "phase-0-agent-inventory.json");

function parseInlineList(value) {
  const inner = value.replace(/^\[/, "").replace(/\]$/, "");
  return inner
    .split(",")
    .map((item) => item.trim().replace(/^['"]|['"]$/g, ""))
    .filter(Boolean);
}

function parseBlockList(frontmatter, key) {
  const match = frontmatter.match(new RegExp(`^${key}:\\r?\\n((?:[ \\t]+- .*\\r?\\n?)+)`, "m"));
  if (!match) return null;
  return match[1]
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^-[ \t]*/, ""));
}

function scalar(frontmatter, key) {
  const match = frontmatter.match(new RegExp(`^${key}:[ \\t]*(.*)$`, "m"));
  return match ? match[1].trim() : null;
}

function extractSpec(file) {
  const raw = fs.readFileSync(path.join(AGENTS_DIR, file), "utf8");
  const frontmatterMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!frontmatterMatch) {
    throw new Error(`${file}: sin frontmatter delimitado por ---`);
  }
  const frontmatter = frontmatterMatch[1];

  const toolsScalar = scalar(frontmatter, "tools");
  const tools = toolsScalar
    ? parseInlineList(toolsScalar)
    : parseBlockList(frontmatter, "tools") ?? [];

  return {
    file,
    name: scalar(frontmatter, "name") ?? "",
    description: (scalar(frontmatter, "description") ?? "").replace(/^['"]|['"]$/g, ""),
    capabilities: parseBlockList(frontmatter, "capabilities") ?? [],
    tools,
    toolsFormat: toolsScalar ? "inline-array" : "block-list",
    argumentHint: scalar(frontmatter, "argument-hint") ?? "",
    permissions: /^permissions:/m.test(frontmatter),
    modelRequirements: /^modelRequirements:/m.test(frontmatter),
    bodyBytes: Buffer.byteLength(raw.slice(raw.indexOf("---", 3) + 3), "utf8")
  };
}

const specs = fs
  .readdirSync(AGENTS_DIR)
  .filter((file) => file.endsWith(".agent.md"))
  .sort()
  .map(extractSpec);

const report = {
  generatedAt: new Date().toISOString(),
  source: ".github/agents",
  totalAgents: specs.length,
  contract: {
    presentInAll: ["name", "description", "capabilities", "tools", "argument-hint"],
    absentInAll: ["permissions", "modelRequirements"],
    toolsVocabulary: [...new Set(specs.flatMap((spec) => spec.tools))].sort(),
    knownGaps: [
      "permissions: ausente en todos los specs -> lo cubrira el PolicyOverlay (Fase 1)",
      "modelRequirements: ausente en todos los specs -> lo cubrira el PolicyOverlay (Fase 1)",
      "GraphEngineeringAgent: no existe -> diseno pendiente (Fase 3)"
    ]
  },
  specs
};

fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), "utf8");

console.log(`Agentes inventariados: ${report.totalAgents}`);
for (const spec of specs) {
  console.log(
    `${spec.file.padEnd(36)} | ${spec.name.padEnd(28)} | tools=[${spec.tools.join(",")}] | caps=${spec.capabilities.length} | ${spec.toolsFormat}`
  );
}
console.log(`Inventario JSON: ${path.relative(ROOT, REPORT_PATH)}`);
