import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AiProvider, AiProviderRequest, AiProviderResponse } from "../AiProvider";
import { getActiveTBitDataDir, resolveActiveTBitDataPath, setActiveTBitDataDir } from "../tbitRuntimePaths";
import { indexExternalMemoryRecord } from "../memoryCore";
import { buildVaultContext, verifyAgainstVault } from "../src/agents/AgentMemoryBridge";
import { procesarMensajeUsuario, resetTBitChatSession } from "../TBitChatEngine";

/**
 * Tanda 2 — Punto 4: Verificacion anti-alucinacion en el chat principal.
 *
 * El chat (TBitChatEngine) debe aplicar, antes de responder, la verificacion
 * contra Q-Vault y las citas, igual que el runtime de agentes (Fase 66), y
 * mantener actualizado el indice semantico y los wikilinks tras cada
 * interaccion relevante.
 */

class ScriptedProvider implements AiProvider {
  public readonly calls: AiProviderRequest[] = [];
  private readonly queue: AiProviderResponse[];
  constructor(...responses: AiProviderResponse[]) {
    this.queue = responses;
  }
  async generateWithTools(request: AiProviderRequest): Promise<AiProviderResponse> {
    this.calls.push(request);
    const next = this.queue.shift();
    if (!next) throw new Error("ScriptedProvider: sin respuestas encoladas.");
    return next;
  }

  static text(content: string): ScriptedProvider {
    return new ScriptedProvider({ message: { role: "assistant", content } });
  }

  static withToolCall(toolName: string, args: Record<string, unknown>, finalText: string): ScriptedProvider {
    return new ScriptedProvider(
      {
        message: {
          role: "assistant",
          content: null,
          tool_calls: [{ id: "call_1", type: "function", function: { name: toolName, arguments: JSON.stringify(args) } }],
        },
      },
      { message: { role: "assistant", content: finalText } },
    );
  }
}

const ORIGINAL_DATA_DIR = getActiveTBitDataDir();
let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "tbit-chat-antihallucination-"));
  setActiveTBitDataDir(dir);
});

afterAll(async () => {
  setActiveTBitDataDir(ORIGINAL_DATA_DIR);
  await rm(dir, { recursive: true, force: true });
  resetTBitChatSession("anti-hallucination-test");
});

describe("TBitChatEngine — verificacion anti-alucinacion (Tanda 2 — Punto 4)", () => {
  it("inyecta el contexto de Q-Vault en el mensaje de sistema antes de responder", async () => {
    const provider = ScriptedProvider.text("Respuesta con contexto.");
    const response = await procesarMensajeUsuario(
      { sessionId: "anti-hallucination-test-1", message: "que sabes del proyecto fenix" },
      {
        provider,
        toolExecutor: async () => ({}),
        tools: [],
        vaultContextProvider: async () => ({
          contextText: "=== CONTEXTO RECUPERADO DE Q-VAULT (fuente de verdad persistida) ===\n[1] Proyecto::Fenix (test, score 3)\nEl proyecto fenix renace de sus cenizas cada trimestre.",
          citations: [
            { key: "Proyecto::Fenix", title: "Proyecto Fenix", source: "test", score: 3, preview: "El proyecto fenix renace." },
          ],
        }),
      },
    );

    expect(response.data).toBe("Respuesta con contexto.");
    const systemMessage = provider.calls[0].messages.find((message) => message.role === "system");
    expect(systemMessage?.content).toContain("CONTEXTO RECUPERADO DE Q-VAULT");
    expect(systemMessage?.content).toContain("proyecto fenix renace");
    expect(response.vaultCitations?.length).toBe(1);
    expect(response.vaultCitations?.[0].key).toBe("Proyecto::Fenix");
  });

  it("verifica la respuesta contra Q-Vault y entrega la verificacion con citas", async () => {
    const provider = ScriptedProvider.text("El cache incremental es viable, aunque la criptografia cuantica queda pendiente.");
    const response = await procesarMensajeUsuario(
      { sessionId: "anti-hallucination-test-2", message: "evalua el cache incremental" },
      {
        provider,
        toolExecutor: async () => ({}),
        tools: [],
        vaultVerifier: async (text) => ({
          checkedTerms: ["cache", "incremental", "criptografia"],
          verifiedTerms: ["cache", "incremental"],
          unverifiedTerms: ["criptografia"],
          citations: [
            { key: "AI::Cache::Diseno", title: "Diseno de cache", source: "test", score: 2, preview: text.slice(0, 40) },
          ],
        }),
      },
    );

    expect(response.verification).toBeTruthy();
    expect(response.verification?.verifiedTerms).toContain("cache");
    expect(response.verification?.unverifiedTerms).toContain("criptografia");
    expect(response.verification?.citations.length).toBeGreaterThan(0);
  });

  it("persiste la interaccion relevante en Q-Vault y omite las irrelevantes", async () => {
    const persisted: string[] = [];
    const provider = ScriptedProvider.withToolCall("consultar_oraculo", { key: "test" }, "He consultado el oraculo.");
    const response = await procesarMensajeUsuario(
      { sessionId: "anti-hallucination-test-3", message: "consulta el oraculo" },
      {
        provider,
        toolExecutor: async () => ({ ok: true, status: "ESCRITURA_FISICA_CONFIRMADA" }),
        tools: [],
        vaultVerifier: async () => null,
        interactionPersister: async (record) => {
          const key = `AI::Chat::Test::${persisted.length + 1}`;
          persisted.push(key);
          void record;
          return { key };
        },
      },
    );

    // Interaccion relevante (uso de herramientas): se persiste.
    expect(response.toolResults.length).toBe(1);
    expect(response.persistedMemoryKey).toBe("AI::Chat::Test::1");
    expect(persisted.length).toBe(1);

    // Interaccion irrelevante (sin tools ni citas): no se persiste.
    const plainProvider = ScriptedProvider.text("Hola, estoy listo.");
    const plainResponse = await procesarMensajeUsuario(
      { sessionId: "anti-hallucination-test-3", message: "hola" },
      {
        provider: plainProvider,
        toolExecutor: async () => ({}),
        tools: [],
        vaultVerifier: async () => ({ checkedTerms: [], verifiedTerms: [], unverifiedTerms: [], citations: [] }),
        interactionPersister: async (record) => {
          const key = `AI::Chat::Test::${persisted.length + 1}`;
          persisted.push(key);
          void record;
          return { key };
        },
      },
    );
    expect(plainResponse.persistedMemoryKey).toBeNull();
    expect(persisted.length).toBe(1);
  });

  it("un fallo del vault nunca rompe la respuesta del chat (best-effort)", async () => {
    const provider = ScriptedProvider.text("Respuesta resiliente.");
    const response = await procesarMensajeUsuario(
      { sessionId: "anti-hallucination-test-4", message: "pregunta con vault caido" },
      {
        provider,
        toolExecutor: async () => ({}),
        tools: [],
        vaultContextProvider: async () => {
          throw new Error("vault no disponible");
        },
        vaultVerifier: async () => {
          throw new Error("vault no disponible");
        },
      },
    );

    expect(response.data).toBe("Respuesta resiliente.");
    expect(response.verification).toBeNull();
    expect(response.persistedMemoryKey).toBeNull();
  });

  it("integracion real: contexto, verificacion y persistencia con wikilinks contra el vault fisico", async () => {
    // Semilla en Q-Vault real (indice + query index en directorio temporal).
    await indexExternalMemoryRecord({
      key: "Proyecto::Fenix::Descripcion",
      userId: "chat-user",
      text: "El proyecto fenix renace de sus cenizas cada trimestre con revision completa.",
      source: "test-seed",
    });

    const provider = ScriptedProvider.text("El proyecto fenix renace de sus cenizas cada trimestre.");
    const persistedKeys: string[] = [];
    const response = await procesarMensajeUsuario(
      { sessionId: "anti-hallucination-test-5", message: "cuentame del proyecto fenix", userId: "chat-user" },
      {
        provider,
        toolExecutor: async () => ({}),
        tools: [],
        vaultContextProvider: (query, userId) => buildVaultContext(query, userId),
        vaultVerifier: (text, userId) => verifyAgainstVault(text, userId),
        interactionPersister: async (record) => {
          const key = `AI::Chat::Integracion::${persistedKeys.length + 1}`;
          const persisted = await indexExternalMemoryRecord({
            key,
            userId: record.userId ?? "ai",
            text: `Usuario: ${record.userMessage}\nAsistente: ${record.assistantMessage}`,
            links: record.citations.map((citation) => citation.key),
            source: "chat",
          });
          persistedKeys.push(persisted.key);
          return { key: persisted.key, checksum: persisted.checksum };
        },
      },
    );

    // Contexto real recuperado del vault.
    expect(response.vaultCitations?.some((citation) => citation.key === "Proyecto::Fenix::Descripcion")).toBe(true);

    // Verificacion real: "fenix" tiene respaldo en el vault.
    expect(response.verification?.verifiedTerms).toContain("fenix");

    // La interaccion se persistio con wikilink al registro citado.
    expect(persistedKeys.length).toBe(1);
    const indexText = await readFile(resolveActiveTBitDataPath("memory-core-index.json"), "utf8");
    const index = JSON.parse(indexText) as { records: Record<string, { links?: string[] }> };
    expect(index.records[persistedKeys[0]]?.links).toContain("Proyecto::Fenix::Descripcion");
  });
});
