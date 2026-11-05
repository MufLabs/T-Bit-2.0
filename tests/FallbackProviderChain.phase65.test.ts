import { describe, expect, it, vi } from "vitest";
import {
  FallbackProviderChain,
  classifyProviderFailure,
  type ProviderHealth,
} from "../FallbackProviderChain";
import { createFallbackProviderChain } from "../AiProviderFactory";
import type { AiProvider, AiProviderRequest, AiProviderResponse } from "../AiProvider";
import type { AiProviderRuntime } from "../AiProviderFactory";

function runtimeFrom(
  id: string,
  behavior: () => Promise<AiProviderResponse>,
  mode: AiProviderRuntime["mode"] = "remote",
): AiProviderRuntime {
  const provider: AiProvider = { generateWithTools: behavior };
  return { provider, id, label: id, model: `${id}-model`, mode };
}

const okResponse = (text: string): AiProviderResponse => ({
  message: { role: "assistant", content: text },
});

const baseRequest: AiProviderRequest = { messages: [{ role: "user", content: "hola" }] };

describe("classifyProviderFailure — Fase 65", () => {
  it("clasifica cuota 429 con enfriamiento largo", () => {
    const result = classifyProviderFailure(new Error("Gemini rechazo la solicitud: 429 quota exceeded"));
    expect(result.kind).toBe("quota");
    expect(result.cooldownMs).toBe(300_000);
  });

  it("clasifica 503 y timeout como recuperables", () => {
    expect(classifyProviderFailure(new Error("Claude rechazo la solicitud: 503 Service Unavailable")).kind).toBe("server");
    expect(classifyProviderFailure(new Error("OpenAI: timeout de proveedor IA tras 60000 ms.")).kind).toBe("timeout");
  });

  it("clasifica clave invalida 401 con enfriamiento largo", () => {
    const result = classifyProviderFailure(new Error("OpenAI rechazo la solicitud: 401 invalid api key"));
    expect(result.kind).toBe("auth");
    expect(result.cooldownMs).toBe(300_000);
  });
});

describe("FallbackProviderChain — Fase 65", () => {
  it("conmuta en caliente cuando el primer proveedor agota cuota (429)", async () => {
    const onFailover = vi.fn();
    const chain = new FallbackProviderChain(
      [
        runtimeFrom("gemini", async () => {
          throw new Error("Gemini rechazo la solicitud: 429 RESOURCE_EXHAUSTED");
        }),
        runtimeFrom("openai", async () => okResponse("respuesta del segundo")),
      ],
      { onFailover },
    );
    const response = await chain.generateWithTools(baseRequest);
    expect(response.message.content).toBe("respuesta del segundo");
    expect(onFailover).toHaveBeenCalledTimes(1);
    expect(onFailover.mock.calls[0][0].from).toBe("gemini");
    expect(onFailover.mock.calls[0][0].to).toBe("openai");
  });

  it("respeta el cooldown: no reintenta un proveedor en enfriamiento", async () => {
    const failing = vi.fn(async () => {
      throw new Error("proveedor: 503 Service Unavailable");
    });
    const chain = new FallbackProviderChain(
      [
        runtimeFrom("a", failing),
        runtimeFrom("b", async () => okResponse("de b")),
      ],
      { cooldownMs: 60_000 },
    );
    await chain.generateWithTools(baseRequest);
    const firstCalls = failing.mock.calls.length;
    expect(firstCalls).toBe(1);

    // Segunda solicitud: "a" sigue en cooldown, solo "b" es consultado.
    const response = await chain.generateWithTools(baseRequest);
    expect(response.message.content).toBe("de b");
    expect(failing.mock.calls.length).toBe(firstCalls);

    const health = chain.getHealth();
    const a = health.find((entry) => entry.id === "a") as ProviderHealth;
    expect(a.inCooldown).toBe(true);
    expect(a.totalFailures).toBe(1);
  });

  it("recupera automaticamente un proveedor al expirar el cooldown", async () => {
    let calls = 0;
    const chain = new FallbackProviderChain(
      [
        runtimeFrom("a", () => {
          calls += 1;
          if (calls === 1) throw new Error("proveedor: 500 Internal Server Error");
          return Promise.resolve(okResponse("a recuperado"));
        }),
        runtimeFrom("b", async () => okResponse("de b")),
      ],
      { cooldownMs: 20 },
    );
    await chain.generateWithTools(baseRequest);
    expect((chain.getHealth().find((h) => h.id === "a") as ProviderHealth).inCooldown).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 40));
    const response = await chain.generateWithTools(baseRequest);
    expect(response.message.content).toBe("a recuperado");
  });

  it("conmuta ante timeout del proveedor", async () => {
    const chain = new FallbackProviderChain(
      [
        runtimeFrom("lento", () => new Promise<AiProviderResponse>(() => undefined)),
        runtimeFrom("rapido", async () => okResponse("respuesta rapida")),
      ],
      { requestTimeoutMs: 30 },
    );
    const response = await chain.generateWithTools(baseRequest);
    expect(response.message.content).toBe("respuesta rapida");
    const health = chain.getHealth().find((h) => h.id === "lento") as ProviderHealth;
    expect(health.lastError).toContain("timeout");
  });

  it("registra latencia y contadores de exito", async () => {
    const chain = new FallbackProviderChain([runtimeFrom("solo", async () => okResponse("ok"))]);
    await chain.generateWithTools(baseRequest);
    const health = chain.getHealth()[0];
    expect(health.totalRequests).toBe(1);
    expect(health.totalFailures).toBe(0);
    expect(health.lastLatencyMs).toBeGreaterThanOrEqual(0);
    expect(health.available).toBe(true);
  });

  it("falla con el ultimo error cuando todos los proveedores fallan", async () => {
    const chain = new FallbackProviderChain([
      runtimeFrom("a", async () => {
        throw new Error("a: 503");
      }),
      runtimeFrom("b", async () => {
        throw new Error("b: 503");
      }),
    ]);
    await expect(chain.generateWithTools(baseRequest)).rejects.toThrow(/b: 503/);
  });
});

describe("createFallbackProviderChain — Fase 65", () => {
  it("siempre incluye el proveedor determinista local como ultimo eslabon", () => {
    const chain = createFallbackProviderChain({ chain: ["openai", "gemini"] });
    expect(chain.size).toBeGreaterThanOrEqual(1);
    const health = chain.getHealth();
    expect(health[health.length - 1].id).toBe("deterministic");
    // Los proveedores sin clave configurada se omiten sin fallar.
    expect(health.every((entry) => entry.id.length > 0)).toBe(true);
  });

  it("usa TBIT_AI_FALLBACK_CHAIN cuando no se pasa cadena explicita", () => {
    const previous = process.env.TBIT_AI_FALLBACK_CHAIN;
    process.env.TBIT_AI_FALLBACK_CHAIN = "openai,deterministic";
    try {
      const chain = createFallbackProviderChain();
      const ids = chain.getHealth().map((entry) => entry.id);
      expect(ids[ids.length - 1]).toBe("deterministic");
      expect(new Set(ids).size).toBe(ids.length);
    } finally {
      if (previous === undefined) delete process.env.TBIT_AI_FALLBACK_CHAIN;
      else process.env.TBIT_AI_FALLBACK_CHAIN = previous;
    }
  });

  it("el proveedor determinista de la cadena responde sin red", async () => {
    const chain = createFallbackProviderChain({ chain: [] });
    const response = await chain.generateWithTools(baseRequest);
    expect(response.message.role).toBe("assistant");
  });
});

