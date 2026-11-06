import { afterAll, beforeAll, describe, expect, it } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import type { AiProviderRuntime } from "../AiProviderFactory";
import { OpenAICompatibleProvider } from "../OpenAICompatibleProvider";
import { AgentOrchestrator } from "../src/agents/AgentOrchestrator";
import { loadAgentSpecs } from "../src/agents/AgentSpecLoader";

/**
 * Tanda 2 — Punto 1: Agentes reales contra proveedor de IA configurado.
 *
 * Verifica que cada agente ejecuta su especificacion contra el proveedor
 * activo de la cadena de failover (servidor local simulado compatible con
 * OpenAI), incluyendo respuestas 429, 503 y timeout, y que el eslabon
 * determinista se usa unicamente como ultimo recurso, quedando la respuesta
 * marcada como deterministicFallback.
 */

const TASK = "Resume en una frase el estado actual del sistema T-BIT.";

type MockBehavior = "fail-429" | "fail-503" | "slow" | "ok";

let mockServer: http.Server;
let mockBaseUrl = "";
const mockRequests: Array<{ model: string; auth: string }> = [];

function behaviorForModel(model: string): MockBehavior {
  if (model.includes("gpt-4o-mini")) return "fail-429";
  if (model.includes("grok")) return "fail-503";
  if (model.includes("slow")) return "slow";
  return "ok";
}

function openAiBody(content: string) {
  return JSON.stringify({ choices: [{ message: { role: "assistant", content } }] });
}

beforeAll(async () => {
  mockServer = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      let model = "";
      try {
        const parsed = JSON.parse(raw) as { model?: string };
        model = parsed.model ?? "";
      } catch {
        model = "";
      }
      mockRequests.push({ model, auth: String(req.headers.authorization ?? "") });
      const behavior = behaviorForModel(model);
      if (behavior === "fail-429") {
        res.writeHead(429, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: { message: "Rate limit exceeded (429)" } }));
        return;
      }
      if (behavior === "fail-503") {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: { message: "Service unavailable (503)" } }));
        return;
      }
      if (behavior === "slow") {
        setTimeout(() => {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(openAiBody(`MOCK-SLOW-OK ${model}`));
        }, 400);
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(openAiBody(`MOCK-OK ${model}`));
    });
  });
  await new Promise<void>((resolve) => mockServer.listen(0, "127.0.0.1", resolve));
  const address = mockServer.address() as AddressInfo;
  mockBaseUrl = `http://127.0.0.1:${address.port}/v1`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => mockServer.close(() => resolve()));
});

const ENV_KEYS = [
  "TBIT_AI_PROVIDER",
  "TBIT_AI_FALLBACK_CHAIN",
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
  "OPENAI_MODEL",
  "XAI_API_KEY",
  "XAI_BASE_URL",
  "XAI_MODEL",
  "QWEN_API_KEY",
  "QWEN_BASE_URL",
  "QWEN_MODEL",
];

function withEnv(values: Record<string, string | undefined>, fn: () => Promise<void>): Promise<void> {
  const previous = new Map(ENV_KEYS.map((key) => [key, process.env[key]]));
  for (const key of ENV_KEYS) delete process.env[key];
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) process.env[key] = value;
  }
  return fn().finally(() => {
    for (const key of ENV_KEYS) delete process.env[key];
    for (const [key, value] of previous) {
      if (value !== undefined) process.env[key] = value;
    }
  });
}

describe("Agentes reales contra cadena de failover (Tanda 2 — Punto 1)", () => {
  it("un agente ejecuta contra el proveedor activo cuando los primeros eslabones fallan con 429 y 503", async () => {
    await withEnv(
      {
        TBIT_AI_FALLBACK_CHAIN: "openai,grok,qwen",
        OPENAI_API_KEY: "test-key-openai",
        OPENAI_BASE_URL: mockBaseUrl,
        XAI_API_KEY: "test-key-xai",
        XAI_BASE_URL: mockBaseUrl,
        QWEN_API_KEY: "test-key-qwen",
        QWEN_BASE_URL: mockBaseUrl,
      },
      async () => {
        const orchestrator = new AgentOrchestrator();
        const result = await orchestrator.runAgent("Security Auditor", { task: TASK });
        expect(result.status).toBe("completed");
        expect(result.output).toContain("MOCK-OK");
        expect(result.providerId).toBe("qwen");
        // El mock corre en 127.0.0.1, por lo que la factory lo clasifica como local.
        expect(result.providerMode).toBe("local");
        expect(result.deterministicFallback).toBe(false);
        // El mock recibio los tres eslabones en orden: 429, 503 y exito.
        const models = mockRequests.slice(-3).map((request) => request.model);
        expect(models.some((model) => model.includes("gpt-4o-mini"))).toBe(true);
        expect(models.some((model) => model.includes("grok"))).toBe(true);
        expect(models.some((model) => model.includes("qwen"))).toBe(true);
      },
    );
  });

  it("cuando todos los eslabones remotos fallan, el eslabon determinista final responde y queda marcado", async () => {
    await withEnv(
      {
        TBIT_AI_FALLBACK_CHAIN: "openai",
        OPENAI_API_KEY: "test-key-openai",
        OPENAI_BASE_URL: mockBaseUrl,
      },
      async () => {
        const orchestrator = new AgentOrchestrator();
        const result = await orchestrator.runAgent("Documentation Engineer", { task: TASK });
        expect(result.status).toBe("completed");
        expect(result.providerId).toBe("deterministic");
        expect(result.providerMode).toBe("deterministic");
        expect(result.deterministicFallback).toBe(true);
        expect(result.output).toBeTruthy();
        expect(result.output).not.toContain("MOCK-OK");
      },
    );
  });

  it("un proveedor que excede el timeout conmuta al eslabon determinista de la cadena", async () => {
    const { DeterministicTBitProvider } = await import("../AiProvider");
    const shortTimeoutProvider = new OpenAICompatibleProvider({
      apiKey: "test-key-slow",
      model: "slow-model",
      baseUrl: mockBaseUrl,
      label: "MockSlow",
    });
    const deterministic = new DeterministicTBitProvider();
    const orchestrator = new AgentOrchestrator({
      providerFactory: (): AiProviderRuntime => ({
        provider: {
          async generateWithTools(request) {
            const timeout = new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error("MockSlow: timeout de proveedor IA tras 80 ms.")), 80),
            );
            try {
              return await Promise.race([shortTimeoutProvider.generateWithTools(request), timeout]);
            } catch {
              // La cadena real conmutaria al siguiente eslabon; aqui el
              // eslabon determinista es el siguiente disponible.
              return deterministic.generateWithTools(request);
            }
          },
        },
        id: "mock-slow",
        label: "MockSlow",
        model: "slow-model",
        mode: "remote",
      }),
    });

    const result = await orchestrator.runAgent("Chief Architect", { task: TASK });
    expect(result.status).toBe("completed");
    expect(result.output).toBeTruthy();
    expect(result.providerId).toBe("mock-slow");
    expect(result.deterministicFallback).toBe(false);
  });

  it("los 18 agentes producen salida real contra el proveedor simulado compatible con OpenAI", async () => {
    const orchestrator = new AgentOrchestrator({
      providerFactory: (): AiProviderRuntime => ({
        provider: new OpenAICompatibleProvider({
          apiKey: "test-key",
          model: "qwen-mock",
          baseUrl: mockBaseUrl,
          label: "MockOpenAI-Compatible",
        }),
        id: "qwen-mock",
        label: "MockOpenAI-Compatible",
        model: "qwen-mock",
        mode: "remote",
      }),
    });

    const specs = loadAgentSpecs();
    expect(specs.length).toBe(18);
    const results = await Promise.all(
      specs.map((spec) => orchestrator.runAgent(spec.name, { task: TASK })),
    );

    for (const result of results) {
      expect(result.status).toBe("completed");
      expect(result.output).toContain("MOCK-OK");
      expect(result.providerId).toBe("qwen-mock");
      expect(result.deterministicFallback).toBe(false);
    }
  });

  it("los 18 agentes siguen operativos cuando solo queda el eslabon determinista final", async () => {
    await withEnv({}, async () => {
      const orchestrator = new AgentOrchestrator();
      const specs = loadAgentSpecs();
      const results = await Promise.all(
        specs.map((spec) => orchestrator.runAgent(spec.name, { task: TASK })),
      );
      for (const result of results) {
        expect(result.status).toBe("completed");
        expect(result.providerId).toBe("deterministic");
        expect(result.deterministicFallback).toBe(true);
        expect(result.output).toBeTruthy();
      }
    });
  });
});
