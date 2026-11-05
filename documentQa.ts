import { recallMemory } from "./memoryCore";
import { searchQueryIndex } from "./queryIndex";

type DynamicStorage = {
  read?: (key: string) => Promise<unknown>;
  recover?: (key: string) => Promise<unknown>;
  recuperar?: (key: string) => Promise<unknown>;
  oracle?: (key: string) => Promise<unknown>;
};

export type DocumentQuestionRequest = {
  query: string;
  userId?: string;
  document?: string;
  key?: string;
  limit?: number;
};

export type DocumentQuestionResult = {
  ok: boolean;
  answer: string;
  documentKey?: string;
  title?: string;
  filename?: string;
  matchedMode: "numbered-item" | "ordinal-item" | "heading" | "semantic-snippet" | "not-found";
  chunksRead: number;
  citations: Array<{ label: string; text: string }>;
};

type MarkdownPayload = {
  type?: string;
  title?: string;
  filename?: string;
  body?: string;
  chunks?: string[];
  content?: string;
};

type DocumentContent = {
  key: string;
  title: string;
  filename?: string;
  content: string;
  chunksRead: number;
};

type ParsedBlock = {
  label: string;
  text: string;
  kind: "numbered" | "bullet" | "heading" | "paragraph";
  number?: number;
};

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function extractPayload(rawPayload: string): MarkdownPayload {
  try {
    const raw = JSON.parse(rawPayload) as { data?: unknown; text?: string };
    return raw.data && typeof raw.data === "object" ? raw.data as MarkdownPayload : { body: raw.text ?? rawPayload };
  } catch {
    return { body: rawPayload };
  }
}

function inferDocumentHint(query: string): string | undefined {
  const normalized = query.normalize("NFC");
  const patterns = [
    /\b(?:del|de la|del archivo|del documento|de la nota)\s+["']?([^"'?]+?)(?:\?|$)/i,
    /\b(?:archivo|documento|nota)\s+["']?([^"'?]+?)(?:\?|$)/i,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    const value = match?.[1]?.trim().replace(/[.?!]+$/g, "");
    if (value && value.length >= 2) return value;
  }

  return undefined;
}

function extractRequestedItemNumber(query: string): number | undefined {
  const match = normalizeText(query).match(/\b(?:item|punto|numeral|apartado|seccion|seccion numero)\s*(\d+)\b/);
  const value = match?.[1] ? Number.parseInt(match[1], 10) : Number.NaN;
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

function extractImportantTerms(query: string): string[] {
  const stopwords = new Set([
    "cual", "cuál", "que", "qué", "es", "el", "la", "los", "las", "un", "una", "del", "de", "en",
    "archivo", "documento", "nota", "item", "punto", "numeral", "apartado", "seccion", "sección",
    "dime", "muestra", "busca", "consulta", "cuando", "como", "por", "para",
  ]);

  return [...new Set(
    normalizeText(query)
      .split(/[^a-z0-9]+/g)
      .map((term) => term.trim())
      .filter((term) => term.length >= 3 && !stopwords.has(term) && !/^\d+$/.test(term)),
  )];
}

function parseMarkdownBlocks(content: string): ParsedBlock[] {
  const blocks: ParsedBlock[] = [];
  const lines = content.normalize("NFC").split(/\r?\n/);
  let current: ParsedBlock | null = null;

  function flush() {
    if (!current) return;
    current.text = current.text.replace(/\s+\n/g, "\n").trim();
    if (current.text) blocks.push(current);
    current = null;
  }

  for (const line of lines) {
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    const numbered = line.match(/^\s*(\d+)[.)]\s+(.+)$/);
    const bullet = line.match(/^\s*[-*+]\s+(.+)$/);

    if (heading) {
      flush();
      current = { kind: "heading", label: heading[1], text: heading[2].trim() };
      flush();
      continue;
    }

    if (numbered) {
      flush();
      current = {
        kind: "numbered",
        label: `item ${numbered[1]}`,
        number: Number.parseInt(numbered[1], 10),
        text: numbered[2].trim(),
      };
      continue;
    }

    if (bullet) {
      flush();
      current = { kind: "bullet", label: `bullet ${blocks.length + 1}`, text: bullet[1].trim() };
      continue;
    }

    if (line.trim()) {
      if (!current) current = { kind: "paragraph", label: `parrafo ${blocks.length + 1}`, text: "" };
      current.text += `${current.text ? "\n" : ""}${line.trim()}`;
    } else {
      flush();
    }
  }

  flush();
  return blocks;
}

async function readMarkdownDocument(storage: DynamicStorage, key: string): Promise<DocumentContent> {
  const manifest = await recallMemory(storage, key);
  const payload = extractPayload(manifest.rawPayload);
  const indexedPayload = manifest.payload && typeof manifest.payload === "object"
    ? manifest.payload as Record<string, unknown>
    : {};
  const title = payload.title ?? String(indexedPayload.title ?? key.split("::").slice(-1)[0] ?? key);
  const filename = payload.filename;

  if (payload.type === "CHUNKED_MARKDOWN_DOCUMENT" && Array.isArray(payload.chunks)) {
    const chunks: string[] = [];
    for (const chunkKey of payload.chunks) {
      if (typeof chunkKey !== "string" || !chunkKey.trim()) continue;
      const chunk = await recallMemory(storage, chunkKey);
      const chunkPayload = extractPayload(chunk.rawPayload);
      chunks.push(chunkPayload.content ?? chunk.text ?? "");
    }

    return {
      key,
      title,
      filename,
      content: chunks.join(""),
      chunksRead: chunks.length,
    };
  }

  return {
    key,
    title,
    filename,
    content: payload.body ?? manifest.text ?? manifest.rawPayload,
    chunksRead: 1,
  };
}

async function readFocusedMarkdownChunks(
  storage: DynamicStorage,
  key: string,
  query: string,
  userId?: string,
  limit = 3,
): Promise<DocumentContent | null> {
  const result = await searchQueryIndex({
    query,
    userId,
    source: "markdown-chunk",
    limit: Math.max(1, Math.min(limit * 4, 20)),
  });
  const chunkEntries = result.results
    .filter((entry) => entry.documentRoot === key && entry.key.includes("::chunk_"))
    .slice(0, limit);

  if (chunkEntries.length === 0) return null;

  const manifest = await recallMemory(storage, key);
  const manifestPayload = extractPayload(manifest.rawPayload);
  const indexedPayload = manifest.payload && typeof manifest.payload === "object"
    ? manifest.payload as Record<string, unknown>
    : {};
  const title = manifestPayload.title ?? String(indexedPayload.title ?? key.split("::").slice(-1)[0] ?? key);
  const filename = manifestPayload.filename;
  const chunks: string[] = [];

  for (const entry of chunkEntries) {
    const chunk = await recallMemory(storage, entry.key);
    const chunkPayload = extractPayload(chunk.rawPayload);
    chunks.push(chunkPayload.content ?? chunk.text ?? "");
  }

  return {
    key,
    title,
    filename,
    content: chunks.join("\n\n"),
    chunksRead: chunks.length,
  };
}

async function resolveDocumentKey(request: DocumentQuestionRequest): Promise<string | undefined> {
  if (request.key?.trim()) return request.key.trim();

  const hint = request.document?.trim() || inferDocumentHint(request.query);
  const searchText = hint || request.query;
  const result = await searchQueryIndex({
    query: searchText,
    userId: request.userId,
    source: "markdown",
    limit: 8,
  });

  const directDoc = result.results.find((entry) => entry.source === "markdown" && !entry.key.includes("::chunk_"));
  if (directDoc) return directDoc.key;

  const chunk = result.results.find((entry) => entry.key.includes("::chunk_"));
  return chunk?.key.replace(/::chunk_\d+$/i, "");
}

function answerFromBlocks(query: string, document: DocumentContent): DocumentQuestionResult {
  const blocks = parseMarkdownBlocks(document.content);
  const requestedItem = extractRequestedItemNumber(query);

  if (requestedItem !== undefined) {
    const numbered = blocks.find((block) => block.kind === "numbered" && block.number === requestedItem);
    if (numbered) {
      return {
        ok: true,
        answer: numbered.text,
        documentKey: document.key,
        title: document.title,
        filename: document.filename,
        matchedMode: "numbered-item",
        chunksRead: document.chunksRead,
        citations: [{ label: numbered.label, text: numbered.text }],
      };
    }

    const listItems = blocks.filter((block) => block.kind === "numbered" || block.kind === "bullet");
    const ordinal = listItems[requestedItem - 1];
    if (ordinal) {
      return {
        ok: true,
        answer: ordinal.text,
        documentKey: document.key,
        title: document.title,
        filename: document.filename,
        matchedMode: "ordinal-item",
        chunksRead: document.chunksRead,
        citations: [{ label: ordinal.label, text: ordinal.text }],
      };
    }
  }

  const terms = extractImportantTerms(query);
  const scored = blocks
    .map((block) => {
      const haystack = normalizeText(`${block.label} ${block.text}`);
      const score = terms.reduce((sum, term) => sum + (haystack.includes(term) ? 1 : 0), 0);
      return { block, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.block.text.length - b.block.text.length);

  const best = scored[0]?.block;
  if (best) {
    return {
      ok: true,
      answer: best.text,
      documentKey: document.key,
      title: document.title,
      filename: document.filename,
      matchedMode: best.kind === "heading" ? "heading" : "semantic-snippet",
      chunksRead: document.chunksRead,
      citations: [{ label: best.label, text: best.text }],
    };
  }

  return {
    ok: false,
    answer: `No encontre una respuesta precisa dentro de ${document.filename || document.title}.`,
    documentKey: document.key,
    title: document.title,
    filename: document.filename,
    matchedMode: "not-found",
    chunksRead: document.chunksRead,
    citations: [],
  };
}

export async function answerDocumentQuestion(
  storageLike: unknown,
  request: DocumentQuestionRequest,
): Promise<DocumentQuestionResult> {
  const query = request.query?.normalize("NFC").trim();
  if (!query) {
    return {
      ok: false,
      answer: "La pregunta documental esta vacia.",
      matchedMode: "not-found",
      chunksRead: 0,
      citations: [],
    };
  }

  const storage = storageLike as DynamicStorage;
  const documentKey = await resolveDocumentKey({ ...request, query });
  if (!documentKey) {
    return {
      ok: false,
      answer: "No encontre un documento Markdown relacionado con la pregunta.",
      matchedMode: "not-found",
      chunksRead: 0,
      citations: [],
    };
  }

  const requestedItem = extractRequestedItemNumber(query);
  const document = requestedItem === undefined
    ? (await readFocusedMarkdownChunks(storage, documentKey, query, request.userId, request.limit ?? 3))
      ?? await readMarkdownDocument(storage, documentKey)
    : await readMarkdownDocument(storage, documentKey);
  return answerFromBlocks(query, document);
}
