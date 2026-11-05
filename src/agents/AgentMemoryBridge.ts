import { indexExternalMemoryRecord } from "../../memoryCore";
import { searchQueryIndex, type QuerySearchResult } from "../../queryIndex";
import { getAgentEventBus } from "./AgentEventBus";
import type { AgentRunResult, AgentSwarmResult } from "./AgentOrchestrator";

/**
 * AgentMemoryBridge — Fase 66 (Aprendizaje continuo y memoria permanente).
 *
 * Puente entre el runtime multi-agente y Q-Vault (memoryCore + Query Index):
 *
 *  - Toda ejecucion de agente y toda bitacora de consenso se persiste de forma
 *    determinista en el contenedor fisico via `indexExternalMemoryRecord`
 *    (sources dedicados `agent-runtime` y `agent-consensus`), lo que sincroniza
 *    automaticamente `memory-core-index.json` y `query-index.json`.
 *  - Los agentes reciben contexto relevante del vault antes de ejecutarse
 *    (`buildVaultContext`), convirtiendo a Q-Vault en la fuente unica de
 *    verdad de la memoria de la IA.
 *  - Las respuestas consolidadas se verifican contra el vault
 *    (`verifyAgainstVault`): los terminos sin respaldo almacenado quedan
 *    marcados como no verificados y se citan las fuentes que si lo respaldan.
 */

export type VaultCitation = {
  key: string;
  title: string;
  source: string;
  score: number;
  preview: string;
};

export type VaultVerification = {
  checkedTerms: string[];
  verifiedTerms: string[];
  unverifiedTerms: string[];
  citations: VaultCitation[];
};

export type PersistedMemoryInfo = {
  key: string;
  checksum: string;
  links: string[];
};

const STOPWORDS = new Set([
  "sobre", "entre", "para", "como", "donde", "cuando", "cual", "cuales", "este", "esta",
  "esto", "esos", "esas", "aquel", "aquella", "desde", "hasta", "segun", "mediante",
  "puede", "deben", "deberia", "deberian", "entonces", "tambien", "ademas", "aunque",
  "porque", "puesto", "mientras", "despues", "antes", "durante", "contra", "respecto",
  "the", "and", "for", "with", "that", "this", "from", "have", "has", "are", "was",
  "were", "will", "would", "could", "should", "into", "their", "there", "these", "those",
]);

function slugKeyPart(value: string): string {
  return value
    .normalize("NFC")
    .trim()
    .replace(/[^\p{L}\p{N}_-]+/gu, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

function extractSignificantTerms(text: string, maxTerms = 8): string[] {
  const terms = new Map<string, number>();
  for (const raw of text.normalize("NFC").toLowerCase().split(/[^\p{L}\p{N}_]+/u)) {
    if (raw.length < 5 || STOPWORDS.has(raw)) continue;
    terms.set(raw, (terms.get(raw) ?? 0) + 1);
  }
  return [...terms.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, maxTerms)
    .map(([term]) => term);
}

function toCitations(results: QuerySearchResult[]): VaultCitation[] {
  return results.map((result) => ({
    key: result.key,
    title: result.title,
    source: result.source,
    score: result.score,
    preview: result.textPreview.slice(0, 180),
  }));
}

export async function persistAgentRun(
  result: AgentRunResult,
  task: string,
  userId?: string,
): Promise<PersistedMemoryInfo> {
  const key = `AI::AgentRuntime::${slugKeyPart(result.agent)}::${slugKeyPart(result.taskId)}`;
  const consensusKey = `AI::AgentConsensus::${slugKeyPart(result.taskId)}`;
  const text = [
    `Ejecucion de agente T-BIT: ${result.agent}`,
    `Tarea: ${task}`,
    `Estado: ${result.status}`,
    `Proveedor: ${result.providerLabel} (${result.model})`,
    `Latencia: ${result.latencyMs} ms`,
    result.output ? `Salida: ${result.output}` : `Error: ${result.error ?? "desconocido"}`,
    `Bitacora de consenso relacionada: [[${consensusKey}]]`,
  ].join("\n");

  const record = await indexExternalMemoryRecord({
    key,
    userId: userId ?? "ai",
    text,
    payload: {
      tipo: "agent-runtime",
      agent: result.agent,
      taskId: result.taskId,
      task,
      status: result.status,
      output: result.output,
      error: result.error ?? null,
      provider: result.providerLabel,
      model: result.model,
      latencyMs: result.latencyMs,
    },
    tags: ["agent-runtime", "agente", slugKeyPart(result.agent).toLowerCase()],
    links: [consensusKey],
    source: "agent-runtime",
  });

  getAgentEventBus().publish({
    type: "memory.persisted",
    from: result.agent,
    taskId: result.taskId,
    payload: { key, checksum: record.checksum },
  });

  return { key, checksum: record.checksum, links: record.links };
}

export async function persistSwarmConsensus(
  swarm: AgentSwarmResult,
  task: string,
  userId?: string,
): Promise<PersistedMemoryInfo> {
  const key = `AI::AgentConsensus::${slugKeyPart(swarm.taskId)}`;
  const completed = swarm.results.filter((result) => result.status === "completed");
  const failed = swarm.results.filter((result) => result.status === "failed");
  const text = [
    `Bitacora de consenso del enjambre multi-agente T-BIT ${swarm.taskId}`,
    `Tarea: ${task}`,
    `Agentes ejecutados: ${swarm.results.length} (ok: ${completed.length}, fallos: ${failed.length})`,
    completed.map((result) => `- [[AI::AgentRuntime::${slugKeyPart(result.agent)}::${slugKeyPart(result.taskId)}]] ${result.agent}`).join("\n"),
    failed.length ? `Fallos: ${failed.map((result) => result.agent).join(", ")}` : "Sin fallos.",
    swarm.verdicts.length
      ? `Veredictos de validacion cruzada:\n${swarm.verdicts.map((verdict) => `- ${verdict.validator} sobre ${verdict.targetAgent}: ${verdict.verdict}`).join("\n")}`
      : "Sin validacion cruzada.",
    swarm.consolidated ? `Respuesta consolidada:\n${swarm.consolidated}` : "Sin respuesta consolidada.",
  ].join("\n");

  const record = await indexExternalMemoryRecord({
    key,
    userId: userId ?? "ai",
    text,
    payload: {
      tipo: "agent-consensus",
      taskId: swarm.taskId,
      task,
      totalAgents: swarm.results.length,
      completed: completed.length,
      failed: failed.map((result) => ({ agent: result.agent, error: result.error ?? null })),
      verdicts: swarm.verdicts,
      consolidated: swarm.consolidated,
    },
    tags: ["agent-consensus", "enjambre", "consenso"],
    links: completed.map((result) => `AI::AgentRuntime::${slugKeyPart(result.agent)}::${slugKeyPart(result.taskId)}`),
    source: "agent-consensus",
  });

  getAgentEventBus().publish({
    type: "memory.persisted",
    from: "AgentOrchestrator",
    taskId: swarm.taskId,
    payload: { key, checksum: record.checksum },
  });

  return { key, checksum: record.checksum, links: record.links };
}

export async function buildVaultContext(
  query: string,
  userId?: string,
  limit = 5,
): Promise<{ contextText: string | null; citations: VaultCitation[] }> {
  const search = await searchQueryIndex({ query, userId, limit });
  const results = search.results;
  if (results.length === 0) {
    return { contextText: null, citations: [] };
  }
  const citations = toCitations(results);
  const contextText = [
    "=== CONTEXTO RECUPERADO DE Q-VAULT (fuente de verdad persistida) ===",
    ...citations.map((citation, index) => `[${index + 1}] ${citation.key} (${citation.source}, score ${citation.score})\n${citation.preview}`),
  ].join("\n");
  return { contextText, citations };
}

export async function verifyAgainstVault(text: string, userId?: string): Promise<VaultVerification> {
  const terms = extractSignificantTerms(text);
  const verifiedTerms: string[] = [];
  const unverifiedTerms: string[] = [];
  const citations: VaultCitation[] = [];
  const seenKeys = new Set<string>();

  for (const term of terms) {
    const search = await searchQueryIndex({ query: term, userId, limit: 3 });
    const results = search.results;
    if (results.length > 0) {
      verifiedTerms.push(term);
      for (const result of results) {
        if (!seenKeys.has(result.key)) {
          seenKeys.add(result.key);
          citations.push(...toCitations([result]));
        }
      }
    } else {
      unverifiedTerms.push(term);
    }
  }

  return { checkedTerms: terms, verifiedTerms, unverifiedTerms, citations };
}

