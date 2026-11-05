import { enrichPayloadWithFractalProjection } from "./fractalProjection";
import { buildTBitApiHeaders } from "./tbitApiHeaders";

export type TBitChatClientResponse = {
  ok: boolean;
  tipo?: "TEXTO";
  data?: string;
  sessionId?: string;
  toolResults?: unknown[];
  provider?: string;
  providerInfo?: TBitAiProviderInfo;
  meta?: TBitChatActionMeta | null;
  error?: string;
};

export type TBitAiProviderInfo = {
  id: string;
  label: string;
  model: string;
  mode: "deterministic" | "remote" | "local";
  baseUrl?: string;
};

export type TBitAiProviderConfig = {
  id: string;
  apiKey?: string;
  model?: string;
  baseUrl?: string;
};

export type TBitAiProviderDescriptor = {
  id: string;
  label: string;
  mode: "deterministic" | "remote" | "local";
  defaultModel: string;
  defaultBaseUrl?: string;
  requiresApiKey: boolean;
  requiresBaseUrl: boolean;
  protocol: "native" | "openai-compatible" | "deterministic";
  runtimeId?: string;
  custom?: boolean;
};

export type TBitChatActionMeta = {
  actionType: "INJECT" | "ORACLE" | "EQUATION" | "SYMBOLIC";
  key: string;
  coordinates?: [number, number, number];
  coordenadas?: [number, number, number];
  antiCoordinates?: [number, number, number];
  antiCoordenadas?: [number, number, number];
  provider?: string;
};

const API_BASE_URL = import.meta.env.VITE_TBIT_API_BASE_URL ?? "http://localhost:3000";
const REMOTE_TEST_PROVIDER_TIMEOUT_MS = 75000;
const LOCAL_TEST_PROVIDER_TIMEOUT_MS = 190000;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function isVector3(value: unknown): value is [number, number, number] {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((item) => typeof item === "number" && Number.isFinite(item))
  );
}

function inferActionMeta(toolResults: unknown[] | undefined, provider?: string): TBitChatActionMeta | null {
  if (!toolResults?.length) return null;

  for (let index = toolResults.length - 1; index >= 0; index -= 1) {
    const result = enrichPayloadWithFractalProjection(asRecord(toolResults[index]));
    const key = result.key ?? result.clave ?? result.dataKey;
    const coordinates = result.coordinates ?? result.coordenadas;
    const antiCoordinates = result.antiCoordinates ?? result.antiCoordenadas;
    const status = String(result.status ?? result.message ?? "").toLowerCase();
    const hasRecoveredData = typeof result.dato === "string" || typeof result.data === "string";

    if (typeof key === "string" || isVector3(coordinates)) {
      let actionType: TBitChatActionMeta["actionType"] = "ORACLE";
      if (status.includes("escritura") || status.includes("guardad") || status.includes("inyect")) {
        actionType = "INJECT";
      } else if (status.includes("ecuacion") || status.includes("equation")) {
        actionType = "EQUATION";
      } else if (status.includes("simbol") || status.includes("symbolic")) {
        actionType = "SYMBOLIC";
      } else if (hasRecoveredData) {
        actionType = "ORACLE";
      }

      return {
        actionType,
        key: typeof key === "string" ? key : "TBIT::AI::UNKNOWN",
        coordinates: isVector3(result.coordinates) ? result.coordinates : isVector3(coordinates) ? coordinates : undefined,
        coordenadas: isVector3(result.coordenadas) ? result.coordenadas : isVector3(coordinates) ? coordinates : undefined,
        antiCoordinates: isVector3(result.antiCoordinates) ? result.antiCoordinates : isVector3(antiCoordinates) ? antiCoordinates : undefined,
        antiCoordenadas: isVector3(result.antiCoordenadas) ? result.antiCoordenadas : isVector3(antiCoordinates) ? antiCoordinates : undefined,
        provider,
      };
    }
  }

  return null;
}

function emitChatTelemetry(response: TBitChatClientResponse) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("tbit:chat-response", {
      detail: response,
    }),
  );
  if (response.meta) {
    window.dispatchEvent(
      new CustomEvent("tbit:cognitive-action", {
        detail: {
          type: response.meta.actionType,
          key: response.meta.key,
          coordinates: response.meta.coordinates,
          coordenadas: response.meta.coordenadas ?? response.meta.coordinates,
          antiCoordinates: response.meta.antiCoordinates,
          antiCoordenadas: response.meta.antiCoordenadas ?? response.meta.antiCoordinates,
          provider: response.meta.provider,
          timestamp: Date.now(),
        },
      }),
    );
  }
}

async function fetchWithClientTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`La prueba del proveedor IA excedio ${Math.round(timeoutMs / 1000)}s.`);
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

function isLocalAiProviderTest(provider: TBitAiProviderConfig): boolean {
  const id = provider.id.toLowerCase();
  const baseUrl = (provider.baseUrl ?? "").toLowerCase();
  return (
    id.includes("ollama") ||
    id.includes("lmstudio") ||
    id.includes("hermes") ||
    baseUrl.includes("localhost") ||
    baseUrl.includes("127.0.0.1") ||
    baseUrl.includes("[::1]") ||
    baseUrl.includes("::1")
  );
}

export async function sendTBitAiChatMessage(
  sessionId: string,
  message: string,
  provider?: TBitAiProviderConfig,
  userId?: string,
): Promise<TBitChatClientResponse> {
  const response = await fetch(`${API_BASE_URL}/api/ai/chat`, {
    method: "POST",
    headers: buildTBitApiHeaders(true, { userId }),
    body: JSON.stringify({
      sessionId,
      message: message.normalize("NFC"),
      provider,
      userId,
    }),
  });

  const payload = (await response.json()) as TBitChatClientResponse;
  if (!response.ok) {
    return {
      ok: false,
      error: payload.error ?? "Error en Orquestador Cognitivo Multi-IA.",
    };
  }
  const enrichedToolResults = payload.toolResults?.map((item) =>
    enrichPayloadWithFractalProjection(asRecord(item)),
  );
  const enrichedPayload: TBitChatClientResponse = {
    ...payload,
    toolResults: enrichedToolResults ?? payload.toolResults,
    meta: payload.meta ?? inferActionMeta(enrichedToolResults ?? payload.toolResults, payload.provider),
  };
  emitChatTelemetry(enrichedPayload);
  return enrichedPayload;
}

export async function resetTBitAiChatSession(sessionId: string): Promise<void> {
  await fetch(`${API_BASE_URL}/api/ai/chat/${encodeURIComponent(sessionId)}`, {
    method: "DELETE",
    headers: buildTBitApiHeaders(),
  });
}

export async function getTBitAiProvider(): Promise<TBitAiProviderInfo> {
  const response = await fetch(`${API_BASE_URL}/api/ai/provider`, {
    headers: buildTBitApiHeaders(),
  });
  const payload = (await response.json()) as { ok?: boolean; provider?: TBitAiProviderInfo; error?: string };
  if (!response.ok || !payload.provider) {
    throw new Error(payload.error ?? "No se pudo leer el proveedor IA activo.");
  }
  return payload.provider;
}

export async function getTBitAiProviders(): Promise<{
  activeProvider: TBitAiProviderInfo;
  providers: TBitAiProviderDescriptor[];
}> {
  const response = await fetch(`${API_BASE_URL}/api/ai/providers`, {
    headers: buildTBitApiHeaders(),
  });
  const payload = (await response.json()) as {
    ok?: boolean;
    activeProvider?: TBitAiProviderInfo;
    providers?: TBitAiProviderDescriptor[];
    error?: string;
  };
  if (!response.ok || !payload.providers || !payload.activeProvider) {
    throw new Error(payload.error ?? "No se pudo leer el catalogo de proveedores IA.");
  }
  return {
    activeProvider: payload.activeProvider,
    providers: payload.providers,
  };
}

export async function testTBitAiProvider(provider: TBitAiProviderConfig): Promise<{
  ok: boolean;
  provider?: TBitAiProviderInfo;
  sample?: string;
  error?: string;
}> {
  try {
    const timeoutMs = isLocalAiProviderTest(provider)
      ? LOCAL_TEST_PROVIDER_TIMEOUT_MS
      : REMOTE_TEST_PROVIDER_TIMEOUT_MS;
    const response = await fetchWithClientTimeout(`${API_BASE_URL}/api/ai/provider/test`, {
      method: "POST",
      headers: buildTBitApiHeaders(true),
      body: JSON.stringify({ provider }),
    }, timeoutMs);
    const payload = (await response.json()) as {
      ok?: boolean;
      provider?: TBitAiProviderInfo;
      sample?: string;
      error?: string;
    };
    return {
      ok: response.ok && payload.ok === true,
      provider: payload.provider,
      sample: payload.sample,
      error: payload.error,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "No se pudo probar el proveedor IA.",
    };
  }
}

export const tbitChatClient = {
  sendMessage: sendTBitAiChatMessage,
  resetSession: resetTBitAiChatSession,
  getProvider: getTBitAiProvider,
  getProviders: getTBitAiProviders,
  testProvider: testTBitAiProvider,
};
