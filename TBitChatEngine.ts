import { AiMessage, AiProvider, AiToolSchema } from "./AiProvider";
import { generarSystemPromptOrquestador } from "./TBitPrompts";

export type TBitToolExecutor = (toolName: string, args: Record<string, unknown>) => Promise<unknown>;

export type TBitChatEngineOptions = {
  provider: AiProvider;
  toolExecutor: TBitToolExecutor;
  tools: AiToolSchema[];
  maxHistoryMessages?: number;
  timeZone?: string;
  locale?: string;
  /**
   * Tanda 2 — Recupera contexto relevante de Q-Vault ANTES de responder
   * (misma fuente de verdad que el runtime de agentes, Fase 66).
   */
  vaultContextProvider?: (query: string, userId?: string) => Promise<ChatVaultContext>;
  /**
   * Tanda 2 — Verifica la respuesta final contra Q-Vault antes de entregarla:
   * los terminos sin respaldo quedan marcados como no verificados, con citas.
   */
  vaultVerifier?: (text: string, userId?: string) => Promise<ChatVaultVerification>;
  /**
   * Tanda 2 — Persiste la interaccion relevante en Q-Vault (memoria evolutiva
   * del chat) con wikilinks a las citas; actualiza indices derivados.
   */
  interactionPersister?: (record: ChatInteractionRecord) => Promise<PersistedChatInteraction>;
};

export type TBitChatRequest = {
  sessionId: string;
  message: string;
  userId?: string;
};

export type TBitChatResponse = {
  tipo: "TEXTO";
  data: string;
  sessionId: string;
  toolResults: unknown[];
  /** Tanda 2 — citas de Q-Vault usadas como contexto antes de responder. */
  vaultCitations?: ChatVaultCitation[];
  /** Tanda 2 — verificacion anti-alucinacion de la respuesta contra Q-Vault. */
  verification?: ChatVaultVerification | null;
  /** Tanda 2 — clave del registro persistido en Q-Vault (si la interaccion fue relevante). */
  persistedMemoryKey?: string | null;
};

/** Tanda 2 — Cita de Q-Vault (estructura compatible con AgentMemoryBridge). */
export type ChatVaultCitation = {
  key: string;
  title: string;
  source: string;
  score: number;
  preview: string;
};

/** Tanda 2 — Resultado de verificacion anti-alucinacion contra Q-Vault. */
export type ChatVaultVerification = {
  checkedTerms: string[];
  verifiedTerms: string[];
  unverifiedTerms: string[];
  citations: ChatVaultCitation[];
};

export type ChatVaultContext = {
  contextText: string | null;
  citations: ChatVaultCitation[];
};

export type ChatInteractionRecord = {
  sessionId: string;
  userMessage: string;
  assistantMessage: string;
  userId?: string;
  citations: ChatVaultCitation[];
};

export type PersistedChatInteraction = { key: string; checksum?: string } | null;

const sessionHistories = new Map<string, AiMessage[]>();

const protectedCodeBlockPatterns = [
  /===\s*IDENTIDAD DEL SISTEMA T-BIT\s*===/i,
  /\bthought_signature\b/i,
  /\btool_calls?\b/i,
  /\bfunctionCall\b/i,
  /\bfunctionResponse\b/i,
  /\bx-tbit-api-key\b/i,
  /\bprocess\.env\.[A-Z0-9_]+\b/,
  /\bTBIT_[A-Z0-9_]+\b/,
];

function removeLegacyCodeRedactionMarkers(text: string): string {
  return text.replace(/\[bloque tecnico omitido\]/gi, "[bloque de codigo omitido por una version anterior de T-BIT]");
}

function redactProtectedCodeBlocks(text: string): string {
  return text.replace(/```([a-zA-Z0-9_-]*)\n?([\s\S]*?)```/g, (match, language: string, body: string) => {
    const containsProtectedInternals = protectedCodeBlockPatterns.some((pattern) => pattern.test(body));
    if (!containsProtectedInternals) return match;
    const label = language ? ` ${language}` : "";
    return `[bloque tecnico protegido${label}]`;
  });
}

function summarizeToolTrace(text: string): string | null {
  if (!/Solicitud de herramienta T-BIT:/i.test(text)) return null;

  const keys = Array.from(text.matchAll(/"key"\s*:\s*"([^"]+)"/g))
    .map((match) => match[1])
    .filter(Boolean);
  const uniqueRoots = Array.from(new Set(keys.map((key) => key.replace(/::chunk_\d+$/i, ""))));
  const reviewed = uniqueRoots.length > 0
    ? ` Consulte ${uniqueRoots.length} registro(s) relacionado(s) en la boveda.`
    : "";

  return [
    "He ejecutado consultas internas al Oraculo T-BIT para revisar la base de conocimiento.",
    `${reviewed} Las llamadas tecnicas quedaron ocultas porque no son informacion util para el usuario.`,
    "Puedo entregarte un resumen de relaciones, documentos conectados, notas huerfanas o inconsistencias si me indicas el alcance.",
  ].join("\n\n").trim();
}

function sanitizeAssistantText(text: string | null | undefined): string {
  const safe = removeLegacyCodeRedactionMarkers((text ?? "").normalize("NFC")).trim();
  if (!safe) return "Operacion completada.";
  const toolTraceSummary = summarizeToolTrace(safe);
  if (toolTraceSummary) return toolTraceSummary;
  return redactProtectedCodeBlocks(safe)
    .replace(/process\.env\.[A-Z0-9_]+/g, "[variable protegida]")
    .replace(/TBIT_[A-Z0-9_]+/g, "[secreto protegido]")
    .replace(/=== IDENTIDAD DEL SISTEMA T-BIT ===[\s\S]*/g, "[prompt interno protegido]")
    .trim();
}

function sanitizeHistoryForProvider(history: AiMessage[]): AiMessage[] {
  return history.map((message) => {
    if (typeof message.content !== "string" || !message.content.includes("[bloque tecnico omitido]")) {
      return message;
    }

    return {
      ...message,
      content: removeLegacyCodeRedactionMarkers(message.content),
    };
  });
}

function clampHistory(history: AiMessage[], maxHistoryMessages: number): AiMessage[] {
  if (history.length <= maxHistoryMessages) return history;
  return history.slice(history.length - maxHistoryMessages);
}

function safeJsonParse(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch {
    // fall through
  }
  return {};
}

export function resetTBitChatSession(sessionId: string): void {
  sessionHistories.delete(sessionId);
}

export function getTBitChatSessionCount(): number {
  return sessionHistories.size;
}

export async function procesarMensajeUsuario(
  request: TBitChatRequest,
  options: TBitChatEngineOptions,
): Promise<TBitChatResponse> {
  const maxHistoryMessages = options.maxHistoryMessages ?? 24;
  const currentHistory = sessionHistories.get(request.sessionId) ?? [];
  const nextHistory = clampHistory(
    [...currentHistory, { role: "user", content: request.message.normalize("NFC") }],
    maxHistoryMessages,
  );

  // Tanda 2 — Contexto de Q-Vault ANTES de responder (best-effort: nunca
  // bloquea el chat si el vault no esta disponible).
  let vaultCitations: ChatVaultCitation[] = [];
  let vaultContextBlock = "";
  if (options.vaultContextProvider) {
    try {
      const retrieved = await options.vaultContextProvider(request.message, request.userId);
      if (retrieved.contextText) {
        vaultContextBlock = `\n\n${retrieved.contextText}`;
        vaultCitations = retrieved.citations;
      }
    } catch {
      // La recuperacion de contexto es best-effort.
    }
  }

  const systemMessage: AiMessage = {
    role: "system",
    content: generarSystemPromptOrquestador({
      locale: options.locale,
      timeZone: options.timeZone,
    }) + (request.userId ? `\n\n=== USUARIO ACTIVO ===\n- ID local T-BIT: ${request.userId}\n- Si guardas memoria de usuario, usa esta raiz logica en lugar de Usuario::.\n` : "") + "\n\n=== POLITICA DE CODIGO SOLICITADO ===\n- Si el usuario pide codigo, scripts o snippets benignos, muestra el codigo completo en bloques Markdown normales.\n- No uses el marcador '[bloque tecnico omitido]'. Ese marcador pertenece a una version anterior de T-BIT.\n" + vaultContextBlock,
  };
  const providerHistory = sanitizeHistoryForProvider(nextHistory);

  const toolResults: unknown[] = [];
  const firstResponse = await options.provider.generateWithTools({
    messages: [systemMessage, ...providerHistory],
    tools: options.tools,
    toolChoice: "auto",
  });

  const assistantMessage = firstResponse.message;
  const toolCalls = assistantMessage.tool_calls ?? [];

  if (toolCalls.length > 0) {
    nextHistory.push(assistantMessage);

    for (const call of toolCalls) {
      const args = safeJsonParse(call.function.arguments);
      const result = await options.toolExecutor(call.function.name, args);
      toolResults.push(result);
      nextHistory.push({
        role: "tool",
        tool_call_id: call.id,
        name: call.function.name,
        content: JSON.stringify(result),
      });
    }

    const finalResponse = await options.provider.generateWithTools({
      messages: [systemMessage, ...sanitizeHistoryForProvider(nextHistory)],
      tools: options.tools,
      toolChoice: "none",
    });

    const finalText = sanitizeAssistantText(finalResponse.message.content);
    nextHistory.push({ role: "assistant", content: finalText });
    sessionHistories.set(request.sessionId, clampHistory(nextHistory, maxHistoryMessages));
    return {
      tipo: "TEXTO",
      data: finalText,
      sessionId: request.sessionId,
      toolResults,
      ...await verifyAndPersistTurn(options, request, finalText, toolResults, vaultCitations),
    };
  }

  const directText = sanitizeAssistantText(assistantMessage.content);
  nextHistory.push({ role: "assistant", content: directText });
  sessionHistories.set(request.sessionId, clampHistory(nextHistory, maxHistoryMessages));
  return {
    tipo: "TEXTO",
    data: directText,
    sessionId: request.sessionId,
    toolResults,
    ...await verifyAndPersistTurn(options, request, directText, toolResults, vaultCitations),
  };
}

/**
 * Tanda 2 — Verificacion anti-alucinacion y persistencia de la interaccion.
 * Igual que el runtime de agentes (Fase 66): la respuesta final se contrasta
 * contra Q-Vault antes de entregarse y las interacciones relevantes (con
 * herramientas o con citas de respaldo) se persisten con wikilinks, lo que
 * mantiene actualizados el indice semantico y los wikilinks/backlinks.
 * Todo es best-effort: un fallo del vault nunca rompe la respuesta del chat.
 */
async function verifyAndPersistTurn(
  options: TBitChatEngineOptions,
  request: TBitChatRequest,
  finalText: string,
  toolResults: unknown[],
  vaultCitations: ChatVaultCitation[],
): Promise<Pick<TBitChatResponse, "verification" | "persistedMemoryKey"> & { vaultCitations?: ChatVaultCitation[] }> {
  let verification: ChatVaultVerification | null = null;
  if (options.vaultVerifier && finalText) {
    try {
      verification = await options.vaultVerifier(finalText, request.userId);
    } catch {
      verification = null;
    }
  }

  let persistedMemoryKey: string | null = null;
  const isRelevant = toolResults.length > 0 || (verification?.citations.length ?? 0) > 0;
  if (options.interactionPersister && isRelevant) {
    try {
      const persisted = await options.interactionPersister({
        sessionId: request.sessionId,
        userMessage: request.message,
        assistantMessage: finalText,
        userId: request.userId,
        citations: verification?.citations?.length ? verification.citations : vaultCitations,
      });
      persistedMemoryKey = persisted?.key ?? null;
    } catch {
      persistedMemoryKey = null;
    }
  }

  return { verification, persistedMemoryKey, vaultCitations };
}
