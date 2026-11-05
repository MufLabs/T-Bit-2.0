import { createHash } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import { dirname } from "path";
import { syncQueryIndexIncremental } from "./queryIndex";
import { resolveActiveTBitDataPath } from "./tbitRuntimePaths";
import { normalizeTBitKey } from "./textEncoding";

export type MemoryCoreRememberRequest = {
  userId: string;
  text?: string;
  payload?: unknown;
  key?: string;
  domain?: string;
  collection?: string;
  tags?: string[];
  source?: string;
  links?: string[];
};

export type MemoryCoreRecord = {
  key: string;
  userId: string;
  text: string;
  payload: unknown;
  checksum: string;
  tags: string[];
  links: string[];
  backlinks: string[];
  source: string;
  createdAt: string;
  updatedAt: string;
};

export type MemoryCoreContextResult = {
  userId: string;
  query: string;
  matches: MemoryCoreRecord[];
  backlinks: Array<{ key: string; linkedBy: string[] }>;
};

export type MemoryGraphNode = {
  key: string;
  userId: string;
  tags: string[];
  links: string[];
  backlinks: string[];
  source: string;
  checksum: string;
  updatedAt: string;
};

export type MemoryGraphLink = {
  sourceKey: string;
  targetKey: string;
  type: "quantum-link" | "backlink";
};

export type MemoryGraph = {
  nodes: MemoryGraphNode[];
  links: MemoryGraphLink[];
  tags: Record<string, string[]>;
};

type MemoryIndex = {
  version: "memory-core-v1";
  records: Record<string, MemoryCoreRecord>;
};

type DynamicStorage = {
  inject?: (key: string, payload: string) => Promise<unknown>;
  injectMany?: (records: Array<{ key: string; payload: string }>) => Promise<unknown>;
  write?: (key: string, payload: string) => Promise<unknown>;
  memorizar?: (key: string, payload: string) => Promise<unknown>;
  inyectar?: (key: string, payload: string) => Promise<unknown>;
  collapse?: (key: string) => Promise<unknown>;
  collapseMany?: (keys: string[]) => Promise<Array<{ key: string; collapsed: boolean; warning?: string }>>;
  destroy?: (key: string) => Promise<unknown>;
  colapsar?: (key: string) => Promise<unknown>;
  read?: (key: string) => Promise<unknown>;
  recover?: (key: string) => Promise<unknown>;
  recuperar?: (key: string) => Promise<unknown>;
  oracle?: (key: string) => Promise<unknown>;
};

function memoryIndexPath(): string {
  return resolveActiveTBitDataPath("memory-core-index.json");
}
const LINK_PATTERN = /\[\[([^\]]+)\]\]/g;

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function slug(value: string): string {
  return value
    .normalize("NFC")
    .trim()
    .replace(/[^\p{L}\p{N}_:-]+/gu, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function normalizePayload(payload: unknown): string {
  return typeof payload === "string" ? payload.normalize("NFC") : JSON.stringify(payload ?? {}).normalize("NFC");
}

function extractPayloadText(value: unknown): string {
  if (typeof value === "string") return value.normalize("NFC");
  const record = asRecord(value);
  const candidate = record.dato ?? record.data ?? record.payload ?? record.contenido ?? record.texto;
  if (typeof candidate === "string") return candidate.normalize("NFC");
  return JSON.stringify(record).normalize("NFC");
}

function extractQuantumLinks(text: string, explicitLinks: string[] = []): string[] {
  const links = new Set<string>();
  for (const link of explicitLinks) {
    if (link.trim()) links.add(normalizeTBitKey(link));
  }
  for (const match of text.matchAll(LINK_PATTERN)) {
    if (match[1]?.trim()) links.add(normalizeTBitKey(match[1]));
  }
  return [...links];
}

function inferTags(text: string, explicitTags: string[] = []): string[] {
  const tags = new Set(explicitTags.map((tag) => slug(tag.toLowerCase())).filter(Boolean));
  for (const match of text.matchAll(/#([\p{L}\p{N}_-]+)/gu)) {
    tags.add(slug(match[1].toLowerCase()));
  }
  return [...tags];
}

function inferKey(request: MemoryCoreRememberRequest, text: string): string {
  if (request.key) return normalizeTBitKey(request.key);
  const domain = slug(request.domain || "Usuario");
  const collection = slug(request.collection || "Memoria");
  const userId = slug(request.userId || "anonimo");
  const basis = slug(text.slice(0, 48)) || sha256(text).slice(0, 12);
  return `${domain}::${userId}::${collection}::${basis}`;
}

async function callRead(storage: DynamicStorage, key: string): Promise<unknown> {
  const fn = storage.read ?? storage.recover ?? storage.recuperar ?? storage.oracle;
  if (!fn) throw new Error("El storage no expone metodo de recuperacion compatible.");
  return fn.call(storage, key);
}

async function callWrite(storage: DynamicStorage, key: string, payload: string): Promise<unknown> {
  const fn = storage.inject ?? storage.write ?? storage.memorizar ?? storage.inyectar;
  if (!fn) throw new Error("El storage no expone metodo de escritura compatible.");
  return fn.call(storage, key, payload);
}

async function callWriteMany(storage: DynamicStorage, records: Array<{ key: string; payload: string }>): Promise<unknown> {
  if (storage.injectMany) return storage.injectMany.call(storage, records);
  return Promise.all(records.map((record) => callWrite(storage, record.key, record.payload)));
}

async function callCollapse(storage: DynamicStorage, key: string): Promise<unknown> {
  const fn = storage.collapse ?? storage.destroy ?? storage.colapsar;
  if (!fn) throw new Error("El storage no expone metodo de colapso compatible.");
  return fn.call(storage, key);
}

async function callCollapseMany(
  storage: DynamicStorage,
  keys: string[],
): Promise<Array<{ key: string; collapsed: boolean; warning?: string }>> {
  if (storage.collapseMany) return storage.collapseMany.call(storage, keys);

  const results: Array<{ key: string; collapsed: boolean; warning?: string }> = [];
  for (const key of keys) {
    try {
      await callCollapse(storage, key);
      results.push({ key, collapsed: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error desconocido";
      if (!message.includes("Clave no registrada")) throw error;
      results.push({ key, collapsed: false, warning: message });
    }
  }
  return results;
}

async function loadIndex(): Promise<MemoryIndex> {
  try {
    const text = await readFile(memoryIndexPath(), "utf8");
    const parsed = JSON.parse(text) as MemoryIndex;
    return { version: "memory-core-v1", records: parsed.records ?? {} };
  } catch {
    return { version: "memory-core-v1", records: {} };
  }
}

async function saveIndex(index: MemoryIndex): Promise<void> {
  const indexPath = memoryIndexPath();
  await mkdir(dirname(indexPath), { recursive: true });
  await writeFile(indexPath, JSON.stringify(index, null, 2), "utf8");
}

async function saveIndexAndSyncQuery(index: MemoryIndex): Promise<MemoryIndex> {
  const rebuilt = rebuildBacklinks(index);
  await saveIndex(rebuilt);
  await syncQueryIndexIncremental(rebuilt);
  return rebuilt;
}

function rebuildBacklinks(index: MemoryIndex): MemoryIndex {
  for (const record of Object.values(index.records)) record.backlinks = [];
  for (const record of Object.values(index.records)) {
    for (const link of record.links) {
      const target = index.records[link];
      if (target && !target.backlinks.includes(record.key)) target.backlinks.push(record.key);
    }
  }
  return index;
}

function prepareMemoryRecord(request: MemoryCoreRememberRequest, index: MemoryIndex): {
  key: string;
  payloadText: string;
  record: MemoryCoreRecord;
} {
  const text = (request.text ?? normalizePayload(request.payload)).normalize("NFC");
  const key = inferKey(request, text);
  const now = new Date().toISOString();
  const links = extractQuantumLinks(text, request.links);
  const tags = inferTags(text, request.tags);
  const payload = {
    _tbit_meta: {
      type: "MEMORY_CORE_RECORD",
      version: "1.0",
      userId: request.userId,
      source: request.source ?? "ai",
      tags,
      links,
      createdAt: now,
      updatedAt: now,
    },
    data: request.payload ?? { text },
    text,
  };
  const payloadText = JSON.stringify(payload);
  const checksum = sha256(payloadText);

  return {
    key,
    payloadText,
    record: {
      key,
      userId: request.userId,
      text,
      payload: payload.data,
      checksum,
      tags,
      links,
      backlinks: [],
      source: request.source ?? "ai",
      createdAt: index.records[key]?.createdAt ?? now,
      updatedAt: now,
    },
  };
}

export async function rememberMemory(storageLike: unknown, request: MemoryCoreRememberRequest): Promise<MemoryCoreRecord> {
  const storage = storageLike as DynamicStorage;
  const index = await loadIndex();
  const prepared = prepareMemoryRecord(request, index);

  await callWrite(storage, prepared.key, prepared.payloadText);

  index.records[prepared.key] = prepared.record;
  await saveIndexAndSyncQuery(index);
  return index.records[prepared.key];
}

export async function rememberMemoryBatch(
  storageLike: unknown,
  requests: MemoryCoreRememberRequest[],
): Promise<MemoryCoreRecord[]> {
  if (requests.length === 0) return [];

  const storage = storageLike as DynamicStorage;
  const index = await loadIndex();
  const prepared = requests.map((request) => prepareMemoryRecord(request, index));

  await callWriteMany(storage, prepared.map((item) => ({ key: item.key, payload: item.payloadText })));

  for (const item of prepared) {
    index.records[item.key] = item.record;
  }

  const saved = await saveIndexAndSyncQuery(index);
  return prepared.map((item) => saved.records[item.key]);
}

export async function indexExternalMemoryRecord(request: MemoryCoreRememberRequest & { key: string }): Promise<MemoryCoreRecord> {
  const text = (request.text ?? normalizePayload(request.payload)).normalize("NFC");
  const key = normalizeTBitKey(request.key);
  if (!key) throw new Error("indexExternalMemoryRecord requiere key.");

  const now = new Date().toISOString();
  const links = extractQuantumLinks(text, request.links);
  const tags = inferTags(text, request.tags);
  const payload = request.payload ?? { text };
  const checksum = sha256(normalizePayload(payload));
  const index = await loadIndex();

  index.records[key] = {
    key,
    userId: request.userId,
    text,
    payload,
    checksum,
    tags,
    links,
    backlinks: [],
    source: request.source ?? "external",
    createdAt: index.records[key]?.createdAt ?? now,
    updatedAt: now,
  };

  await saveIndexAndSyncQuery(index);
  return index.records[key];
}

export async function removeMemoryIndexRecord(keyInput: string): Promise<{ key: string; removedFromIndex: boolean }> {
  const key = normalizeTBitKey(keyInput);
  const index = await loadIndex();
  const removedFromIndex = Boolean(index.records[key]);

  if (removedFromIndex) {
    delete index.records[key];
    for (const record of Object.values(index.records)) {
      record.links = record.links.filter((link) => link !== key);
      record.backlinks = record.backlinks.filter((backlink) => backlink !== key);
    }
    await saveIndexAndSyncQuery(index);
  }

  return { key, removedFromIndex };
}

export async function recallMemory(storageLike: unknown, keyInput: string): Promise<MemoryCoreRecord & { rawPayload: string }> {
  const storage = storageLike as DynamicStorage;
  const key = normalizeTBitKey(keyInput);
  const rawPayload = extractPayloadText(await callRead(storage, key));
  const index = await loadIndex();
  const indexed = index.records[key];
  if (indexed) return { ...indexed, rawPayload };

  return {
    key,
    userId: "unknown",
    text: rawPayload,
    payload: rawPayload,
    checksum: sha256(rawPayload),
    tags: [],
    links: extractQuantumLinks(rawPayload),
    backlinks: [],
    source: "unknown",
    createdAt: "",
    updatedAt: "",
    rawPayload,
  };
}

export async function getMemoryContext(userId: string, queryInput: string, limit = 8): Promise<MemoryCoreContextResult> {
  const query = queryInput.normalize("NFC").toLowerCase();
  const tokens = query.split(/\s+/).filter((token) => token.length > 2);
  const index = rebuildBacklinks(await loadIndex());
  const scored = Object.values(index.records)
    .filter((record) => record.userId === userId)
    .map((record) => {
      const haystack = `${record.key} ${record.text} ${record.tags.join(" ")} ${record.links.join(" ")}`.toLowerCase();
      const score = tokens.reduce((sum, token) => sum + (haystack.includes(token) ? 1 : 0), 0);
      return { record, score };
    })
    .filter(({ score }) => score > 0 || tokens.length === 0)
    .sort((a, b) => b.score - a.score || b.record.updatedAt.localeCompare(a.record.updatedAt))
    .slice(0, limit)
    .map(({ record }) => record);

  return {
    userId,
    query: queryInput,
    matches: scored,
    backlinks: scored.map((record) => ({ key: record.key, linkedBy: record.backlinks })),
  };
}

export async function getMemoryLinks(keyInput: string): Promise<{ key: string; links: string[]; backlinks: string[] }> {
  const key = normalizeTBitKey(keyInput);
  const index = rebuildBacklinks(await loadIndex());
  const record = index.records[key];
  return {
    key,
    links: record?.links ?? [],
    backlinks: record?.backlinks ?? [],
  };
}

export async function deleteMemoryRecord(storageLike: unknown, keyInput: string): Promise<{
  key: string;
  collapsed: boolean;
  removedFromIndex: boolean;
  warning?: string;
}> {
  const storage = storageLike as DynamicStorage;
  const key = normalizeTBitKey(keyInput);
  const index = await loadIndex();
  let collapsed = false;
  let warning: string | undefined;

  try {
    await callCollapse(storage, key);
    collapsed = true;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";

    if (!message.includes("Clave no registrada")) {
      throw error;
    }

    warning = message;
  }

  const removedFromIndex = Boolean(index.records[key]);
  delete index.records[key];

  for (const record of Object.values(index.records)) {
    record.links = record.links.filter((link) => link !== key);
    record.backlinks = record.backlinks.filter((link) => link !== key);
  }

  await saveIndexAndSyncQuery(index);

  return {
    key,
    collapsed,
    removedFromIndex,
    warning,
  };
}

export async function deleteMemoryRecordsBatch(storageLike: unknown, keyInputs: string[]): Promise<Array<{
  key: string;
  collapsed: boolean;
  removedFromIndex: boolean;
  warning?: string;
}>> {
  const storage = storageLike as DynamicStorage;
  const keys = [...new Set(keyInputs.map((key) => normalizeTBitKey(key)).filter(Boolean))];
  const index = await loadIndex();
  const collapsedResults = await callCollapseMany(storage, keys);
  const collapsedByKey = new Map(collapsedResults.map((result) => [result.key, result]));
  const removedKeys = new Set<string>();
  const results: Array<{ key: string; collapsed: boolean; removedFromIndex: boolean; warning?: string }> = [];

  for (const key of keys) {
    const collapsed = collapsedByKey.get(key);
    const removedFromIndex = Boolean(index.records[key]);
    delete index.records[key];
    removedKeys.add(key);
    results.push({
      key,
      collapsed: Boolean(collapsed?.collapsed),
      removedFromIndex,
      warning: collapsed?.warning,
    });
  }

  for (const record of Object.values(index.records)) {
    record.links = record.links.filter((link) => !removedKeys.has(link));
    record.backlinks = record.backlinks.filter((link) => !removedKeys.has(link));
  }

  await saveIndexAndSyncQuery(index);
  return results;
}

export async function getMemoryGraph(userId?: string): Promise<MemoryGraph> {
  const index = rebuildBacklinks(await loadIndex());
  const records = Object.values(index.records).filter((record) => !userId || record.userId === userId);
  const visibleKeys = new Set(records.map((record) => record.key));
  const tags: Record<string, string[]> = {};
  const links: MemoryGraphLink[] = [];

  for (const record of records) {
    for (const tag of record.tags) {
      if (!tags[tag]) tags[tag] = [];
      tags[tag].push(record.key);
    }
    for (const targetKey of record.links) {
      links.push({ sourceKey: record.key, targetKey, type: "quantum-link" });
    }
    for (const sourceKey of record.backlinks) {
      if (visibleKeys.has(sourceKey)) {
        links.push({ sourceKey, targetKey: record.key, type: "backlink" });
      }
    }
  }

  const dedupedLinks = [
    ...new Map(links.map((link) => [`${link.sourceKey}->${link.targetKey}:${link.type}`, link])).values(),
  ];

  return {
    nodes: records.map((record) => ({
      key: record.key,
      userId: record.userId,
      tags: record.tags,
      links: record.links,
      backlinks: record.backlinks,
      source: record.source,
      checksum: record.checksum,
      updatedAt: record.updatedAt,
    })),
    links: dedupedLinks,
    tags,
  };
}
