import { describe, expect, it } from "vitest";
import { DeterministicTBitProvider } from "../AiProvider";

/**
 * Fase 0 — Paridad del provider determinista (AiProvider.ts).
 *
 * DeterministicTBitProvider es la ruta sin LLM externo del sistema
 * (usada cuando no hay API keys). Congela su contrato:
 *  - "recuerda..."  -> tool call memorizar_en_vacio
 *  - "consulta.../cuando..." -> tool call consultar_oraculo
 *  - tras un tool result -> respuesta humanizada, nunca JSON crudo
 *  - mensaje generico -> instruccion de capacidades
 */

const TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "consultar_oraculo",
      description: "Consulta el Oraculo T-BIT.",
      parameters: { type: "object", properties: { key: { type: "string" } } }
    }
  }
];

describe("DeterministicTBitProvider", () => {
  it("'recuerda...' genera tool call memorizar_en_vacio con clave de perfil de cumpleanos", async () => {
    const provider = new DeterministicTBitProvider();
    const response = await provider.generateWithTools({
      messages: [{ role: "user", content: "recuerda que mi cumpleanos es el 12 de marzo" }],
      tools: TOOLS
    });

    expect(response.message.tool_calls).toBeDefined();
    expect(response.message.tool_calls!.length).toBe(1);
    expect(response.message.tool_calls![0].function.name).toBe("memorizar_en_vacio");

    const args = JSON.parse(response.message.tool_calls![0].function.arguments) as Record<string, unknown>;
    expect(args.key).toBe("Usuario::Perfil::Cumpleanos");
    expect(args.payload).toMatchObject({
      declaracion_original: expect.stringContaining("cumpleanos")
    });
  });

  it("'consulta... cuando...' genera tool call consultar_oraculo", async () => {
    const provider = new DeterministicTBitProvider();
    const response = await provider.generateWithTools({
      messages: [{ role: "user", content: "consulta cuando es mi cumpleanos" }],
      tools: TOOLS
    });

    expect(response.message.tool_calls![0].function.name).toBe("consultar_oraculo");
    const args = JSON.parse(response.message.tool_calls![0].function.arguments) as Record<string, unknown>;
    expect(args.key).toBe("Usuario::Perfil::Cumpleanos");
  });

  it("tras un resultado de tool, humaniza el payload en lugar de exponer JSON crudo", async () => {
    const provider = new DeterministicTBitProvider();
    const payload = { dato: JSON.stringify({ data: { fecha_exacta: "2026-03-12" } }) };
    const response = await provider.generateWithTools({
      messages: [
        { role: "user", content: "consulta cuando es mi cumpleanos" },
        { role: "tool", content: JSON.stringify(payload) }
      ],
      tools: TOOLS
    });

    expect(response.message.role).toBe("assistant");
    expect(response.message.content).toBe("La informacion recuperada indica: 2026-03-12.");
  });

  it("mensaje generico devuelve la instruccion de capacidades por defecto", async () => {
    const provider = new DeterministicTBitProvider();
    const response = await provider.generateWithTools({
      messages: [{ role: "user", content: "hola" }],
      tools: TOOLS
    });

    expect(response.message.content).toContain("Estoy listo");
    expect(response.message.tool_calls).toBeUndefined();
  });
});
