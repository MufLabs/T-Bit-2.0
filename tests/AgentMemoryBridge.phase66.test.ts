import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setActiveTBitDataDir, getActiveTBitDataDir } from "../tbitRuntimePaths";
import {
  buildVaultContext,
  persistAgentRun,
  persistSwarmConsensus,
  verifyAgainstVault,
} from "../src/agents/AgentMemoryBridge";
import { searchQueryIndex } from "../queryIndex";
import type { AgentRunResult, AgentSwarmResult } from "../src/agents/AgentOrchestrator";

/**
 * Fase 66 — Memoria evolutiva: el runtime de agentes escribe y lee Q-Vault.
 * Aislado en un directorio temporal via setActiveTBitDataDir.
 */

const ORIGINAL_DATA_DIR = getActiveTBitDataDir();
let dir: string;

function fakeRun(agent: string, output: string, taskId = "task_test_1"): AgentRunResult {
  return {
    agent,
    agentFile: `${agent}.agent.md`,
    taskId,
    status: "completed",
    output,
    toolCalls: 0,
    providerLabel: "Deterministic T-BIT",
    model: "local-rules",
    latencyMs: 12,
  };
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "tbit-agent-memory-"));
  setActiveTBitDataDir(dir);
});

afterAll(async () => {
  setActiveTBitDataDir(ORIGINAL_DATA_DIR);
  await rm(dir, { recursive: true, force: true });
});

describe("AgentMemoryBridge — Fase 66", () => {
  it("persiste la ejecucion de un agente en Q-Vault y queda consultable", async () => {
    const info = await persistAgentRun(
      fakeRun("Code Reviewer", "Revisado el modulo de pagos: riesgo medio en reintentos."),
      "Revisar modulo de pagos",
      "tester",
    );
    expect(info.key).toContain("AI::AgentRuntime::Code_Reviewer");
    expect(info.checksum).toMatch(/^[a-f0-9]{64}$/);

    const search = await searchQueryIndex({ query: "pagos", userId: "tester" });
    expect(search.results.some((result) => result.key === info.key)).toBe(true);
    expect(search.results.find((result) => result.key === info.key)?.source).toBe("agent-runtime");
  });

  it("persiste la bitacora de consenso con wikilinks a las ejecuciones", async () => {
    const run = fakeRun("Chief Architect", "Propuesta: cache incremental por fingerprint.");
    const runInfo = await persistAgentRun(run, "Disenar cache", "tester");
    const swarm: AgentSwarmResult = {
      taskId: "task_test_1",
      task: "Disenar cache",
      results: [run],
      verdicts: [
        { validator: "Consensus Agent", targetAgent: "Chief Architect", verdict: "aprobado", notes: "ok" },
      ],
      consolidated: "Consolidado: cache incremental.",
      events: [],
    };
    const consensus = await persistSwarmConsensus(swarm, "Disenar cache", "tester");

    expect(consensus.key).toBe("AI::AgentConsensus::task_test_1");
    expect(consensus.links).toContain(runInfo.key);
  });

  it("buildVaultContext recupera contexto relevante del vault", async () => {
    const retrieved = await buildVaultContext("cache incremental fingerprint", "tester");
    expect(retrieved.citations.length).toBeGreaterThan(0);
    expect(retrieved.contextText).toContain("CONTEXTO RECUPERADO DE Q-VAULT");
  });

  it("verifyAgainstVault marca terminos con y sin respaldo en el vault", async () => {
    const verification = await verifyAgainstVault(
      "El cache incremental por fingerprint es viable, aunque la criptografia cuantica queda pendiente.",
      "tester",
    );
    expect(verification.checkedTerms.length).toBeGreaterThan(0);
    expect(verification.verifiedTerms).toContain("cache");
    expect(verification.citations.length).toBeGreaterThan(0);
    // Terminos sin ningun registro en el vault quedan marcados como no verificados.
    expect(verification.unverifiedTerms.length).toBeGreaterThan(0);
  });

  it("verifyAgainstVault sin vault vacio no falla", async () => {
    const verification = await verifyAgainstVault("palabra completamente ajena al vault", "usuario-sin-memorias");
    expect(verification.verifiedTerms.length).toBe(0);
    expect(verification.unverifiedTerms.length).toBeGreaterThan(0);
  });
});
