import { evaluateEquation } from "./computableMemory";
import { assertAiPermission } from "./aiPermissions";
import { indexExternalMemoryRecord, removeMemoryIndexRecord } from "./memoryCore";
import { searchQueryIndex } from "./queryIndex";
import { operarSimbolicamente } from "./TBitSymbolicBridge";
import { normalizeTBitKey } from "./textEncoding";
import { researchWebPage } from "./webResearch";

type DynamicStorage = {
  inject?: (key: string, payload: string) => Promise<unknown>;
  write?: (key: string, payload: string) => Promise<unknown>;
  memorizar?: (key: string, payload: string) => Promise<unknown>;
  inyectar?: (key: string, payload: string) => Promise<unknown>;
  read?: (key: string) => Promise<unknown>;
  recover?: (key: string) => Promise<unknown>;
  recuperar?: (key: string) => Promise<unknown>;
  oracle?: (key: string) => Promise<unknown>;
  collapse?: (key: string) => Promise<unknown>;
  delete?: (key: string) => Promise<unknown>;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringifyPayload(payload: unknown): string {
  if (typeof payload === "string") return payload.normalize("NFC");
  return JSON.stringify(payload ?? {}).normalize("NFC");
}

function extractTextPayload(value: unknown): string {
  if (typeof value === "string") return value;
  const record = asRecord(value);
  const candidate = record.dato ?? record.data ?? record.payload ?? record.contenido ?? record.texto;
  if (typeof candidate === "string") return candidate;
  return JSON.stringify(record);
}

async function callInject(storage: DynamicStorage, key: string, payload: string): Promise<unknown> {
  const fn = storage.inject ?? storage.write ?? storage.memorizar ?? storage.inyectar;
  if (!fn) throw new Error("El storage IA no expone metodo de inyeccion compatible.");
  return fn.call(storage, key, payload);
}

async function callRecover(storage: DynamicStorage, key: string): Promise<unknown> {
  const fn = storage.read ?? storage.recover ?? storage.recuperar ?? storage.oracle;
  if (!fn) throw new Error("El storage IA no expone metodo de recuperacion compatible.");
  return fn.call(storage, key);
}

async function callDelete(storage: DynamicStorage, key: string): Promise<unknown> {
  const fn = storage.collapse ?? storage.delete;
  if (!fn) throw new Error("El storage IA no expone metodo de borrado compatible.");
  return fn.call(storage, key);
}

export function createTBitLocalToolExecutor(storage: unknown) {
  const dynamicStorage = storage as DynamicStorage;

  return async (toolName: string, args: Record<string, unknown>): Promise<unknown> => {
    if (toolName === "memorizar_en_vacio") {
      const key = normalizeTBitKey(String(args.key ?? ""));
      if (!key) throw new Error("memorizar_en_vacio requiere key.");
      const payload = stringifyPayload(args.payload);
      await assertAiPermission("write", { key, payloadBytes: Buffer.byteLength(payload, "utf8") });
      const result = await callInject(dynamicStorage, key, payload);
      await indexExternalMemoryRecord({
        key,
        userId: typeof args.userId === "string" ? args.userId : "ai",
        text: payload,
        payload: args.payload,
        tags: Array.isArray(args.tags) ? args.tags.filter((tag): tag is string => typeof tag === "string") : ["ai"],
        links: Array.isArray(args.links) ? args.links.filter((link): link is string => typeof link === "string") : [],
        source: "ai-direct",
      });
      return result;
    }

    if (toolName === "consultar_oraculo") {
      const key = normalizeTBitKey(String(args.key ?? ""));
      if (!key) throw new Error("consultar_oraculo requiere key.");
      await assertAiPermission("read", { key });
      return callRecover(dynamicStorage, key);
    }

    if (toolName === "buscar_indice_tbit") {
      await assertAiPermission("search");
      return searchQueryIndex({
        query: typeof args.query === "string" ? args.query : undefined,
        userId: typeof args.userId === "string" ? args.userId : undefined,
        source: typeof args.source === "string" ? args.source : undefined,
        tags: Array.isArray(args.tags) ? args.tags.filter((tag): tag is string => typeof tag === "string") : undefined,
        attribute: typeof args.attribute === "string" ? args.attribute : undefined,
        value: typeof args.value === "string" ? args.value : undefined,
        limit: typeof args.limit === "number" ? args.limit : undefined,
      });
    }

    if (toolName === "investigar_web") {
      await assertAiPermission("search");
      const url = typeof args.url === "string" ? args.url : "";
      if (!url.trim()) throw new Error("investigar_web requiere url.");
      return researchWebPage({
        url,
        query: typeof args.query === "string" ? args.query : undefined,
        mode: "assisted",
        maxTextChars: typeof args.maxTextChars === "number" ? args.maxTextChars : 12000,
      });
    }

    if (toolName === "resolver_ecuacion") {
      const key = normalizeTBitKey(String(args.key ?? ""));
      if (!key) throw new Error("resolver_ecuacion requiere key.");
      await assertAiPermission("compute", { key });
      await assertAiPermission("read", { key });
      const recovered = await callRecover(dynamicStorage, key);
      const equation = JSON.parse(extractTextPayload(recovered));
      const variables = asRecord(args.variables) as Record<string, number>;
      return evaluateEquation(equation, variables);
    }

    if (toolName === "operar_simbolicamente") {
      await assertAiPermission("compute", { key: typeof args.key === "string" ? args.key : undefined });
      return operarSimbolicamente(storage as never, {
        key: typeof args.key === "string" ? args.key : undefined,
        text: typeof args.text === "string" ? args.text : undefined,
        operation: args.operation as never,
        variable: typeof args.variable === "string" ? args.variable : undefined,
      });
    }

    if (toolName === "eliminar_memoria") {
      const key = normalizeTBitKey(String(args.key ?? ""));
      if (!key) throw new Error("eliminar_memoria requiere key.");
      await assertAiPermission("delete", { key, confirmed: args.confirmacion_humana === true });
      const result = await callDelete(dynamicStorage, key);
      await removeMemoryIndexRecord(key);
      return result;
    }

    throw new Error(`Herramienta T-BIT no soportada: ${toolName}`);
  };
}
