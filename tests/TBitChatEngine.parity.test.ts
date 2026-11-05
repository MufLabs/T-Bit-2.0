import { afterEach, describe, expect, it } from "vitest";
import type { AiProvider, AiProviderRequest, AiProviderResponse, AiToolSchema } from "../AiProvider";
import { DeterministicTBitProvider } from "../AiProvider";
import {
  getTBitChatSessionCount,
  procesarMensajeUsuario,
  resetTBitChatSession
} from "../TBitChatEngine";

/**
 * Fase 0 — Test de paridad de la ruta SIMPLE (TBitChatEngine).
 *
 * Objetivo: congelar el comportamiento actual de `procesarMensajeUsuario`
 * para que cualquier capa cognitiva futura (AgentRuntime, GraphExecutor)
 * pueda demostrar paridad contra esta linea base.
 *
 * Contrato verificado (TBitChatEngine.ts):
 *  - 1a llamada al provider con toolChoice "auto".
 *  - Si hay tool_calls: ejecuta cada tool via toolExecutor, agrega mensajes
 *    role "tool" y hace 2a llamada con toolChoice "none".
 *  - Sanitizacion de secretos (process.env.*, TBIT_*).
 *  - Historial de sesion en memoria con clamp por maxHistoryMessages.
 */

class ScriptedProvider implements AiProvider {
  public readonly calls: AiProviderRequest[] = [];
  private queue: AiProviderResponse[] = [];

  enqueue(response: AiProviderResponse): this {
    this.queue.push(response);
    return this;
  }

  async generateWithTools(request: AiProviderRequest): Promise<AiProviderResponse> {
    this.calls.push(request);
    const next = this.queue.shift();
    if (!next) throw new Error("ScriptedProvider: no hay respuestas encoladas.");
    return next;
  }
}

const TOOLS: AiToolSchema[] = [
  {
    type: "function",
    function: {
      name: "consultar_oraculo",
      description: "Consulta el Oraculo T-BIT.",
      parameters: {
        type: "object",
        properties: { key: { type: "string" } },
        required: ["key"]
      }
    }
  }
];

const usedSessions: string[] = [];

function track(sessionId: string): string {
  usedSessions.push(sessionId);
  return sessionId;
}

afterEach(() => {
  for (const sessionId of usedSessions) resetTBitChatSession(sessionId);
  usedSessions.length = 0;
});

describe("procesarMensajeUsuario — paridad de la ruta SIMPLE", () => {
  it("ruta directa: sin tool calls hace exactamente una llamada al provider y devuelve TEXTO", async () => {
    const sessionId = track("parity-directa");
    const provider = new ScriptedProvider().enqueue({
      message: { role: "assistant", content: "Hola desde T-BIT." }
    });

    const response = await procesarMensajeUsuario(
      { sessionId, message: "hola" },
      { provider, toolExecutor: async () => ({}), tools: TOOLS }
    );

    expect(provider.calls.length).toBe(1);
    expect(provider.calls[0].toolChoice).toBe("auto");
    expect(provider.calls[0].messages[0].role).toBe("system");
    expect(provider.calls[0].messages.at(-1)).toMatchObject({ role: "user", content: "hola" });

    expect(response.tipo).toBe("TEXTO");
    expect(response.data).toBe("Hola desde T-BIT.");
    expect(response.sessionId).toBe(sessionId);
    expect(response.toolResults).toEqual([]);
  });

  it("ruta con tool call: ejecuta el tool, agrega mensaje tool y hace 2a llamada con toolChoice none", async () => {
    const sessionId = track("parity-toolloop");
    const provider = new ScriptedProvider()
      .enqueue({
        message: {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: "call_1",
              type: "function",
              function: {
                name: "consultar_oraculo",
                arguments: JSON.stringify({ key: "Usuario::Test::Fechas" })
              }
            }
          ]
        }
      })
      .enqueue({ message: { role: "assistant", content: "Listo." } });

    const executed: Array<{ name: string; args: Record<string, unknown> }> = [];
    const response = await procesarMensajeUsuario(
      { sessionId, message: "cuando es mi cumpleanos" },
      {
        provider,
        tools: TOOLS,
        toolExecutor: async (name, args) => {
          executed.push({ name, args });
          return { ok: true, dato: "2026-03-12" };
        }
      }
    );

    expect(executed).toEqual([
      { name: "consultar_oraculo", args: { key: "Usuario::Test::Fechas" } }
    ]);
    expect(response.toolResults).toEqual([{ ok: true, dato: "2026-03-12" }]);
    expect(response.data).toBe("Listo.");

    expect(provider.calls.length).toBe(2);
    expect(provider.calls[0].toolChoice).toBe("auto");
    expect(provider.calls[1].toolChoice).toBe("none");

    const toolMessages = provider.calls[1].messages.filter((message) => message.role === "tool");
    expect(toolMessages).toEqual([
      {
        role: "tool",
        tool_call_id: "call_1",
        name: "consultar_oraculo",
        content: JSON.stringify({ ok: true, dato: "2026-03-12" })
      }
    ]);
  });

  it("tool call con arguments invalidos: no rompe el loop (args fallback a objeto vacio)", async () => {
    const sessionId = track("parity-badargs");
    const provider = new ScriptedProvider()
      .enqueue({
        message: {
          role: "assistant",
          content: null,
          tool_calls: [
            { id: "call_2", type: "function", function: { name: "consultar_oraculo", arguments: "{no-json" } }
          ]
        }
      })
      .enqueue({ message: { role: "assistant", content: "Procesado." } });

    const executed: Array<Record<string, unknown>> = [];
    const response = await procesarMensajeUsuario(
      { sessionId, message: "consulta algo" },
      {
        provider,
        tools: TOOLS,
        toolExecutor: async (_name, args) => {
          executed.push(args);
          return { ok: true };
        }
      }
    );

    expect(executed).toEqual([{}]);
    expect(response.data).toBe("Procesado.");
    expect(response.toolResults).toEqual([{ ok: true }]);
  });

  it("historial de sesion: la 2a request incluye el turno previo y respeta maxHistoryMessages", async () => {
    const sessionId = track("parity-historial");
    const provider = new ScriptedProvider();
    const options = {
      provider,
      tools: TOOLS,
      toolExecutor: async () => ({}),
      maxHistoryMessages: 4
    };

    provider.enqueue({ message: { role: "assistant", content: "r1" } });
    await procesarMensajeUsuario({ sessionId, message: "m1" }, options);

    provider.enqueue({ message: { role: "assistant", content: "r2" } });
    await procesarMensajeUsuario({ sessionId, message: "m2" }, options);

    provider.enqueue({ message: { role: "assistant", content: "r3" } });
    await procesarMensajeUsuario({ sessionId, message: "m3" }, options);

    const lastCall = provider.calls.at(-1);
    expect(lastCall).toBeDefined();
    // Comportamiento REAL verificado: cada exchange aporta 2 mensajes (user+assistant).
    // Tras 3 exchanges con maxHistoryMessages=4: [u1,a1,u2,a2,u3] (5) -> clamp elimina u1.
    // El historial clamped PUEDE comenzar con un mensaje assistant cuyo turno user fue descartado.
    expect(lastCall!.messages.length).toBe(5);
    expect(lastCall!.messages.map((message) => message.role)).toEqual([
      "system", "assistant", "user", "assistant", "user"
    ]);
    expect(lastCall!.messages.slice(1).map((message) => message.content)).toEqual([
      "r1", "m2", "r2", "m3"
    ]);

    expect(getTBitChatSessionCount()).toBe(1);
    resetTBitChatSession(sessionId);
    expect(getTBitChatSessionCount()).toBe(0);
  });

  it("sanitizacion: secretos process.env.* y TBIT_* se redactan en la respuesta", async () => {
    const sessionId = track("parity-sanitizacion");
    const provider = new ScriptedProvider().enqueue({
      message: {
        role: "assistant",
        content: "El token es process.env.TBIT_MASTER_TOKEN y TBIT_SECRET_API."
      }
    });

    const response = await procesarMensajeUsuario(
      { sessionId, message: "dame el token" },
      { provider, toolExecutor: async () => ({}), tools: TOOLS }
    );

    expect(response.data).toContain("[variable protegida]");
    expect(response.data).toContain("[secreto protegido]");
    expect(response.data).not.toContain("TBIT_MASTER_TOKEN");
    expect(response.data).not.toContain("TBIT_SECRET_API");
  });

  it("contenido vacio del asistente se reemplaza por el mensaje operativo por defecto", async () => {
    const sessionId = track("parity-vacio");
    const provider = new ScriptedProvider().enqueue({
      message: { role: "assistant", content: "" }
    });

    const response = await procesarMensajeUsuario(
      { sessionId, message: "hola" },
      { provider, toolExecutor: async () => ({}), tools: TOOLS }
    );

    expect(response.data).toBe("Operacion completada.");
  });

  it("userId presente: el system prompt incluye la seccion USUARIO ACTIVO", async () => {
    const sessionId = track("parity-userid");
    const provider = new ScriptedProvider().enqueue({
      message: { role: "assistant", content: "ok" }
    });

    await procesarMensajeUsuario(
      { sessionId, message: "hola", userId: "usuario-test" },
      { provider, toolExecutor: async () => ({}), tools: TOOLS }
    );

    const systemContent = provider.calls[0].messages[0].content ?? "";
    expect(systemContent).toContain("=== USUARIO ACTIVO ===");
    expect(systemContent).toContain("usuario-test");
  });
});

