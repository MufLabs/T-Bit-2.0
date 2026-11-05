export type AiRole = "system" | "user" | "assistant" | "tool";

export type AiToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type AiMessage = {
  role: AiRole;
  content?: string | null;
  tool_call_id?: string;
  name?: string;
  tool_calls?: AiToolCall[];
};

export type AiToolSchema = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export type AiProviderRequest = {
  messages: AiMessage[];
  tools?: AiToolSchema[];
  toolChoice?: "auto" | "none";
};

export type AiProviderResponse = {
  message: AiMessage;
};

export interface AiProvider {
  generateWithTools(request: AiProviderRequest): Promise<AiProviderResponse>;
}

function normalizeUserText(text: string): string {
  return text.normalize("NFC").trim();
}

function stableIdFromText(text: string): string {
  return text
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 6)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("") || "Memoria";
}

function inferBasicMemoryKey(text: string): string {
  const lower = text.normalize("NFC").toLowerCase();
  if (lower.includes("cumple")) return "Usuario::Perfil::Cumpleanos";
  if (lower.includes("master key") || lower.includes("clave maestra")) return "Sistema::Seguridad::MasterKey";
  if (lower.includes("api key")) return "Sistema::Seguridad::ApiKey";
  return `Usuario::Memoria::${stableIdFromText(text)}`;
}

function extractLastUserMessage(messages: AiMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message.role === "user" && typeof message.content === "string") return message.content;
  }
  return "";
}

function extractLastToolPayload(messages: AiMessage[]): unknown | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message.role === "tool" && typeof message.content === "string") {
      try {
        return JSON.parse(message.content);
      } catch {
        return message.content;
      }
    }
  }
  return null;
}

function humanizeToolPayload(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "Operacion completada.";
  const data = payload as Record<string, unknown>;
  if (typeof data.dato === "string") {
    try {
      const parsed = JSON.parse(data.dato) as Record<string, unknown>;
      const nestedData = parsed.data as Record<string, unknown> | undefined;
      const fecha = nestedData?.fecha_calculada ?? nestedData?.fecha_exacta ?? parsed.fecha_calculada;
      if (fecha) return `La informacion recuperada indica: ${String(fecha)}.`;
      if (nestedData?.texto_original) return `Recuerdo registrado: ${String(nestedData.texto_original)}.`;
      return `Memoria recuperada: ${data.dato}`;
    } catch {
      return `Memoria recuperada: ${data.dato}`;
    }
  }
  if (typeof data.result === "string") return `Resultado: ${data.result}`;
  if (data.ok === true) return "Listo. La memoria quedo registrada y verificada en T-BIT.";
  return "Operacion procesada por T-BIT.";
}

export class DeterministicTBitProvider implements AiProvider {
  async generateWithTools(request: AiProviderRequest): Promise<AiProviderResponse> {
    const lastToolPayload = extractLastToolPayload(request.messages);
    if (lastToolPayload) {
      return { message: { role: "assistant", content: humanizeToolPayload(lastToolPayload) } };
    }

    const text = normalizeUserText(extractLastUserMessage(request.messages));
    const lower = text.toLowerCase();

    if (lower.startsWith("recuerda") || lower.includes(" recuerda ")) {
      const key = inferBasicMemoryKey(text);
      const payload = {
        declaracion_original: text,
        registro_temporal: Date.now(),
      };
      return {
        message: {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: `call_${Date.now()}`,
              type: "function",
              function: {
                name: "memorizar_en_vacio",
                arguments: JSON.stringify({ key, payload }),
              },
            },
          ],
        },
      };
    }

    if (lower.startsWith("consulta") || lower.includes("cuando") || lower.includes("cuándo")) {
      const key = inferBasicMemoryKey(text);
      return {
        message: {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: `call_${Date.now()}`,
              type: "function",
              function: {
                name: "consultar_oraculo",
                arguments: JSON.stringify({ key }),
              },
            },
          ],
        },
      };
    }

    return {
      message: {
        role: "assistant",
        content:
          "Estoy listo para guardar, consultar o calcular informacion en T-BIT. Puedes decir: recuerda..., consulta..., deriva..., integra... o resuelve....",
      },
    };
  }
}
