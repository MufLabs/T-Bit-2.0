import { afterEach, describe, expect, it } from "vitest";
import {
  createAiProviderRuntime,
  createAiProviderRuntimeFromConfig,
  createFallbackProviderChain,
  getAiProviderCatalog,
} from "../AiProviderFactory";
import { AnthropicProvider, GeminiProvider } from "../UniversalAiProviders";
import { OpenAICompatibleProvider } from "../OpenAICompatibleProvider";
import { DeterministicTBitProvider } from "../AiProvider";

/**
 * Tanda 2 — Punto 3: auditoria uno por uno de los proveedores IA del catalogo.
 * Verifica que cada proveedor se construye correctamente desde variables de
 * entorno (sin claves en el codigo) y que los defaults oficiales de base URL
 * existen para Grok/xAI y Qwen.
 */

const ENV_KEYS = [
  "TBIT_AI_PROVIDER",
  "TBIT_LLM_API_KEY",
  "TBIT_LLM_MODEL",
  "TBIT_LLM_BASE_URL",
  "TBIT_AI_FALLBACK_CHAIN",
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
  "GEMINI_API_KEY",
  "ANTHROPIC_API_KEY",
  "XAI_API_KEY",
  "QWEN_API_KEY",
  "OPENROUTER_API_KEY",
];

function withEnv(values: Record<string, string | undefined>): void {
  for (const key of ENV_KEYS) delete process.env[key];
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) process.env[key] = value;
  }
}

afterEach(() => {
  withEnv({});
});

describe("AiProviderFactory — auditoria proveedor por proveedor (Tanda 2 — Punto 3)", () => {
  it("el catalogo expone los 11 descriptores esperados", () => {
    const ids = getAiProviderCatalog().map((descriptor) => descriptor.id);
    expect(ids).toEqual([
      "deterministic",
      "openai",
      "gemini",
      "claude",
      "grok",
      "qwen",
      "hermes",
      "ollama",
      "lmstudio",
      "openai-compatible",
      "openrouter",
    ]);
  });

  it("deterministic: eslabon final siempre disponible sin configuracion", () => {
    withEnv({});
    const runtime = createAiProviderRuntime();
    expect(runtime.id).toBe("deterministic");
    expect(runtime.mode).toBe("deterministic");
    expect(runtime.provider).toBeInstanceOf(DeterministicTBitProvider);
  });

  it("openai: OpenAI-compatible con base URL oficial por defecto", () => {
    withEnv({ OPENAI_API_KEY: "test-key" });
    const runtime = createAiProviderRuntimeFromConfig({ id: "openai" });
    expect(runtime.id).toBe("openai");
    expect(runtime.provider).toBeInstanceOf(OpenAICompatibleProvider);
    expect(runtime.baseUrl).toBe("https://api.openai.com/v1");
    expect(runtime.mode).toBe("remote");
  });

  it("gemini: conector nativo Gemini", () => {
    withEnv({ GEMINI_API_KEY: "test-key" });
    const runtime = createAiProviderRuntimeFromConfig({ id: "gemini" });
    expect(runtime.id).toBe("gemini");
    expect(runtime.provider).toBeInstanceOf(GeminiProvider);
    expect(runtime.mode).toBe("remote");
  });

  it("claude: conector nativo Anthropic", () => {
    withEnv({ ANTHROPIC_API_KEY: "test-key" });
    const runtime = createAiProviderRuntimeFromConfig({ id: "claude" });
    expect(runtime.id).toBe("claude");
    expect(runtime.provider).toBeInstanceOf(AnthropicProvider);
    expect(runtime.mode).toBe("remote");
  });

  it("grok/xAI: default oficial https://api.x.ai/v1 sin exigir base URL", () => {
    withEnv({ XAI_API_KEY: "test-key" });
    const runtime = createAiProviderRuntimeFromConfig({ id: "grok" });
    expect(runtime.id).toBe("grok");
    expect(runtime.provider).toBeInstanceOf(OpenAICompatibleProvider);
    expect(runtime.baseUrl).toBe("https://api.x.ai/v1");
    expect(runtime.mode).toBe("remote");
  });

  it("qwen: default oficial DashScope compatible-mode sin exigir base URL", () => {
    withEnv({ QWEN_API_KEY: "test-key" });
    const runtime = createAiProviderRuntimeFromConfig({ id: "qwen" });
    expect(runtime.id).toBe("qwen");
    expect(runtime.provider).toBeInstanceOf(OpenAICompatibleProvider);
    expect(runtime.baseUrl).toBe("https://dashscope.aliyuncs.com/compatible-mode/v1");
    expect(runtime.mode).toBe("remote");
  });

  it("hermes: local por defecto en localhost:11434/v1 sin API key", () => {
    withEnv({});
    const runtime = createAiProviderRuntimeFromConfig({ id: "hermes" });
    expect(runtime.id).toBe("hermes");
    expect(runtime.provider).toBeInstanceOf(OpenAICompatibleProvider);
    expect(runtime.baseUrl).toBe("http://localhost:11434/v1");
    expect(runtime.mode).toBe("local");
  });

  it("ollama: local por defecto en localhost:11434/v1 sin API key", () => {
    withEnv({});
    const runtime = createAiProviderRuntimeFromConfig({ id: "ollama" });
    expect(runtime.id).toBe("ollama");
    expect(runtime.baseUrl).toBe("http://localhost:11434/v1");
    expect(runtime.mode).toBe("local");
  });

  it("lmstudio: local por defecto en localhost:1234/v1 sin API key", () => {
    withEnv({});
    const runtime = createAiProviderRuntimeFromConfig({ id: "lmstudio" });
    expect(runtime.id).toBe("lmstudio");
    expect(runtime.baseUrl).toBe("http://localhost:1234/v1");
    expect(runtime.mode).toBe("local");
  });

  it("openai-compatible dinamico: exige API key y base URL explicitas", () => {
    withEnv({ OPENAI_API_KEY: "test-key", OPENAI_BASE_URL: "https://mi-servidor.ejemplo/v1" });
    const runtime = createAiProviderRuntimeFromConfig({ id: "openai-compatible" });
    expect(runtime.id).toBe("openai-compatible");
    expect(runtime.baseUrl).toBe("https://mi-servidor.ejemplo/v1");
    expect(runtime.mode).toBe("remote");
  });

  it("openrouter: base URL oficial por defecto", () => {
    withEnv({ OPENROUTER_API_KEY: "test-key" });
    const runtime = createAiProviderRuntimeFromConfig({ id: "openrouter" });
    expect(runtime.id).toBe("openrouter");
    expect(runtime.baseUrl).toBe("https://openrouter.ai/api/v1");
    expect(runtime.mode).toBe("remote");
  });

  it("los proveedores remotos sin clave se rechazan con error explicativo", () => {
    withEnv({});
    expect(() => createAiProviderRuntimeFromConfig({ id: "openai" })).toThrow(/API key/);
    expect(() => createAiProviderRuntimeFromConfig({ id: "gemini" })).toThrow(/API key/);
    expect(() => createAiProviderRuntimeFromConfig({ id: "claude" })).toThrow(/API key/);
    expect(() => createAiProviderRuntimeFromConfig({ id: "grok" })).toThrow(/API key/);
    expect(() => createAiProviderRuntimeFromConfig({ id: "qwen" })).toThrow(/API key/);
    expect(() => createAiProviderRuntimeFromConfig({ id: "openrouter" })).toThrow(/API key/);
  });

  it("la cadena de failover agrega el determinista como ultimo eslabon", () => {
    withEnv({
      TBIT_AI_FALLBACK_CHAIN: "openai,grok",
      OPENAI_API_KEY: "test-key",
      XAI_API_KEY: "test-key",
    });
    const chain = createFallbackProviderChain();
    expect(chain.size).toBe(3);
    const health = chain.getHealth();
    expect(health.map((entry) => entry.id)).toEqual(["openai", "grok", "deterministic"]);
    expect(health[2].available).toBe(true);
  });
});
