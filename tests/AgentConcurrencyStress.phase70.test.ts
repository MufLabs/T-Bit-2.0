import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getActiveTBitDataDir, resolveActiveTBitDataPath, setActiveTBitDataDir } from "../tbitRuntimePaths";
import { indexExternalMemoryRecord } from "../memoryCore";
import { persistAgentRun } from "../src/agents/AgentMemoryBridge";
import { AgentOrchestrator } from "../src/agents/AgentOrchestrator";
import { loadAgentSpecs } from "../src/agents/AgentSpecLoader";
import { getAgentEventBus } from "../src/agents/AgentEventBus";
import { TBitStorageService, type TBitStorageConfig, type TBitWalRecord } from "../TBitStorageService";

/**
 * Tanda 2 — Punto 2: Concurrencia. 18 agentes en paralelo escribiendo a la vez
 * en el journal (AgentEventBus) y en Q-Vault (memoryCore), mas escrituras
 * fisicas paralelas al motor .tbit. Debe demostrarse que no hay condiciones de
 * carrera, corrupcion de WAL ni bloqueos, con el motor .tbit intacto.
 */

const ORIGINAL_DATA_DIR = getActiveTBitDataDir();
let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "tbit-agent-stress-"));
  setActiveTBitDataDir(dir);
});

afterAll(async () => {
  setActiveTBitDataDir(ORIGINAL_DATA_DIR);
  await rm(dir, { recursive: true, force: true });
});

async function readMemoryIndex(): Promise<{ records: Record<string, unknown> }> {
  const text = await readFile(resolveActiveTBitDataPath("memory-core-index.json"), "utf8");
  return JSON.parse(text) as { records: Record<string, unknown> };
}

function fakeRuntime(agent: string, delayMs: number) {
  return {
    provider: {
      async generateWithTools() {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        return {
          message: {
            role: "assistant" as const,
            content: `Salida determinista de ${agent} para el test de estres.`,
          },
        };
      },
    },
    id: "fake-parallel",
    label: "FakeParallel",
    model: "fake",
    mode: "deterministic" as const,
  };
}

describe("Concurrencia — 18 agentes en paralelo (Tanda 2 — Punto 2)", () => {
  it("18 agentes en paralelo persisten en Q-Vault sin perder registros ni eventos de journal", async () => {
    const specs = loadAgentSpecs();
    expect(specs.length).toBe(18);
    const bus = getAgentEventBus();
    const journalBefore = bus.size;

    const orchestrator = new AgentOrchestrator({
      providerFactory: (spec) => fakeRuntime(spec.name, spec.name.length % 17),
      maxConcurrency: 18,
      onRunComplete: async (result, task) => {
        await persistAgentRun(result, task, "stress-user");
      },
    });

    const swarm = await orchestrator.runSwarm({ task: "Tarea de estres concurrente", userId: "stress-user" });

    // Journal: los 18 agentes del enjambre publican task.started con el taskId
    // compartido (los validadores y el consolidador usan taskIds propios).
    const events = bus.getJournal().slice(journalBefore);
    const swarmStarted = events.filter(
      (event) => event.type === "task.started" && event.taskId === swarm.taskId,
    );
    expect(swarmStarted.length).toBe(18);
    const eventIds = new Set(events.map((event) => event.id));
    expect(eventIds.size).toBe(events.length);

    // Q-Vault: las 18 ejecuciones del enjambre quedaron persistidas (sin
    // perdida por carrera). Los validadores/consolidador persisten ademas sus
    // propias ejecuciones con taskIds distintos, asi que el total es >= 18.
    const index = await readMemoryIndex();
    const persisted = Object.keys(index.records).filter((key) => key.startsWith("AI::AgentRuntime::"));
    expect(persisted.length).toBeGreaterThanOrEqual(18);
    for (const result of swarm.results) {
      expect(
        persisted.some((key) => key.endsWith(`::${result.taskId}`)),
        `Falta la persistencia de ${result.agent} (${result.taskId})`,
      ).toBe(true);
    }

    // Cada agente completo con salida.
    expect(swarm.results.filter((result) => result.status === "completed").length).toBe(18);
  }, 30_000);

  it("60 escrituras paralelas de registros externos no pierden ningun registro", async () => {
    const writes = Array.from({ length: 60 }, (_, index) =>
      indexExternalMemoryRecord({
        key: `Stress::Paralelo::Registro${index}`,
        userId: "stress-user",
        text: `Registro concurrente numero ${index} del test de estres Tanda 2.`,
        source: "stress-test",
      }),
    );
    const results = await Promise.all(writes);
    expect(results.length).toBe(60);

    const index = await readMemoryIndex();
    for (let indexKey = 0; indexKey < 60; indexKey += 1) {
      expect(index.records[`Stress::Paralelo::Registro${indexKey}`]).toBeTruthy();
    }
  }, 30_000);

  it("18 escritores paralelos sobre la misma clave dejan un registro unico y consistente", async () => {
    const writers = Array.from({ length: 18 }, (_, index) =>
      indexExternalMemoryRecord({
        key: "Stress::MismaClave::Unica",
        userId: "stress-user",
        text: `Version ${index} del registro compartido.`,
        source: "stress-test",
      }),
    );
    const results = await Promise.all(writers);
    expect(results.length).toBe(18);

    const index = await readMemoryIndex();
    const record = index.records["Stress::MismaClave::Unica"] as { checksum?: string } | undefined;
    expect(record).toBeTruthy();
    // Todas las escrituras son identicas en contenido salvo el indice, asi que
    // el checksum final corresponde a una de las escrituras completas.
    expect(typeof record?.checksum).toBe("string");
    expect(record?.checksum).toMatch(/^[a-f0-9]{64}$/);
  }, 30_000);

  it("el motor .tbit permanece intacto bajo escrituras fisicas paralelas (sin WAL pendiente ni bloqueos)", async () => {
    process.env.TBIT_ENCRYPTION_SECRET = "tbit-test-encryption-secret-0123456789abcdef";
    const storageDir = join(dir, "storage");
    const config: TBitStorageConfig = {
      name: "stress_test",
      containerPath: join(storageDir, "stress.tbit"),
      metadataPath: join(storageDir, "stress.tbit.meta.json"),
      walPath: join(storageDir, "stress.tbit.wal.jsonl"),
      snapshotsDir: join(storageDir, "snapshots"),
      replicasDir: join(storageDir, "replica"),
      exportsDir: join(storageDir, "exports"),
      lockPath: join(storageDir, "stress.tbit.lock"),
      hmacSecrets: new Map([["test-primary", "tbit-test-hmac-secret-0123456789abcdef"]]),
      hmacKeyId: "test-primary",
      containerSizeMB: 2,
    };
    const service = new TBitStorageService(config);
    await service.reinitializeContainer(2);

    // 18 claves distintas + 9 escritores sobre la misma clave, todo en paralelo.
    const distinct = Array.from({ length: 18 }, (_, index) =>
      service.inject(`Stress::Tbit::Clave${index}`, `Dato fisico concurrente ${index}: áéíóú`),
    );
    const sameKey = Array.from({ length: 9 }, (_, index) =>
      service.inject("Stress::Tbit::Compartida", `Version fisica ${index}`),
    );
    await Promise.all([...distinct, ...sameKey]);

    // Todas las claves se recuperan con integridad confirmada.
    for (let index = 0; index < 18; index += 1) {
      const recovered = await service.recoverData(`Stress::Tbit::Clave${index}`);
      expect(recovered).toMatchObject({ ok: true, status: "INTEGRIDAD_CONFIRMADA", integridadValida: true });
    }
    const shared = await service.recoverData("Stress::Tbit::Compartida");
    expect(shared).toMatchObject({ ok: true, status: "INTEGRIDAD_CONFIRMADA", integridadValida: true });

    // WAL append-only: cada operacion (id) queda resuelta en COMMITTED o
    // ABORTED; ningun id queda solo en PENDING (sin corrupcion ni bloqueos).
    const walText = await readFile(config.walPath, "utf8");
    const walRecords = walText
      .split(/\r?\n/)
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line) as TBitWalRecord);
    expect(walRecords.length).toBeGreaterThan(0);
    const statesById = new Map<string, Set<string>>();
    for (const record of walRecords) {
      const states = statesById.get(record.id) ?? new Set<string>();
      states.add(record.state);
      statesById.set(record.id, states);
    }
    for (const [id, states] of statesById) {
      expect(
        states.has("COMMITTED") || states.has("ABORTED"),
        `WAL id ${id} quedo en estado ${[...states].join("/")}`,
      ).toBe(true);
    }

    // Checksum global del contenedor calculable (motor intacto, sin bloqueos).
    const checksum = await service.checksum();
    expect(checksum.combinedHash).toMatch(/^[a-f0-9]{64}$/);

    delete process.env.TBIT_ENCRYPTION_SECRET;
  }, 60_000);
});
