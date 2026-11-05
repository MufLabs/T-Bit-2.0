import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { normalizeTBitKey, normalizeUnicodeText } from "./textEncoding";
import {
  construirMemoriaSemantica,
  inferirClaveConsulta,
  obtenerPromptTemporalSistema
} from "./temporalSemantics";
import {
  EquationMemory,
  buildEinsteinEnergyMassEquation,
  evaluateEquation,
  inferEquationKey
} from "./computableMemory";

declare const fetch: (url: string, init?: {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<any>;
}>;

export type MemorizarEnVacioArgs = {
  dominio: string;
  coleccion: string;
  id_concepto: string;
  payload: Record<string, unknown> | string;
};

export type ConsultarOraculoArgs = {
  key?: string;
  dominio?: string;
  coleccion?: string;
  id_concepto?: string;
};

export type EliminarMemoriaArgs = {
  key: string;
  mode?: "document";
};

export type BuscarIndiceTBitArgs = {
  query?: string;
  userId?: string;
  source?: string;
  tags?: string[];
  attribute?: string;
  value?: string;
  limit?: number;
};

export type TBitAiBridgeConfig = {
  apiUrl?: string;
  apiKey?: string;
};

export const TBIT_AI_SYSTEM_PROMPT = `
Eres el Oraculo Cognitivo de T-BIT, una inteligencia artificial cuya memoria a largo plazo
no reside en vectores semanticos tradicionales, sino en un Vacio Digital tridimensional
gobernado por la Programacion Vectorial.

Reglas:
1. Cuando el usuario quiera guardar conocimiento persistente, estructura la memoria como:
   Dominio::Coleccion::IdConcepto.
2. Usa memorizar_en_vacio para guardar hechos, preferencias, perfiles, reglas o contexto.
3. Usa consultar_oraculo cuando el usuario solicite recordar una clave, preferencia,
   configuracion o dato previamente almacenado.
4. Usa eliminar_memoria solo cuando el usuario pida borrar/eliminar un documento o memoria
   y tengas una clave exacta confirmada.
5. No inventes recuperaciones: si consultar_oraculo falla, dilo con claridad.
6. Explica los resultados como memoria espacial recuperada del Vacio T-BIT.
${obtenerPromptTemporalSistema()}
`.trim();

export const tbitAiTools = [
  {
    type: "function",
    function: {
      name: "memorizar_en_vacio",
      description: "Guarda informacion persistente en la memoria IA T-BIT usando una clave jerarquica Dominio::Coleccion::IdConcepto.",
      parameters: {
        type: "object",
        properties: {
          dominio: {
            type: "string",
            description: "Categoria raiz del conocimiento. Ej: Usuario, Sistema, Proyecto."
          },
          coleccion: {
            type: "string",
            description: "Subgrupo logico del conocimiento. Ej: Preferencias, Arquitectura, Decisiones."
          },
          id_concepto: {
            type: "string",
            description: "Identificador exacto del concepto en CamelCase o SnakeCase."
          },
          payload: {
            type: "object",
            description: "Objeto JSON libre con los atributos que deben almacenarse."
          }
        },
        required: ["dominio", "coleccion", "id_concepto", "payload"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "consultar_oraculo",
      description: "Recupera informacion persistente desde la memoria IA T-BIT usando una clave exacta o sus componentes jerarquicos.",
      parameters: {
        type: "object",
        properties: {
          key: {
            type: "string",
            description: "Clave jerarquica completa. Ej: Usuario::Preferencias::TemaVisual."
          },
          dominio: {
            type: "string",
            description: "Categoria raiz si no se proporciona key."
          },
          coleccion: {
            type: "string",
            description: "Subgrupo logico si no se proporciona key."
          },
          id_concepto: {
            type: "string",
            description: "Identificador del concepto si no se proporciona key."
          }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "buscar_indice_tbit",
      description: "Busca memorias T-BIT por texto, usuario, tipo, tag o atributo cuando no se conoce la clave exacta.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          userId: { type: "string" },
          source: { type: "string" },
          tags: { type: "array", items: { type: "string" } },
          attribute: { type: "string" },
          value: { type: "string" },
          limit: { type: "number" }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "memorizar_ecuacion",
      description: "Guarda una ecuacion como memoria computable con LaTeX, variables y formula evaluable.",
      parameters: {
        type: "object",
        properties: {
          dominio: { type: "string" },
          coleccion: { type: "string" },
          id_concepto: { type: "string" },
          payload: {
            type: "object",
            description: "Documento de ecuacion con expresion_latex, variables y operacion.formula."
          }
        },
        required: ["dominio", "coleccion", "id_concepto", "payload"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "resolver_ecuacion",
      description: "Recupera una ecuacion computable desde T-BIT y evalua su formula con variables numericas.",
      parameters: {
        type: "object",
        properties: {
          key: { type: "string" },
          variables: {
            type: "object",
            description: "Variables numericas para sustituir en la formula."
          }
        },
        required: ["key", "variables"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "eliminar_memoria",
      description: "Elimina del Vacio T-BIT un documento Markdown completo por clave exacta, incluyendo manifiesto, chunks e indice logico.",
      parameters: {
        type: "object",
        properties: {
          key: {
            type: "string",
            description: "Clave exacta del documento Markdown a eliminar. Ej: Markdown::Mauricio::Plan_T-BIT."
          },
          mode: {
            type: "string",
            enum: ["document"],
            description: "Modo de borrado. Usa document para manifiesto + chunks."
          }
        },
        required: ["key"]
      }
    }
  }
] as const;

export class TBitAiBridge {
  private readonly apiUrl: string;
  private readonly apiKey: string;

  constructor(config: TBitAiBridgeConfig = {}) {
    loadLocalEnv();
    this.apiUrl = config.apiUrl ?? process.env.TBIT_API_URL ?? "http://localhost:3000/api";
    this.apiKey = config.apiKey ?? process.env.TBIT_API_KEY ?? "";

    if (!this.apiKey) {
      throw new Error("TBitAiBridge requiere TBIT_API_KEY o config.apiKey.");
    }
  }

  async memorizarEnVacio(args: MemorizarEnVacioArgs) {
    const key = this.buildKey(args.dominio, args.coleccion, args.id_concepto);
    const response = await fetch(`${this.apiUrl}/ai/inject`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        key,
        payload: typeof args.payload === "string" ? normalizeUnicodeText(args.payload) : args.payload
      })
    });

    return this.parseResponse(response);
  }

  async consultarOraculo(args: ConsultarOraculoArgs) {
    const key = args.key ?? this.buildKey(
      this.requirePart(args.dominio, "dominio"),
      this.requirePart(args.coleccion, "coleccion"),
      this.requirePart(args.id_concepto, "id_concepto")
    );
    const response = await fetch(`${this.apiUrl}/ai/oracle`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ key })
    });

    return this.parseResponse(response);
  }

  async eliminarMemoria(args: EliminarMemoriaArgs) {
    const key = normalizeTBitKey(args.key);
    if (!key) throw new Error("eliminar_memoria requiere una clave exacta.");

    const response = await fetch(`${this.apiUrl}/markdown/delete`, {
      method: "DELETE",
      headers: this.headers(),
      body: JSON.stringify({ key })
    });

    return this.parseResponse(response);
  }

  async buscarIndiceTBit(args: BuscarIndiceTBitArgs) {
    const response = await fetch(`${this.apiUrl}/query/search`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(args)
    });

    return this.parseResponse(response);
  }

  async handleToolCall(toolName: string, args: unknown) {
    if (toolName === "memorizar_en_vacio") {
      return this.memorizarEnVacio(args as MemorizarEnVacioArgs);
    }

    if (toolName === "consultar_oraculo") {
      return this.consultarOraculo(args as ConsultarOraculoArgs);
    }

    if (toolName === "buscar_indice_tbit") {
      return this.buscarIndiceTBit(args as BuscarIndiceTBitArgs);
    }

    if (toolName === "memorizar_ecuacion") {
      return this.memorizarEcuacion(args as MemorizarEnVacioArgs);
    }

    if (toolName === "resolver_ecuacion") {
      const payload = args as { key: string; variables: Record<string, number> };
      return this.resolverEcuacion(payload.key, payload.variables);
    }

    if (toolName === "eliminar_memoria") {
      return this.eliminarMemoria(args as EliminarMemoriaArgs);
    }

    throw new Error(`Herramienta T-BIT IA no soportada: ${toolName}`);
  }

  async memorizarTextoNatural(command: string) {
    const memory = construirMemoriaSemantica(command);
    return this.memorizarEnVacio({
      dominio: memory.key.split("::")[0],
      coleccion: memory.key.split("::")[1],
      id_concepto: memory.key.split("::")[2],
      payload: memory.payload
    });
  }

  async consultarTextoNatural(command: string) {
    return this.consultarOraculo({
      key: inferirClaveConsulta(command)
    });
  }

  async memorizarEcuacion(args: MemorizarEnVacioArgs) {
    return this.memorizarEnVacio({
      ...args,
      payload: args.payload
    });
  }

  async memorizarEcuacionEinstein() {
    const definition = buildEinsteinEnergyMassEquation();
    return this.memorizarEcuacion(definition);
  }

  async resolverEcuacion(key: string, variables: Record<string, number>) {
    const recovered = await this.consultarOraculo({ key });
    const equation = JSON.parse(recovered.dato) as EquationMemory;
    const result = evaluateEquation(equation, variables);

    return {
      ok: true,
      status: "ECUACION_RESUELTA",
      key,
      equation: equation.nombre,
      result
    };
  }

  async resolverTextoNatural(command: string, variables: Record<string, number>) {
    const key = inferEquationKey(command);

    if (!key) {
      throw new Error("No se pudo inferir la ecuacion solicitada.");
    }

    return this.resolverEcuacion(key, variables);
  }

  private buildKey(dominio: string, coleccion: string, idConcepto: string): string {
    const parts = [dominio, coleccion, idConcepto].map((part) => normalizeTBitKey(part));

    if (parts.some((part) => !part)) {
      throw new Error("La clave IA requiere dominio, coleccion e id_concepto.");
    }

    if (parts.some((part) => part.includes("::"))) {
      throw new Error("Los componentes de clave no deben contener el separador reservado ::");
    }

    return parts.join("::");
  }

  private requirePart(value: string | undefined, name: string): string {
    if (!value?.trim()) {
      throw new Error(`consultar_oraculo requiere key o ${name}.`);
    }

    return value;
  }

  private headers(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      "x-tbit-api-key": this.apiKey
    };
  }

  private async parseResponse(response: {
    ok: boolean;
    status: number;
    json: () => Promise<any>;
  }) {
    const payload = await response.json();

    if (!response.ok || payload?.ok === false) {
      throw new Error(payload?.error ?? `T-BIT IA respondio con HTTP ${response.status}`);
    }

    return payload;
  }
}

function loadLocalEnv(): void {
  const envPath = resolve(process.cwd(), ".env");

  if (!existsSync(envPath)) {
    return;
  }

  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    const value = rawValue.replace(/^["']|["']$/g, "");

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}
