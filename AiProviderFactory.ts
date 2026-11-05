import { AiProvider, DeterministicTBitProvider } from "./AiProvider";
import { OpenAICompatibleProvider } from "./OpenAICompatibleProvider";
import { AnthropicProvider, GeminiProvider, providerLabel } from "./UniversalAiProviders";

export type AiProviderRuntime = {
  provider: AiProvider;
  id: string;
  label: string;
  model: string;
  mode: "deterministic" | "remote" | "local";
  baseUrl?: string;
};

export type AiProviderRuntimeConfig = {
  id?: string;
  apiKey?: string;
  model?: string;
  baseUrl?: string;
};

export type AiProviderDescriptor = {
  id: string;
  label: string;
  mode: "deterministic" | "remote" | "local";
  defaultModel: string;
  defaultBaseUrl?: string;
  requiresApiKey: boolean;
  requiresBaseUrl: boolean;
  protocol: "native" | "openai-compatible" | "deterministic";
};

const GEMINI_DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

const AI_PROVIDER_CATALOG: AiProviderDescriptor[] = [
  {
    id: "deterministic",
    label: "T-BIT Local",
    mode: "deterministic",
    defaultModel: "local-rules",
    requiresApiKey: false,
    requiresBaseUrl: false,
    protocol: "deterministic",
  },
  {
    id: "openai",
    label: "OpenAI",
    mode: "remote",
    defaultModel: "gpt-4o-mini",
    defaultBaseUrl: "https://api.openai.com/v1",
    requiresApiKey: true,
    requiresBaseUrl: false,
    protocol: "openai-compatible",
  },
  {
    id: "gemini",
    label: "Gemini",
    mode: "remote",
    defaultModel: "gemini-2.5-flash",
    defaultBaseUrl: GEMINI_DEFAULT_BASE_URL,
    requiresApiKey: true,
    requiresBaseUrl: false,
    protocol: "native",
  },
  {
    id: "claude",
    label: "Claude",
    mode: "remote",
    defaultModel: "claude-3-5-haiku-latest",
    requiresApiKey: true,
    requiresBaseUrl: false,
    protocol: "native",
  },
  {
    id: "grok",
    label: "Grok / xAI",
    mode: "remote",
    defaultModel: "grok",
    requiresApiKey: true,
    requiresBaseUrl: true,
    protocol: "openai-compatible",
  },
  {
    id: "qwen",
    label: "Qwen",
    mode: "remote",
    defaultModel: "qwen",
    requiresApiKey: true,
    requiresBaseUrl: true,
    protocol: "openai-compatible",
  },
  {
    id: "hermes",
    label: "Hermes",
    mode: "local",
    defaultModel: "nous-hermes",
    defaultBaseUrl: "http://localhost:11434/v1",
    requiresApiKey: false,
    requiresBaseUrl: false,
    protocol: "openai-compatible",
  },
  {
    id: "ollama",
    label: "Ollama",
    mode: "local",
    defaultModel: "llama3.1",
    defaultBaseUrl: "http://localhost:11434/v1",
    requiresApiKey: false,
    requiresBaseUrl: false,
    protocol: "openai-compatible",
  },
  {
    id: "lmstudio",
    label: "LM Studio",
    mode: "local",
    defaultModel: "local-model",
    defaultBaseUrl: "http://localhost:1234/v1",
    requiresApiKey: false,
    requiresBaseUrl: false,
    protocol: "openai-compatible",
  },
  {
    id: "openai-compatible",
    label: "OpenAI-Compatible",
    mode: "remote",
    defaultModel: "model",
    requiresApiKey: true,
    requiresBaseUrl: true,
    protocol: "openai-compatible",
  },
];

function env(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

function isLocalBaseUrl(baseUrl: string | undefined): boolean {
  return Boolean(baseUrl?.includes("localhost") || baseUrl?.includes("127.0.0.1"));
}

function normalizeOptionalBaseUrl(value: string | undefined, providerLabel: string): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(`${providerLabel}: base URL invalida. Usa una URL completa con http:// o https://.`);
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error(`${providerLabel}: base URL invalida. Solo se permite http:// o https://.`);
  }

  return trimmed.replace(/\/$/, "");
}

function normalizeGeminiBaseUrl(value: string | undefined): string | undefined {
  const normalized = normalizeOptionalBaseUrl(value, "Gemini");
  if (!normalized) return undefined;

  const hostname = new URL(normalized).hostname;
  if (hostname.startsWith("generativelanguage.googleapis.") && hostname !== "generativelanguage.googleapis.com") {
    throw new Error(`Gemini: base URL parece incompleta o mal escrita. Usa ${GEMINI_DEFAULT_BASE_URL} o deja el campo vacio.`);
  }

  return normalized;
}

export function getAiProviderCatalog(): AiProviderDescriptor[] {
  return AI_PROVIDER_CATALOG;
}

function required(value: string | undefined, providerLabel: string, field: string): string {
  if (value?.trim()) return value.trim();
  throw new Error(`${providerLabel} requiere ${field} antes de poder usarse.`);
}

function deterministicRuntime(): AiProviderRuntime {
  const provider = new DeterministicTBitProvider();
  return {
    provider,
    id: "deterministic",
    label: "Deterministic T-BIT",
    model: "local-rules",
    mode: "deterministic",
  };
}

function openAiCompatibleRuntime(options: {
  id: string;
  label: string;
  model: string;
  apiKey: string;
  baseUrl: string;
  mode: "remote" | "local";
}): AiProviderRuntime {
  const provider = new OpenAICompatibleProvider({
    apiKey: options.apiKey,
    model: options.model,
    baseUrl: options.baseUrl,
    label: options.label,
  });
  return {
    provider,
    id: options.id,
    label: providerLabel(provider),
    model: options.model,
    mode: options.mode,
    baseUrl: options.baseUrl,
  };
}

export function createAiProviderRuntime(): AiProviderRuntime {
  const requested = (env("TBIT_AI_PROVIDER") ?? "").toLowerCase();
  const legacyKey = env("TBIT_LLM_API_KEY");
  const legacyModel = env("TBIT_LLM_MODEL");
  const legacyBaseUrl = env("TBIT_LLM_BASE_URL");

  if (!requested && legacyKey && legacyModel) {
    return openAiCompatibleRuntime({
      id: "openai-compatible",
      label: "OpenAI-Compatible",
      apiKey: legacyKey,
      model: legacyModel,
      baseUrl: legacyBaseUrl ?? "https://api.openai.com/v1",
      mode: legacyBaseUrl?.includes("localhost") || legacyBaseUrl?.includes("127.0.0.1") ? "local" : "remote",
    });
  }

  if (requested === "openai" || requested === "openai-compatible") {
    const apiKey = env("OPENAI_API_KEY") ?? legacyKey;
    const model = env("OPENAI_MODEL") ?? legacyModel ?? "gpt-4o-mini";
    if (!apiKey) return deterministicRuntime();
    return openAiCompatibleRuntime({
      id: requested,
      label: requested === "openai" ? "OpenAI" : "OpenAI-Compatible",
      apiKey,
      model,
      baseUrl: env("OPENAI_BASE_URL") ?? legacyBaseUrl ?? "https://api.openai.com/v1",
      mode: "remote",
    });
  }

  if (requested === "gemini") {
    const apiKey = env("GEMINI_API_KEY") ?? legacyKey;
    const model = env("GEMINI_MODEL") ?? "gemini-2.5-flash";
    if (!apiKey) return deterministicRuntime();
    const baseUrl = normalizeGeminiBaseUrl(env("GEMINI_BASE_URL"));
    const provider = new GeminiProvider({ apiKey, model, baseUrl });
    return { provider, id: "gemini", label: providerLabel(provider), model, mode: "remote", baseUrl: baseUrl ?? GEMINI_DEFAULT_BASE_URL };
  }

  if (requested === "claude" || requested === "anthropic") {
    const apiKey = env("ANTHROPIC_API_KEY") ?? legacyKey;
    const model = env("ANTHROPIC_MODEL") ?? "claude-3-5-haiku-latest";
    if (!apiKey) return deterministicRuntime();
    const provider = new AnthropicProvider({ apiKey, model, baseUrl: env("ANTHROPIC_BASE_URL") });
    return { provider, id: "claude", label: providerLabel(provider), model, mode: "remote", baseUrl: env("ANTHROPIC_BASE_URL") };
  }

  if (requested === "ollama") {
    return openAiCompatibleRuntime({
      id: "ollama",
      label: "Ollama",
      apiKey: env("OLLAMA_API_KEY") ?? "",
      model: env("OLLAMA_MODEL") ?? legacyModel ?? "llama3.1",
      baseUrl: env("OLLAMA_BASE_URL") ?? "http://localhost:11434/v1",
      mode: "local",
    });
  }

  if (requested === "lmstudio" || requested === "lm-studio") {
    return openAiCompatibleRuntime({
      id: "lmstudio",
      label: "LM Studio",
      apiKey: env("LMSTUDIO_API_KEY") ?? "",
      model: env("LMSTUDIO_MODEL") ?? legacyModel ?? "local-model",
      baseUrl: env("LMSTUDIO_BASE_URL") ?? "http://localhost:1234/v1",
      mode: "local",
    });
  }

  if (requested === "grok" || requested === "xai") {
    const apiKey = env("XAI_API_KEY") ?? env("GROK_API_KEY") ?? legacyKey;
    const baseUrl = env("XAI_BASE_URL") ?? env("GROK_BASE_URL") ?? legacyBaseUrl;
    if (!apiKey || !baseUrl) return deterministicRuntime();
    return openAiCompatibleRuntime({
      id: "grok",
      label: "Grok / xAI",
      apiKey,
      model: env("XAI_MODEL") ?? env("GROK_MODEL") ?? legacyModel ?? "grok",
      baseUrl,
      mode: baseUrl.includes("localhost") || baseUrl.includes("127.0.0.1") ? "local" : "remote",
    });
  }

  if (requested === "qwen") {
    const apiKey = env("QWEN_API_KEY") ?? legacyKey;
    const baseUrl = env("QWEN_BASE_URL") ?? legacyBaseUrl;
    if (!apiKey || !baseUrl) return deterministicRuntime();
    return openAiCompatibleRuntime({
      id: "qwen",
      label: "Qwen",
      apiKey,
      model: env("QWEN_MODEL") ?? legacyModel ?? "qwen",
      baseUrl,
      mode: baseUrl.includes("localhost") || baseUrl.includes("127.0.0.1") ? "local" : "remote",
    });
  }

  if (requested === "hermes" || requested === "nous") {
    return openAiCompatibleRuntime({
      id: "hermes",
      label: "Hermes",
      apiKey: env("HERMES_API_KEY") ?? legacyKey ?? "",
      model: env("HERMES_MODEL") ?? legacyModel ?? "nous-hermes",
      baseUrl: env("HERMES_BASE_URL") ?? legacyBaseUrl ?? "http://localhost:11434/v1",
      mode: (env("HERMES_BASE_URL") ?? legacyBaseUrl ?? "http://localhost:11434/v1").includes("localhost")
        || (env("HERMES_BASE_URL") ?? legacyBaseUrl ?? "http://localhost:11434/v1").includes("127.0.0.1")
        ? "local"
        : "remote",
    });
  }

  return deterministicRuntime();
}

export function createAiProviderRuntimeFromConfig(config?: AiProviderRuntimeConfig): AiProviderRuntime {
  const requested = (config?.id ?? "").toLowerCase().trim();
  if (!requested) return createAiProviderRuntime();
  if (requested === "deterministic" || requested === "tbit-local") return deterministicRuntime();

  const legacyKey = env("TBIT_LLM_API_KEY");
  const legacyModel = env("TBIT_LLM_MODEL");
  const legacyBaseUrl = env("TBIT_LLM_BASE_URL");

  if (requested === "openai" || requested === "openai-compatible") {
    const label = requested === "openai" ? "OpenAI" : "OpenAI-Compatible";
    const baseUrl = config?.baseUrl ?? env("OPENAI_BASE_URL") ?? legacyBaseUrl ?? (requested === "openai" ? "https://api.openai.com/v1" : undefined);
    return openAiCompatibleRuntime({
      id: requested,
      label,
      apiKey: required(config?.apiKey ?? env("OPENAI_API_KEY") ?? legacyKey, label, "API key"),
      model: config?.model ?? env("OPENAI_MODEL") ?? legacyModel ?? "gpt-4o-mini",
      baseUrl: required(baseUrl, label, "base URL compatible"),
      mode: isLocalBaseUrl(baseUrl) ? "local" : "remote",
    });
  }

  if (requested === "gemini") {
    const apiKey = required(config?.apiKey ?? env("GEMINI_API_KEY") ?? legacyKey, "Gemini", "API key");
    const model = config?.model ?? env("GEMINI_MODEL") ?? "gemini-2.5-flash";
    const baseUrl = normalizeGeminiBaseUrl(config?.baseUrl ?? env("GEMINI_BASE_URL"));
    const provider = new GeminiProvider({ apiKey, model, baseUrl });
    return { provider, id: "gemini", label: providerLabel(provider), model, mode: "remote", baseUrl: baseUrl ?? GEMINI_DEFAULT_BASE_URL };
  }

  if (requested === "claude" || requested === "anthropic") {
    const apiKey = required(config?.apiKey ?? env("ANTHROPIC_API_KEY") ?? legacyKey, "Claude", "API key");
    const model = config?.model ?? env("ANTHROPIC_MODEL") ?? "claude-3-5-haiku-latest";
    const baseUrl = config?.baseUrl ?? env("ANTHROPIC_BASE_URL");
    const provider = new AnthropicProvider({ apiKey, model, baseUrl });
    return { provider, id: "claude", label: providerLabel(provider), model, mode: "remote", baseUrl };
  }

  if (requested === "grok" || requested === "xai") {
    const baseUrl = config?.baseUrl ?? env("XAI_BASE_URL") ?? env("GROK_BASE_URL") ?? legacyBaseUrl;
    return openAiCompatibleRuntime({
      id: "grok",
      label: "Grok / xAI",
      apiKey: required(config?.apiKey ?? env("XAI_API_KEY") ?? env("GROK_API_KEY") ?? legacyKey, "Grok / xAI", "API key"),
      model: config?.model ?? env("XAI_MODEL") ?? env("GROK_MODEL") ?? legacyModel ?? "grok",
      baseUrl: required(baseUrl, "Grok / xAI", "base URL compatible"),
      mode: isLocalBaseUrl(baseUrl) ? "local" : "remote",
    });
  }

  if (requested === "qwen") {
    const baseUrl = config?.baseUrl ?? env("QWEN_BASE_URL") ?? legacyBaseUrl;
    return openAiCompatibleRuntime({
      id: "qwen",
      label: "Qwen",
      apiKey: required(config?.apiKey ?? env("QWEN_API_KEY") ?? legacyKey, "Qwen", "API key"),
      model: config?.model ?? env("QWEN_MODEL") ?? legacyModel ?? "qwen",
      baseUrl: required(baseUrl, "Qwen", "base URL compatible"),
      mode: isLocalBaseUrl(baseUrl) ? "local" : "remote",
    });
  }

  if (requested === "hermes" || requested === "nous") {
    const baseUrl = config?.baseUrl ?? env("HERMES_BASE_URL") ?? legacyBaseUrl ?? "http://localhost:11434/v1";
    return openAiCompatibleRuntime({
      id: "hermes",
      label: "Hermes",
      apiKey: config?.apiKey ?? env("HERMES_API_KEY") ?? legacyKey ?? "",
      model: config?.model ?? env("HERMES_MODEL") ?? legacyModel ?? "nous-hermes",
      baseUrl,
      mode: isLocalBaseUrl(baseUrl) ? "local" : "remote",
    });
  }

  if (requested === "ollama") {
    const baseUrl = config?.baseUrl ?? env("OLLAMA_BASE_URL") ?? "http://localhost:11434/v1";
    return openAiCompatibleRuntime({
      id: "ollama",
      label: "Ollama",
      apiKey: config?.apiKey ?? env("OLLAMA_API_KEY") ?? "",
      model: config?.model ?? env("OLLAMA_MODEL") ?? legacyModel ?? "llama3.1",
      baseUrl,
      mode: "local",
    });
  }

  if (requested === "lmstudio" || requested === "lm-studio") {
    const baseUrl = config?.baseUrl ?? env("LMSTUDIO_BASE_URL") ?? "http://localhost:1234/v1";
    return openAiCompatibleRuntime({
      id: "lmstudio",
      label: "LM Studio",
      apiKey: config?.apiKey ?? env("LMSTUDIO_API_KEY") ?? "",
      model: config?.model ?? env("LMSTUDIO_MODEL") ?? legacyModel ?? "local-model",
      baseUrl,
      mode: "local",
    });
  }

  throw new Error(`Proveedor IA no soportado: ${requested}`);
}

