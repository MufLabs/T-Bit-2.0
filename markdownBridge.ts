import { deleteAsset, listAssets, registerAsset } from "./assetManager";
import { deleteMemoryRecordsBatch, recallMemory, rememberMemory, rememberMemoryBatch } from "./memoryCore";

export type MarkdownImportRequest = {
  userId: string;
  filename: string;
  content: string;
  key?: string;
};

export type MarkdownImportResult = {
  key: string;
  title: string;
  tags: string[];
  links: string[];
  source: "markdown";
  chunked: boolean;
  chunkCount: number;
  originalBytes: number;
  record: unknown;
};

export type MarkdownDeleteResult = {
  key: string;
  deletedKeys: string[];
  collapsedCount: number;
  indexRemovedCount: number;
  warnings: string[];
};

export type MarkdownPurgeResult = {
  userId?: string;
  purgedKeys: string[];
  collapsedCount: number;
  indexRemovedCount: number;
  warnings: string[];
};

export type MarkdownDocumentListItem = {
  key: string;
  userId: string;
  title: string;
  filename?: string;
  chunked: boolean;
  chunkCount: number;
  originalBytes?: number;
  updatedAt: string;
};

const LINK_PATTERN = /\[\[([^\]]+)\]\]/g;
const MAX_MARKDOWN_RECORD_BYTES = 12 * 1024;
const CHUNK_KEY_PATTERN = /::chunk_\d+$/i;
const CHUNK_SOURCES = new Set(["markdown-chunk", "binary-chunk"]);

function slug(value: string): string {
  return value
    .normalize("NFC")
    .trim()
    .replace(/\.[^.]+$/, "")
    .replace(/[^\p{L}\p{N}_:-]+/gu, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

function parseFrontmatter(content: string): { frontmatter: Record<string, unknown>; body: string } {
  const normalized = content.normalize("NFC");
  if (!normalized.startsWith("---")) return { frontmatter: {}, body: normalized };
  const end = normalized.indexOf("\n---", 3);
  if (end === -1) return { frontmatter: {}, body: normalized };

  const raw = normalized.slice(3, end).trim();
  const body = normalized.slice(end + 4).replace(/^\r?\n/, "");
  const frontmatter: Record<string, unknown> = {};

  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^([\w-]+):\s*(.*)$/);
    if (!match) continue;
    const key = match[1];
    const value = match[2].trim();
    if (value.startsWith("[") && value.endsWith("]")) {
      frontmatter[key] = value
        .slice(1, -1)
        .split(",")
        .map((item) => item.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);
    } else {
      frontmatter[key] = value.replace(/^["']|["']$/g, "");
    }
  }

  return { frontmatter, body };
}

function extractTitle(body: string, filename: string, frontmatter: Record<string, unknown>): string {
  if (typeof frontmatter.title === "string" && frontmatter.title.trim()) return frontmatter.title.trim();
  const heading = body.match(/^#\s+(.+)$/m);
  if (heading?.[1]) return heading[1].trim();
  return slug(filename) || "NotaMarkdown";
}

function extractTags(body: string, frontmatter: Record<string, unknown>): string[] {
  const tags = new Set<string>();
  const frontTags = frontmatter.tags;
  if (Array.isArray(frontTags)) {
    for (const tag of frontTags) if (typeof tag === "string" && tag.trim()) tags.add(slug(tag.toLowerCase()));
  }
  if (typeof frontTags === "string") {
    for (const tag of frontTags.split(/[,\s]+/)) if (tag.trim()) tags.add(slug(tag.replace(/^#/, "").toLowerCase()));
  }
  for (const match of body.matchAll(/#([\p{L}\p{N}_-]+)/gu)) tags.add(slug(match[1].toLowerCase()));
  return [...tags];
}

function extractLinks(content: string): string[] {
  const links = new Set<string>();
  for (const match of content.matchAll(LINK_PATTERN)) {
    const raw = match[1]?.split("|")[0]?.trim();
    if (raw) links.add(raw);
  }
  return [...links];
}

export function parseMarkdownDocument(request: MarkdownImportRequest) {
  const { frontmatter, body } = parseFrontmatter(request.content);
  const title = extractTitle(body, request.filename, frontmatter);
  const tags = extractTags(body, frontmatter);
  const links = extractLinks(request.content);
  const key = request.key || `Markdown::${slug(request.userId)}::${slug(title)}`;

  return {
    key,
    title,
    tags,
    links,
    body,
    frontmatter,
    fullText: request.content.normalize("NFC"),
  };
}

export async function importMarkdownDocument(
  storage: unknown,
  request: MarkdownImportRequest,
): Promise<MarkdownImportResult> {
  const parsed = parseMarkdownDocument(request);
  const originalBytes = Buffer.byteLength(parsed.fullText, "utf8");

  if (originalBytes > MAX_MARKDOWN_RECORD_BYTES) {
    return importChunkedMarkdownDocument(storage, request, parsed, originalBytes);
  }

  const record = await rememberMemory(storage, {
    userId: request.userId,
    key: parsed.key,
    text: parsed.fullText,
    payload: {
      title: parsed.title,
      body: parsed.body,
      frontmatter: parsed.frontmatter,
      filename: request.filename,
    },
    tags: parsed.tags,
    links: parsed.links,
    source: "markdown",
    domain: "Markdown",
    collection: "Notas",
  });

  await registerAsset({
    rootKey: parsed.key,
    userId: request.userId,
    type: "markdown",
    title: parsed.title,
    filename: request.filename,
    dependencies: [],
    bytes: originalBytes,
  });

  return {
    key: parsed.key,
    title: parsed.title,
    tags: parsed.tags,
    links: parsed.links,
    source: "markdown",
    chunked: false,
    chunkCount: 1,
    originalBytes,
    record,
  };
}

export async function reconstructMarkdownDocument(storage: unknown, manifestKey: string): Promise<{
  key: string;
  content: string;
  chunkCount: number;
}> {
  const manifest = await recallMemory(storage, manifestKey);
  const raw = JSON.parse(manifest.rawPayload) as {
    data?: { chunks?: string[]; chunkCount?: number };
  };
  const chunkKeys = Array.isArray(raw.data?.chunks)
    ? raw.data.chunks
    : Array.from({ length: Number(raw.data?.chunkCount ?? 0) }, (_, index) => buildMarkdownChunkKey(manifestKey, index));
  const chunks: string[] = [];

  for (const chunkKey of chunkKeys) {
    const chunk = await recallMemory(storage, chunkKey);
    const chunkRaw = JSON.parse(chunk.rawPayload) as {
      data?: { content?: string };
      text?: string;
    };
    chunks.push(chunkRaw.data?.content ?? chunkRaw.text ?? "");
  }

  return {
    key: manifestKey,
    content: chunks.join(""),
    chunkCount: chunkKeys.length,
  };
}

export async function deleteMarkdownDocument(storage: unknown, manifestKey: string): Promise<MarkdownDeleteResult> {
  try {
    const result = await deleteAsset(storage, manifestKey);
    return {
      key: result.rootKey,
      deletedKeys: result.deletedKeys,
      collapsedCount: result.collapsedCount,
      indexRemovedCount: result.indexRemovedCount,
      warnings: result.warnings,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (!message.includes("Asset no encontrado")) throw error;
  }

  const manifest = await recallMemory(storage, manifestKey);
  let chunkKeys: string[] = [];

  try {
    const raw = JSON.parse(manifest.rawPayload) as {
      data?: { chunks?: string[] };
    };
    chunkKeys = Array.isArray(raw.data?.chunks)
      ? raw.data.chunks.filter((key): key is string => typeof key === "string" && key.trim().length > 0)
      : [];
  } catch {
    chunkKeys = [];
  }

  const indexedPayload = manifest.payload as Record<string, unknown>;
  if (Array.isArray(indexedPayload.chunks)) {
    for (const key of indexedPayload.chunks) {
      if (typeof key === "string" && key.trim()) chunkKeys.push(key);
    }
  }

  const { getMemoryGraph } = await import("./memoryCore");
  const graph = await getMemoryGraph(manifest.userId !== "unknown" ? manifest.userId : undefined);
  const indexedChunkKeys = graph.nodes
    .map((node) => node.key)
    .filter((key) => key.startsWith(`${manifest.key}::chunk_`));
  chunkKeys.push(...indexedChunkKeys);

  const keysToDelete = [...new Set([...chunkKeys, manifest.key])];
  const deletedKeys: string[] = [];
  const warnings: string[] = [];
  let collapsedCount = 0;
  let indexRemovedCount = 0;

  const batchResults = await deleteMemoryRecordsBatch(storage, keysToDelete);
  for (const result of batchResults) {
    deletedKeys.push(result.key);
    if (result.collapsed) collapsedCount += 1;
    if (result.removedFromIndex) indexRemovedCount += 1;
    if (result.warning) warnings.push(`${result.key}: ${result.warning}`);
  }

  return {
    key: manifest.key,
    deletedKeys,
    collapsedCount,
    indexRemovedCount,
    warnings,
  };
}

export async function purgeOrphanMarkdownChunks(storage: unknown, userId?: string): Promise<MarkdownPurgeResult> {
  const { getMemoryGraph } = await import("./memoryCore");
  const graph = await getMemoryGraph(userId);
  const nodeKeys = new Set(graph.nodes.map((node) => node.key));
  const activeAssetRoots = new Set((await listAssets(userId)).map((asset) => asset.rootKey));
  const orphanChunks = graph.nodes.filter((node) => {
    if (!CHUNK_KEY_PATTERN.test(node.key)) return false;
    if (!CHUNK_SOURCES.has(node.source) && !node.tags.includes("chunk")) return false;
    const parentKey = node.key.replace(CHUNK_KEY_PATTERN, "");
    if (parentKey === node.key) return false;
    if (!nodeKeys.has(parentKey)) return true;
    return node.source === "binary-chunk" && !activeAssetRoots.has(parentKey);
  });
  const orphanBinaryRoots = graph.nodes.filter((node) => {
    if (node.source !== "binary") return false;
    return !activeAssetRoots.has(node.key);
  });

  const purgedKeys: string[] = [];
  const warnings: string[] = [];
  let collapsedCount = 0;
  let indexRemovedCount = 0;

  const batchResults = await deleteMemoryRecordsBatch(storage, [
    ...orphanChunks.map((chunk) => chunk.key),
    ...orphanBinaryRoots.map((root) => root.key),
  ]);
  for (const result of batchResults) {
    purgedKeys.push(result.key);
    if (result.collapsed) collapsedCount += 1;
    if (result.removedFromIndex) indexRemovedCount += 1;
    if (result.warning) warnings.push(`${result.key}: ${result.warning}`);
  }

  return {
    userId,
    purgedKeys,
    collapsedCount,
    indexRemovedCount,
    warnings,
  };
}

export async function listMarkdownDocuments(userId?: string): Promise<MarkdownDocumentListItem[]> {
  const { getMemoryGraph, recallMemory } = await import("./memoryCore");
  const graph = await getMemoryGraph(userId);
  const docs: MarkdownDocumentListItem[] = [];

  for (const node of graph.nodes) {
    if (node.source !== "markdown") continue;
    if (node.key.includes("::chunk_")) continue;

    let title = node.key.split("::").slice(-1)[0] ?? node.key;
    let filename: string | undefined;
    let chunked = false;
    let chunkCount = 1;
    let originalBytes: number | undefined;

    try {
      const record = await recallMemory({ read: async () => "" }, node.key);
      const payload = record.payload as Record<string, unknown>;
      if (typeof payload.title === "string" && payload.title.trim()) title = payload.title;
      if (typeof payload.filename === "string" && payload.filename.trim()) filename = payload.filename;
      if (payload.type === "CHUNKED_MARKDOWN_DOCUMENT") chunked = true;
      if (typeof payload.chunkCount === "number") chunkCount = payload.chunkCount;
      if (typeof payload.originalBytes === "number") originalBytes = payload.originalBytes;
    } catch {
      // Index metadata is enough for listing even when the physical read is unavailable.
    }

    docs.push({
      key: node.key,
      userId: node.userId,
      title,
      filename,
      chunked,
      chunkCount,
      originalBytes,
      updatedAt: node.updatedAt,
    });
  }

  return docs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function chunkTextByBytes(text: string, maxBytes: number): string[] {
  const chunks: string[] = [];
  let current = "";

  for (const char of text) {
    const next = current + char;
    if (Buffer.byteLength(next, "utf8") > maxBytes && current) {
      chunks.push(current);
      current = char;
    } else {
      current = next;
    }
  }

  if (current) chunks.push(current);
  return chunks;
}

function buildMarkdownChunkKey(rootKey: string, index: number): string {
  return `${rootKey}::chunk_${String(index + 1).padStart(4, "0")}`;
}

async function importChunkedMarkdownDocument(
  storage: unknown,
  request: MarkdownImportRequest,
  parsed: ReturnType<typeof parseMarkdownDocument>,
  originalBytes: number,
): Promise<MarkdownImportResult> {
  const chunks = chunkTextByBytes(parsed.fullText, MAX_MARKDOWN_RECORD_BYTES);
  const chunkKeys: string[] = [];
  const chunkRequests = chunks.map((chunk, index) => {
    const chunkKey = buildMarkdownChunkKey(parsed.key, index);
    chunkKeys.push(chunkKey);

    return {
      userId: request.userId,
      key: chunkKey,
      text: chunk,
      payload: {
        type: "MARKDOWN_CHUNK",
        parentKey: parsed.key,
        chunkIndex: index,
        chunkCount: chunks.length,
        content: chunk,
      },
      tags: ["chunk", ...parsed.tags],
      links: [],
      source: "markdown-chunk",
      domain: "Markdown",
      collection: "Chunks",
    };
  });

  const manifestText = [
    `# ${parsed.title}`,
    "",
    `Documento Markdown importado en ${chunks.length} fragmentos T-BIT.`,
    "",
    ...parsed.links.map((link) => `Relacionado con [[${link}]].`),
  ].join("\n");

  let record: Awaited<ReturnType<typeof rememberMemoryBatch>>[number];
  try {
    [record] = await rememberMemoryBatch(storage, [
      ...chunkRequests,
      {
      userId: request.userId,
      key: parsed.key,
      text: manifestText,
      payload: {
        type: "CHUNKED_MARKDOWN_DOCUMENT",
        title: parsed.title,
        filename: request.filename,
        frontmatter: parsed.frontmatter,
        originalBytes,
        chunkCount: chunks.length,
        chunkKeyPattern: `${parsed.key}::chunk_0001..${String(chunks.length).padStart(4, "0")}`,
        preview: parsed.body.slice(0, 2000),
      },
      tags: parsed.tags,
      links: parsed.links,
      source: "markdown",
      domain: "Markdown",
      collection: "Notas",
      },
    ]).then((records) => [records[records.length - 1]]);
  } catch (error) {
    await deleteMemoryRecordsBatch(storage, [parsed.key, ...chunkKeys]).catch(() => []);
    throw error;
  }

  await registerAsset({
    rootKey: parsed.key,
    userId: request.userId,
    type: "markdown",
    title: parsed.title,
    filename: request.filename,
    dependencies: chunkKeys,
    bytes: originalBytes,
  });

  return {
    key: parsed.key,
    title: parsed.title,
    tags: parsed.tags,
    links: parsed.links,
    source: "markdown",
    chunked: true,
    chunkCount: chunks.length,
    originalBytes,
    record,
  };
}
