import { createHash } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { resolveActiveTBitDataPath } from "./tbitRuntimePaths";

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

type MemoryIndex = {
  version: string;
  records: Record<string, MemoryCoreRecord>;
};

export type QueryIndexEntry = {
  key: string;
  userId: string;
  source: string;
  title: string;
  filename?: string;
  documentRoot?: string;
  fileType?: string;
  checksum: string;
  summary: string;
  chunkCount: number;
  originalBytes?: number;
  searchable: boolean;
  internalKeys: string[];
  tags: string[];
  links: string[];
  backlinks: string[];
  attributes: Record<string, string>;
  createdAt: string;
  updatedAt: string;
  textPreview: string;
};

export type TBitQueryIndex = {
  version: "tbit-query-index-v1";
  builtAt: string;
  sourceFingerprint: string;
  totalRecords: number;
  entries: Record<string, QueryIndexEntry>;
  byUser: Record<string, string[]>;
  bySource: Record<string, string[]>;
  byTag: Record<string, string[]>;
  byToken: Record<string, string[]>;
  byDocument: Record<string, string[]>;
  byDate: Record<string, string[]>;
  byAttribute: Record<string, string[]>;
};

export type QuerySearchRequest = {
  query?: string;
  userId?: string;
  source?: string;
  tags?: string[];
  document?: string;
  attribute?: string;
  value?: string;
  from?: string;
  to?: string;
  limit?: number;
};

export type QuerySearchResult = {
  key: string;
  title: string;
  filename?: string;
  documentRoot?: string;
  fileType?: string;
  checksum: string;
  summary: string;
  chunkCount: number;
  originalBytes?: number;
  searchable: boolean;
  userId: string;
  source: string;
  tags: string[];
  score: number;
  updatedAt: string;
  textPreview: string;
  matchedBy: string[];
};

function memoryIndexPath(): string {
  return resolveActiveTBitDataPath("memory-core-index.json");
}

function queryIndexPath(): string {
  return resolveActiveTBitDataPath("query-index.json");
}
const MAX_TOKEN_LENGTH = 48;

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function normalizeKey(value: string): string {
  return normalizeText(value).replace(/[^a-z0-9:_-]+/g, "_").replace(/^_+|_+$/g, "");
}

function tokenize(value: string): string[] {
  return [
    ...new Set(
      normalizeText(value)
        .split(/[^a-z0-9]+/g)
        .map((token) => token.trim())
        .filter((token) => token.length >= 2 && token.length <= MAX_TOKEN_LENGTH),
    ),
  ];
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

async function loadMemoryIndex(): Promise<MemoryIndex> {
  try {
    const text = await readFile(memoryIndexPath(), "utf8");
    const parsed = JSON.parse(text) as MemoryIndex;
    return { version: parsed.version ?? "memory-core-v1", records: parsed.records ?? {} };
  } catch {
    return { version: "memory-core-v1", records: {} };
  }
}

async function loadQueryIndex(): Promise<TBitQueryIndex | null> {
  try {
    return JSON.parse(await readFile(queryIndexPath(), "utf8")) as TBitQueryIndex;
  } catch {
    return null;
  }
}

async function saveQueryIndex(index: TBitQueryIndex): Promise<void> {
  const indexPath = queryIndexPath();
  await mkdir(path.dirname(indexPath), { recursive: true });
  await writeFile(indexPath, JSON.stringify(index, null, 2), "utf8");
}

function fingerprintMemoryIndex(memoryIndex: MemoryIndex): string {
  const basis = Object.values(memoryIndex.records)
    .map((record) => `${record.key}:${record.checksum}:${record.updatedAt}`)
    .sort()
    .join("|");
  return sha256(basis);
}

function addToIndex(index: Record<string, string[]>, bucket: string, key: string) {
  const normalizedBucket = normalizeKey(bucket);
  if (!normalizedBucket) return;
  if (!index[normalizedBucket]) index[normalizedBucket] = [];
  if (!index[normalizedBucket].includes(key)) index[normalizedBucket].push(key);
}

function createEmptyQueryIndex(memoryIndex: MemoryIndex, fingerprint: string): TBitQueryIndex {
  return {
    version: "tbit-query-index-v1",
    builtAt: new Date().toISOString(),
    sourceFingerprint: fingerprint,
    totalRecords: Object.keys(memoryIndex.records).length,
    entries: {},
    byUser: {},
    bySource: {},
    byTag: {},
    byToken: {},
    byDocument: {},
    byDate: {},
    byAttribute: {},
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function flattenPayload(value: unknown, prefix = "", output: Record<string, string> = {}): Record<string, string> {
  if (value === null || value === undefined) return output;

  if (Array.isArray(value)) {
    output[prefix || "value"] = value.map((item) => (typeof item === "object" ? JSON.stringify(item) : String(item))).join(" ");
    return output;
  }

  if (typeof value === "object") {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const nextPrefix = prefix ? `${prefix}.${key}` : key;
      flattenPayload(child, nextPrefix, output);
    }
    return output;
  }

  output[prefix || "value"] = String(value);
  return output;
}

function inferDocumentRoot(record: MemoryCoreRecord): string | undefined {
  if (record.source === "markdown-chunk") return record.key.replace(/::chunk_\d+$/i, "");
  if (record.source === "markdown") return record.key;
  if (record.source === "binary-chunk") return record.key.replace(/::chunk_\d+$/i, "");
  if (record.source === "binary") return record.key;
  return undefined;
}

function buildEntry(record: MemoryCoreRecord): QueryIndexEntry {
  const payload = asRecord(record.payload);
  const type = typeof payload.type === "string" ? payload.type : undefined;
  const title = typeof payload.title === "string" && payload.title.trim()
    ? payload.title
    : record.key.split("::").slice(-1)[0] ?? record.key;
  const filename = typeof payload.filename === "string" ? payload.filename : undefined;
  const chunkCount = typeof payload.chunkCount === "number"
    ? payload.chunkCount
    : record.source.includes("chunk") ? 1 : 0;
  const originalBytes = typeof payload.originalBytes === "number" ? payload.originalBytes : undefined;
  const internalKeys = Array.isArray(payload.chunks)
    ? payload.chunks.filter((value): value is string => typeof value === "string")
    : [];
  const summary = typeof payload.preview === "string" && payload.preview.trim()
    ? payload.preview.slice(0, 520)
    : record.text.slice(0, 520);
  const fileType = typeof payload.mimeType === "string"
    ? payload.mimeType
    : filename?.split(".").slice(-1)[0]?.toLowerCase() || type || record.source;
  const searchable = record.source === "markdown" || record.source === "markdown-chunk";

  return {
    key: record.key,
    userId: record.userId,
    source: record.source,
    title,
    filename,
    documentRoot: inferDocumentRoot(record),
    fileType,
    checksum: record.checksum,
    summary,
    chunkCount,
    originalBytes,
    searchable,
    internalKeys,
    tags: record.tags,
    links: record.links,
    backlinks: record.backlinks,
    attributes: flattenPayload(record.payload),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    textPreview: record.text.slice(0, 260),
  };
}

function addEntryToQueryIndex(queryIndex: TBitQueryIndex, entry: QueryIndexEntry): void {
  queryIndex.entries[entry.key] = entry;

  addToIndex(queryIndex.byUser, entry.userId, entry.key);
  addToIndex(queryIndex.bySource, entry.source, entry.key);
  if (entry.documentRoot) addToIndex(queryIndex.byDocument, entry.documentRoot, entry.key);
  if (entry.updatedAt) addToIndex(queryIndex.byDate, entry.updatedAt.slice(0, 10), entry.key);
  for (const tag of entry.tags) addToIndex(queryIndex.byTag, tag, entry.key);

  const tokenText = [
    entry.key,
    entry.title,
    entry.filename ?? "",
    entry.fileType ?? "",
    entry.summary,
    entry.textPreview,
    entry.tags.join(" "),
    entry.links.join(" "),
    Object.values(entry.attributes).join(" "),
  ].join(" ");
  for (const token of tokenize(tokenText)) addToIndex(queryIndex.byToken, token, entry.key);
  for (const [attribute, value] of Object.entries(entry.attributes)) {
    addToIndex(queryIndex.byAttribute, attribute, entry.key);
    for (const token of tokenize(`${attribute} ${value}`)) addToIndex(queryIndex.byToken, token, entry.key);
  }
}

function removeEntryFromQueryIndex(queryIndex: TBitQueryIndex, key: string): void {
  delete queryIndex.entries[key];

  for (const secondary of [
    queryIndex.byUser,
    queryIndex.bySource,
    queryIndex.byTag,
    queryIndex.byToken,
    queryIndex.byDocument,
    queryIndex.byDate,
    queryIndex.byAttribute,
  ]) {
    for (const [bucket, keys] of Object.entries(secondary)) {
      const nextKeys = keys.filter((candidate) => candidate !== key);
      if (nextKeys.length === 0) {
        delete secondary[bucket];
      } else {
        secondary[bucket] = nextKeys;
      }
    }
  }
}

function rebuildSecondaryIndexes(queryIndex: TBitQueryIndex): TBitQueryIndex {
  const entries = Object.values(queryIndex.entries);
  queryIndex.byUser = {};
  queryIndex.bySource = {};
  queryIndex.byTag = {};
  queryIndex.byToken = {};
  queryIndex.byDocument = {};
  queryIndex.byDate = {};
  queryIndex.byAttribute = {};

  for (const entry of entries) {
    addEntryToQueryIndex(queryIndex, entry);
  }

  return queryIndex;
}

function buildQueryIndexFromMemoryIndex(memoryIndex: MemoryIndex): TBitQueryIndex {
  const fingerprint = fingerprintMemoryIndex(memoryIndex);
  const queryIndex = createEmptyQueryIndex(memoryIndex, fingerprint);

  for (const record of Object.values(memoryIndex.records)) {
    const entry = buildEntry(record);
    addEntryToQueryIndex(queryIndex, entry);
  }

  return queryIndex;
}

export async function rebuildQueryIndex(): Promise<TBitQueryIndex> {
  const memoryIndex = await loadMemoryIndex();
  const queryIndex = buildQueryIndexFromMemoryIndex(memoryIndex);
  await saveQueryIndex(queryIndex);
  return queryIndex;
}

export async function syncQueryIndexIncremental(memoryIndexInput?: MemoryIndex): Promise<TBitQueryIndex> {
  const memoryIndex = memoryIndexInput ?? await loadMemoryIndex();
  const fingerprint = fingerprintMemoryIndex(memoryIndex);
  const current = await loadQueryIndex();

  if (!current) {
    const queryIndex = buildQueryIndexFromMemoryIndex(memoryIndex);
    await saveQueryIndex(queryIndex);
    return queryIndex;
  }

  if (current.sourceFingerprint === fingerprint) return current;

  const activeKeys = new Set(Object.keys(memoryIndex.records));

  for (const key of Object.keys(current.entries)) {
    if (!activeKeys.has(key)) removeEntryFromQueryIndex(current, key);
  }

  for (const record of Object.values(memoryIndex.records)) {
    const nextEntry = buildEntry(record);
    const previousEntry = current.entries[record.key];

    if (JSON.stringify(previousEntry) !== JSON.stringify(nextEntry)) {
      removeEntryFromQueryIndex(current, record.key);
      current.entries[record.key] = nextEntry;
    }
  }

  current.builtAt = new Date().toISOString();
  current.sourceFingerprint = fingerprint;
  current.totalRecords = activeKeys.size;
  rebuildSecondaryIndexes(current);
  await saveQueryIndex(current);
  return current;
}

export async function getQueryIndex(): Promise<TBitQueryIndex> {
  const memoryIndex = await loadMemoryIndex();
  const fingerprint = fingerprintMemoryIndex(memoryIndex);
  const current = await loadQueryIndex();
  if (current?.sourceFingerprint === fingerprint) return current;
  return syncQueryIndexIncremental(memoryIndex);
}

function intersect(base: Set<string> | null, keys: string[]): Set<string> {
  const next = new Set(keys);
  if (!base) return next;
  return new Set([...base].filter((key) => next.has(key)));
}

function collectTokenMatchesFromTokens(
  index: TBitQueryIndex,
  tokens: string[],
  hitsByKey?: Map<string, Set<string>>,
): Set<string> {
  const result = new Set<string>();
  for (const token of tokens) {
    for (const key of index.byToken[token] ?? []) {
      result.add(key);
      if (hitsByKey) {
        const hits = hitsByKey.get(key) ?? new Set<string>();
        hits.add(token);
        hitsByKey.set(key, hits);
      }
    }
  }
  return result;
}

function collectTokenMatches(index: TBitQueryIndex, query: string): Set<string> {
  return collectTokenMatchesFromTokens(index, tokenize(query));
}

export async function searchQueryIndex(request: QuerySearchRequest): Promise<{
  index: { builtAt: string; totalRecords: number };
  results: QuerySearchResult[];
}> {
  const index = await getQueryIndex();
  const limit = Math.max(1, Math.min(request.limit ?? 20, 100));
  let candidates: Set<string> | null = null;
  const matchedByBase: Record<string, string[]> = {};
  const queryTokens = request.query?.trim() ? tokenize(request.query) : [];
  const queryTokenHits = new Map<string, Set<string>>();

  function mark(keys: Iterable<string>, reason: string) {
    for (const key of keys) {
      if (!matchedByBase[key]) matchedByBase[key] = [];
      if (!matchedByBase[key].includes(reason)) matchedByBase[key].push(reason);
    }
  }

  if (request.userId?.trim()) {
    const keys = index.byUser[normalizeKey(request.userId)] ?? [];
    candidates = intersect(candidates, keys);
    mark(keys, "usuario");
  }

  if (request.source?.trim()) {
    const keys = index.bySource[normalizeKey(request.source)] ?? [];
    candidates = intersect(candidates, keys);
    mark(keys, "tipo");
  }

  for (const tag of request.tags ?? []) {
    const keys = index.byTag[normalizeKey(tag)] ?? [];
    candidates = intersect(candidates, keys);
    mark(keys, `tag:${tag}`);
  }

  if (request.document?.trim()) {
    const documentTokens = collectTokenMatches(index, request.document);
    const docKeys = [...documentTokens].filter((key) => {
      const entry = index.entries[key];
      return entry?.documentRoot || entry?.source === "markdown";
    });
    candidates = intersect(candidates, docKeys);
    mark(docKeys, "documento");
  }

  if (request.attribute?.trim()) {
    const attributeKey = normalizeKey(request.attribute);
    const direct = index.byAttribute[attributeKey] ?? [];
    const fuzzy = Object.keys(index.byAttribute)
      .filter((key) => key.includes(attributeKey))
      .flatMap((key) => index.byAttribute[key]);
    const keys = [...new Set([...direct, ...fuzzy])];
    candidates = intersect(candidates, keys);
    mark(keys, `atributo:${request.attribute}`);
  }

  if (queryTokens.length > 0) {
    const keys = [...collectTokenMatchesFromTokens(index, queryTokens, queryTokenHits)];
    candidates = intersect(candidates, keys);
    mark(keys, "texto");
  }

  if (!candidates) candidates = new Set(Object.keys(index.entries));

  const fromTime = request.from ? Date.parse(request.from) : Number.NaN;
  const toTime = request.to ? Date.parse(request.to) : Number.NaN;
  const valueNeedle = request.value ? normalizeText(request.value) : "";

  const results = [...candidates]
    .map((key) => index.entries[key])
    .filter(Boolean)
    .filter((entry) => {
      const updated = Date.parse(entry.updatedAt || entry.createdAt || "");
      if (!Number.isNaN(fromTime) && updated < fromTime) return false;
      if (!Number.isNaN(toTime) && updated > toTime) return false;
      if (valueNeedle) {
        const haystack = normalizeText(`${entry.textPreview} ${Object.values(entry.attributes).join(" ")}`);
        if (!haystack.includes(valueNeedle)) return false;
      }
      return true;
    })
    .map((entry) => {
      const matchedBy = matchedByBase[entry.key] ?? [];
      const queryScore = queryTokenHits.get(entry.key)?.size ?? 0;
      const score = matchedBy.length * 10 + queryScore * 3 + entry.links.length + entry.backlinks.length;
      return {
        key: entry.key,
        title: entry.title,
        filename: entry.filename,
        documentRoot: entry.documentRoot,
        fileType: entry.fileType,
        checksum: entry.checksum,
        summary: entry.summary,
        chunkCount: entry.chunkCount,
        originalBytes: entry.originalBytes,
        searchable: entry.searchable,
        userId: entry.userId,
        source: entry.source,
        tags: entry.tags,
        score,
        updatedAt: entry.updatedAt,
        textPreview: entry.textPreview,
        matchedBy,
      };
    })
    .sort((a, b) => b.score - a.score || b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, limit);

  return {
    index: { builtAt: index.builtAt, totalRecords: index.totalRecords },
    results,
  };
}

export async function getQueryIndexStats() {
  const index = await getQueryIndex();
  return {
    builtAt: index.builtAt,
    totalRecords: index.totalRecords,
    users: Object.keys(index.byUser).length,
    sources: Object.keys(index.bySource).length,
    tags: Object.keys(index.byTag).length,
    tokens: Object.keys(index.byToken).length,
    documents: Object.keys(index.byDocument).length,
    attributes: Object.keys(index.byAttribute).length,
  };
}
