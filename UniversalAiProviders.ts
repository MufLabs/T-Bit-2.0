import { AiMessage, AiProvider, AiProviderRequest, AiProviderResponse, AiToolCall, AiToolSchema } from "./AiProvider";

function systemText(messages: AiMessage[]): string | undefined {
  return messages.find((message) => message.role === "system" && typeof message.content === "string")?.content ?? undefined;
}

function stableToolCallId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function textFromContentParts(parts: unknown): string {
  if (typeof parts === "string") return parts;
  if (!Array.isArray(parts)) return "";
  return parts
    .map((part) => {
      if (part && typeof part === "object" && "text" in part && typeof (part as { text?: unknown }).text === "string") {
        return (part as { text: string }).text;
      }
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

function openAiMessages(messages: AiMessage[]): AiMessage[] {
  return messages.filter((message) => message.role !== "system");
}

const GEMINI_DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

function normalizeGeminiModelId(model: string): string {
  return model.trim().replace(/^models\//i, "");
}

function normalizeGeminiBaseUrl(baseUrl?: string): string {
  const trimmed = (baseUrl ?? GEMINI_DEFAULT_BASE_URL).trim().replace(/\/+$/, "");
  if (!trimmed) return GEMINI_DEFAULT_BASE_URL;
  return trimmed
    .replace(/\/models\/[^/]+(?::generateContent)?$/i, "")
    .replace(/\/models$/i, "");
}

export class AnthropicProvider implements AiProvider {
  readonly label = "Claude";
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;

  constructor(options: { apiKey: string; model: string; baseUrl?: string }) {
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.baseUrl = options.baseUrl ?? "https://api.anthropic.com/v1";
  }

  async generateWithTools(request: AiProviderRequest): Promise<AiProviderResponse> {
    const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}/messages`, {
      method: "POST",
      headers: {
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 1200,
        system: systemText(request.messages),
        messages: this.toAnthropicMessages(openAiMessages(request.messages)),
        tools: request.toolChoice === "none" ? undefined : request.tools?.map((tool) => ({
          name: tool.function.name,
          description: tool.function.description,
          input_schema: tool.function.parameters,
        })),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Claude rechazo la solicitud: ${response.status} ${errorText}`);
    }

    const payload = (await response.json()) as {
      content?: Array<{ type: string; text?: string; id?: string; name?: string; input?: unknown }>;
    };
    const toolCalls: AiToolCall[] = [];
    const textParts: string[] = [];

    for (const part of payload.content ?? []) {
      if (part.type === "text" && part.text) textParts.push(part.text);
      if (part.type === "tool_use" && part.name) {
        toolCalls.push({
          id: part.id ?? stableToolCallId("claude_tool"),
          type: "function",
          function: {
            name: part.name,
            arguments: JSON.stringify(part.input ?? {}),
          },
        });
      }
    }

    return {
      message: {
        role: "assistant",
        content: textParts.join("\n") || null,
        tool_calls: toolCalls.length ? toolCalls : undefined,
      },
    };
  }

  private toAnthropicMessages(messages: AiMessage[]) {
    return messages.map((message) => {
      if (message.role === "tool") {
        return {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: message.tool_call_id,
              content: message.content ?? "",
            },
          ],
        };
      }

      if (message.role === "assistant" && message.tool_calls?.length) {
        return {
          role: "assistant",
          content: message.tool_calls.map((call) => ({
            type: "tool_use",
            id: call.id,
            name: call.function.name,
            input: JSON.parse(call.function.arguments || "{}"),
          })),
        };
      }

      return {
        role: message.role === "assistant" ? "assistant" : "user",
        content: message.content ?? "",
      };
    });
  }
}

export class GeminiProvider implements AiProvider {
  readonly label = "Gemini";
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;

  constructor(options: { apiKey: string; model: string; baseUrl?: string }) {
    this.apiKey = options.apiKey;
    this.model = normalizeGeminiModelId(options.model);
    this.baseUrl = normalizeGeminiBaseUrl(options.baseUrl);
  }

  async generateWithTools(request: AiProviderRequest): Promise<AiProviderResponse> {
    const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}/models/${this.model}:generateContent?key=${encodeURIComponent(this.apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: systemText(request.messages) ? { parts: [{ text: systemText(request.messages) }] } : undefined,
        contents: this.toGeminiContents(openAiMessages(request.messages)),
        tools: request.toolChoice === "none" ? undefined : request.tools?.length ? [{
          functionDeclarations: request.tools.map((tool) => ({
            name: tool.function.name,
            description: tool.function.description,
            parameters: tool.function.parameters,
          })),
        }] : undefined,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini rechazo la solicitud: ${response.status} ${errorText}`);
    }

    const payload = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string; functionCall?: { name?: string; args?: unknown } }> } }>;
    };
    const parts = payload.candidates?.[0]?.content?.parts ?? [];
    const toolCalls: AiToolCall[] = [];
    const textParts: string[] = [];

    for (const part of parts) {
      if (part.text) textParts.push(part.text);
      if (part.functionCall?.name) {
        toolCalls.push({
          id: stableToolCallId("gemini_tool"),
          type: "function",
          function: {
            name: part.functionCall.name,
            arguments: JSON.stringify(part.functionCall.args ?? {}),
          },
        });
      }
    }

    return {
      message: {
        role: "assistant",
        content: textParts.join("\n") || null,
        tool_calls: toolCalls.length ? toolCalls : undefined,
      },
    };
  }

  private toGeminiContents(messages: AiMessage[]) {
    return messages.flatMap((message) => {
      if (message.role === "tool") {
        return [{
          role: "user",
          parts: [{
            text: [
              `Resultado de herramienta T-BIT: ${message.name ?? "tool"}`,
              message.content ?? "",
            ].join("\n"),
          }],
        }];
      }

      if (message.role === "assistant" && message.tool_calls?.length) {
        // Gemini native tool calls include provider-side metadata that must not be
        // reconstructed as plain text. Re-sending them as text made the model echo
        // internal "Solicitud de herramienta" traces to the user. The paired tool
        // results below are enough context for the final natural-language answer.
        return [];
      }

      return [{
        role: message.role === "assistant" ? "model" : "user",
        parts: [{ text: message.content ?? "" }],
      }];
    });
  }
}

export function providerLabel(provider: AiProvider): string {
  const maybe = provider as AiProvider & { label?: string };
  return maybe.label ?? (provider.constructor.name.replace(/Provider$/, "") || "Deterministic");
}


