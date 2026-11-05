import { createHash } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { getQueryIndex, QueryIndexEntry } from "./queryIndex";
import { resolveActiveTBitDataPath } from "./tbitRuntimePaths";

function semanticIndexPath(): string {
  return resolveActiveTBitDataPath("semantic-index.json");
}
const DEFAULT_DIMENSIONS = 192;
const DEFAULT_MODEL = "tbit-local-hash-embedding-v1";
const DEFAULT_OLLAMA_TIMEOUT_MS = 8000;

export type SemanticIndexEntry = {
  key: string;
  rootKey: string;
  userId: string;
  source: string;
  title: string;
  filename?: string;
  documentRoot?: string;
  tags: string[];
  updatedAt: string;
  textPreview: string;
  embedding: number[];
  point: [number, number, number];
};

export type TBitSemanticIndex = {
  version: "tbit-semantic-index-v1";
  builtAt: string;
  sourceFingerprint: string;
  model: string;
  dimensions: number;
  entries: Record<string, SemanticIndexEntry>;
};

export type SemanticSearchRequest = {
  query: string;
  userId?: string;
  source?: string;
  limit?: number;
};

export type SemanticSearchResult = {
  key: string;
  rootKey: string;
  title: string;
  filename?: string;
  userId: string;
  source: string;
  tags: string[];
  score: number;
  updatedAt: string;
  textPreview: string;
  matchedKeys: string[];
  point: [number, number, number];
};

function normalizeText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s:_-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hashToInt(value: string): number {
  return createHash("sha256").update(value, "utf8").digest().readUInt32BE(0);
}

function expandToken(token: string): string[] {
  const groups: string[][] = [
    ["marketing", "ventas", "publicidad", "comercial", "mercadeo", "growth", "seo", "campana", "campanas"],
    ["finanzas", "dinero", "ingresos", "pricing", "precio", "costos", "rentabilidad", "monetizacion"],
    ["mascotas", "pet", "pets", "perro", "gato", "veterinaria", "veterinario", "adopcion"],
    ["usuario", "cliente", "perfil", "persona", "account", "customer"],
    ["seguridad", "cifrado", "hmac", "aes", "integridad", "permisos"],
    ["documento", "nota", "markdown", "archivo", "file", "asset"],
  ];
  const found = groups.find((group) => group.includes(token));
  return found ? found : [token];
}

function tokenize(value: string): string[] {
  const base = normalizeText(value)
    .split(" ")
    .filter((token) => token.length > 2);
  const expanded = base.flatMap(expandToken);
  const grams: string[] = [];
  for (const token of base) {
    for (let size = 4; size <= Math.min(8, token.length); size += 1) {
      grams.push(`ng:${token.slice(0, size)}`);
    }
  }
  return [...expanded, ...grams];
}

function envPositiveNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeVector(vector: number[]): number[] {
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (!magnitude) return vector;
  return vector.map((value) => Number((value / magnitude).toFixed(8)));
}

function deterministicEmbedding(text: string, dimensions = DEFAULT_DIMENSIONS): number[] {
  const vector = Array.from({ length: dimensions }, () => 0);
  for (const token of tokenize(text)) {
    const hash = hashToInt(token);
    const index = hash % dimensions;
    const sign = hash & 1 ? 1 : -1;
    vector[index] += sign;
  }
  return normalizeVector(vector);
}

async function ollamaEmbedding(text: string): Promise<number[] | null> {
  if ((process.env.TBIT_EMBEDDING_PROVIDER ?? "").toLowerCase() !== "ollama") return null;
  const baseUrl = process.env.TBIT_EMBEDDING_BASE_URL ?? "http://localhost:11434";
  const model = process.env.TBIT_EMBEDDING_MODEL ?? "nomic-embed-text";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), envPositiveNumber(process.env.TBIT_EMBEDDING_TIMEOUT_MS, DEFAULT_OLLAMA_TIMEOUT_MS));
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ model, prompt: text }),
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const payload = await response.json() as { embedding?: number[] };
    return Array.isArray(payload.embedding) && payload.embedding.length > 0
      ? normalizeVector(payload.embedding)
      : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function createEmbedding(text: string): Promise<{ embedding: number[]; model: string; dimensions: number }> {
  const ollama = await ollamaEmbedding(text);
  if (ollama) {
    return {
      embedding: ollama,
      model: process.env.TBIT_EMBEDDING_MODEL ?? "nomic-embed-text",
      dimensions: ollama.length,
    };
  }
  const embedding = deterministicEmbedding(text);
  return { embedding, model: DEFAULT_MODEL, dimensions: embedding.length };
}

function cosineSimilarity(a: number[], b: number[]): number {
  const length = Math.min(a.length, b.length);
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let index = 0; index < length; index += 1) {
    dot += a[index] * b[index];
    magA += a[index] * a[index];
    magB += b[index] * b[index];
  }
  if (!magA || !magB) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

function semanticPoint(vector: number[]): [number, number, number] {
  let x = 0;
  let y = 0;
  let z = 0;
  for (let index = 0; index < vector.length; index += 1) {
    const value = vector[index];
    x += value * Math.sin((index + 1) * 1.618);
    y += value * Math.cos((index + 1) * 1.173);
    z += value * Math.sin((index + 1) * 0.713);
  }
  const magnitude = Math.sqrt(x * x + y * y + z * z) || 1;
  const scale = 8;
  return [
    Number(((x / magnitude) * scale).toFixed(3)),
    Number(((y / magnitude) * scale).toFixed(3)),
    Number(((z / magnitude) * scale).toFixed(3)),
  ];
}

function entryText(entry: QueryIndexEntry): string {
  return [
    entry.key,
    entry.title,
    entry.filename ?? "",
    entry.textPreview,
    entry.tags.join(" "),
    entry.links.join(" "),
    Object.values(entry.attributes).join(" "),
  ].join("\n");
}

function isChunkKey(key: string): boolean {
  return /::chunk_\d+$/i.test(key);
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function chooseCanonicalRootEntries(entries: SemanticIndexEntry[]): Map<string, SemanticIndexEntry> {
  const roots = new Map<string, SemanticIndexEntry>();

  for (const entry of entries) {
    const current = roots.get(entry.rootKey);
    if (!current) {
      roots.set(entry.rootKey, entry);
      continue;
    }

    const entryIsExactRoot = entry.key === entry.rootKey;
    const currentIsExactRoot = current.key === current.rootKey;
    if (entryIsExactRoot && !currentIsExactRoot) {
      roots.set(entry.rootKey, entry);
      continue;
    }

    const entryIsChunk = isChunkKey(entry.key);
    const currentIsChunk = isChunkKey(current.key);
    if (!entryIsChunk && currentIsChunk) {
      roots.set(entry.rootKey, entry);
    }
  }

  return roots;
}

function resultTitle(entry: SemanticIndexEntry): string {
  return entry.title?.trim() || entry.rootKey.split("::").slice(-1)[0] || entry.key;
}

async function loadSemanticIndex(): Promise<TBitSemanticIndex | null> {
  try {
    return JSON.parse(await readFile(semanticIndexPath(), "utf8")) as TBitSemanticIndex;
  } catch {
    return null;
  }
}

async function saveSemanticIndex(index: TBitSemanticIndex): Promise<void> {
  const indexPath = semanticIndexPath();
  await mkdir(path.dirname(indexPath), { recursive: true });
  await writeFile(indexPath, JSON.stringify(index, null, 2), "utf8");
}

export async function rebuildSemanticIndex(): Promise<TBitSemanticIndex> {
  const queryIndex = await getQueryIndex();
  const entries: Record<string, SemanticIndexEntry> = {};
  let model = DEFAULT_MODEL;
  let dimensions = DEFAULT_DIMENSIONS;

  for (const entry of Object.values(queryIndex.entries)) {
    const embeddingResult = await createEmbedding(entryText(entry));
    model = embeddingResult.model;
    dimensions = embeddingResult.dimensions;
    const rootKey = entry.documentRoot ?? entry.key;
    entries[entry.key] = {
      key: entry.key,
      rootKey,
      userId: entry.userId,
      source: entry.source,
      title: entry.title,
      filename: entry.filename,
      documentRoot: entry.documentRoot,
      tags: entry.tags,
      updatedAt: entry.updatedAt,
      textPreview: entry.textPreview,
      embedding: embeddingResult.embedding,
      point: semanticPoint(embeddingResult.embedding),
    };
  }

  const index: TBitSemanticIndex = {
    version: "tbit-semantic-index-v1",
    builtAt: new Date().toISOString(),
    sourceFingerprint: queryIndex.sourceFingerprint,
    model,
    dimensions,
    entries,
  };
  await saveSemanticIndex(index);
  return index;
}

export async function getSemanticIndex(): Promise<TBitSemanticIndex> {
  const queryIndex = await getQueryIndex();
  const current = await loadSemanticIndex();
  if (current && current.sourceFingerprint === queryIndex.sourceFingerprint) return current;
  return rebuildSemanticIndex();
}

export async function searchSemanticIndex(request: SemanticSearchRequest): Promise<{
  index: { builtAt: string; totalRecords: number; model: string; dimensions: number };
  results: SemanticSearchResult[];
}> {
  const query = request.query?.trim();
  if (!query) throw new Error("La busqueda semantica requiere query.");

  const index = await getSemanticIndex();
  const queryEmbedding = (await createEmbedding(query)).embedding;
  const limit = Math.max(1, Math.min(Number(request.limit ?? 8), 24));
  const grouped = new Map<string, SemanticSearchResult>();
  const allEntries = Object.values(index.entries);
  const canonicalByRoot = chooseCanonicalRootEntries(allEntries);

  for (const entry of allEntries) {
    if (request.userId && entry.userId !== request.userId) continue;
    if (request.source && entry.source !== request.source) continue;
    const score = cosineSimilarity(queryEmbedding, entry.embedding);
    if (score <= 0) continue;
    const roundedScore = Number(score.toFixed(4));
    const canonical = canonicalByRoot.get(entry.rootKey) ?? entry;
    const existing = grouped.get(entry.rootKey);
    if (!existing) {
      grouped.set(entry.rootKey, {
        key: entry.rootKey,
        rootKey: entry.rootKey,
        title: resultTitle(canonical),
        filename: canonical.filename ?? entry.filename,
        userId: canonical.userId,
        source: canonical.source,
        tags: uniqueStrings([...canonical.tags, ...entry.tags]),
        score: roundedScore,
        updatedAt: entry.updatedAt,
        textPreview: entry.textPreview,
        matchedKeys: [entry.key],
        point: canonical.point,
      });
      continue;
    }

    existing.matchedKeys = uniqueStrings([...existing.matchedKeys, entry.key]);
    existing.tags = uniqueStrings([...existing.tags, ...canonical.tags, ...entry.tags]);
    if (roundedScore > existing.score) {
      existing.score = roundedScore;
      existing.updatedAt = entry.updatedAt;
      existing.textPreview = entry.textPreview;
    }
  }

  const results = [...grouped.values()]
    .sort((a, b) => b.score - a.score || b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, limit);

  return {
    index: {
      builtAt: index.builtAt,
      totalRecords: Object.keys(index.entries).length,
      model: index.model,
      dimensions: index.dimensions,
    },
    results,
  };
}

export async function getSemanticIndexStats() {
  const index = await getSemanticIndex();
  return {
    builtAt: index.builtAt,
    totalRecords: Object.keys(index.entries).length,
    model: index.model,
    dimensions: index.dimensions,
  };
}
