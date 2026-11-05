import { AiMessage, AiProvider, AiProviderRequest, AiProviderResponse } from "./AiProvider";

export type OpenAICompatibleProviderOptions = {
  apiKey: string;
  model: string;
  baseUrl?: string;
  label?: string;
};

const DEFAULT_PROVIDER_TIMEOUT_MS = Number(process.env.TBIT_AI_PROVIDER_TIMEOUT_MS ?? 60000);
const LOCAL_PROVIDER_TIMEOUT_MS = Number(process.env.TBIT_LOCAL_AI_PROVIDER_TIMEOUT_MS ?? 180000);

function isLocalBaseUrl(baseUrl: string): boolean {
  return baseUrl.includes("localhost") || baseUrl.includes("127.0.0.1") || baseUrl.includes("::1");
}

function normalizeOpenAiCompatibleBaseUrl(baseUrl?: string): string {
  const trimmed = (baseUrl ?? "https://api.openai.com/v1").trim().replace(/\/+$/, "");
  if (!trimmed) return "https://api.openai.com/v1";
  return trimmed.replace(/\/chat\/completions$/i, "");
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = DEFAULT_PROVIDER_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`TIMEOUT: el proveedor IA no respondio en ${Math.round(timeoutMs / 1000)}s.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export class OpenAICompatibleProvider implements AiProvider {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;
  readonly label: string;

  constructor(options: OpenAICompatibleProviderOptions) {
    this.apiKey = options.apiKey.trim();
    this.model = options.model.trim();
    this.baseUrl = normalizeOpenAiCompatibleBaseUrl(options.baseUrl);
    this.label = options.label ?? "OpenAI-Compatible";
  }

  async generateWithTools(request: AiProviderRequest): Promise<AiProviderResponse> {
    const hasTools = Boolean(request.tools?.length && request.toolChoice !== "none");
    const body: Record<string, unknown> = {
      model: this.model,
      messages: request.messages,
      stream: false,
    };

    if (hasTools) {
      body.tools = request.tools;
      body.tool_choice = "auto";
    }

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.apiKey) headers.Authorization = `Bearer ${this.apiKey}`;

    const response = await fetchWithTimeout(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }, isLocalBaseUrl(this.baseUrl) ? LOCAL_PROVIDER_TIMEOUT_MS : DEFAULT_PROVIDER_TIMEOUT_MS);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Proveedor IA rechazo la solicitud: ${response.status} ${errorText}`);
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: AiMessage }>;
    };
    const message = payload.choices?.[0]?.message;
    if (!message) throw new Error("Proveedor IA no devolvio un mensaje valido.");
    return { message };
  }
}






