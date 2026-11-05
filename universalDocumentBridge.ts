import { deleteBinaryAsset, importBinaryAsset, BinaryAssetImportResult } from "./binaryAssetBridge";
import {
  buildCodeMarkdownDocument,
  CodeGraphSummary,
  isSourceCodeFile,
  summarizeCodeGraph,
} from "./codeGraphExtractor";
import { importMarkdownDocument, MarkdownImportResult } from "./markdownBridge";
import { extractOfficeDocument, ExtractedOfficeDocument } from "./documentExtractors";

export type UniversalDocumentImportRequest = {
  userId: string;
  filename: string;
  mimeType?: string;
  contentBase64: string;
  key?: string;
  semanticMode?: "auto" | "inline" | "deferred" | "skip";
  analyzeCode?: boolean;
  showCodeGraphRelations?: boolean;
};

export type UniversalDocumentImportResult = {
  key: string;
  visibleKind: "document" | "asset";
  extractionMode: "text" | "binary";
  title: string;
  filename: string;
  mimeType: string;
  searchable: boolean;
  chunked: boolean;
  chunkCount: number;
  originalBytes: number;
  internalKeys: string[];
  note: string;
  semanticStatus?: "completed" | "deferred" | "not_applicable";
  codeGraph?: CodeGraphSummary;
  markdown?: MarkdownImportResult;
  binary?: BinaryAssetImportResult;
};

const MAX_UNIVERSAL_IMPORT_BYTES = 16 * 1024 * 1024;
const INLINE_SEMANTIC_EXTRACTION_LIMIT_BYTES = 2 * 1024 * 1024;

const TEXT_EXTENSIONS = new Set([
  ".md",
  ".markdown",
  ".txt",
  ".json",
  ".csv",
  ".log",
  ".xml",
  ".yaml",
  ".yml",
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".py",
  ".java",
  ".cs",
  ".go",
  ".rs",
  ".php",
  ".rb",
  ".c",
  ".cpp",
  ".h",
  ".hpp",
  ".html",
  ".css",
  ".scss",
]);

function extensionOf(filename: string): string {
  const match = filename.toLowerCase().match(/\.[^.]+$/);
  return match?.[0] ?? "";
}

function isTextualFile(filename: string, mimeType?: string): boolean {
  const ext = extensionOf(filename);
  const normalizedMime = (mimeType ?? "").toLowerCase();
  if (TEXT_EXTENSIONS.has(ext)) return true;
  if (ext) return false;
  if (normalizedMime.startsWith("text/")) return true;
  if (normalizedMime === "application/json") return true;
  if (normalizedMime.includes("xml")) return true;
  return false;
}

function decodeUtf8(base64: string): string {
  return Buffer.from(base64, "base64").toString("utf8").normalize("NFC");
}

function internalKeysFromMarkdown(result: MarkdownImportResult): string[] {
  if (!result.chunked) return [];
  const keys: string[] = [];
  for (let index = 0; index < result.chunkCount; index += 1) {
    keys.push(`${result.key}::chunk_${String(index + 1).padStart(4, "0")}`);
  }
  return keys;
}

function buildExtractedMarkdownContent(extracted: ExtractedOfficeDocument, assetKey: string): string {
  const metadata = [
    "---",
    `title: ${extracted.title}`,
    `tags: [${extracted.tags.join(", ")}]`,
    `source_asset: ${assetKey}`,
    `extraction_kind: ${extracted.kind}`,
    "---",
    "",
    `Relacionado con [[${assetKey}]].`,
    "",
  ];

  if (typeof extracted.pageCount === "number") metadata.push(`Paginas detectadas: ${extracted.pageCount}.`, "");
  if (typeof extracted.sheetCount === "number") metadata.push(`Hojas detectadas: ${extracted.sheetCount}.`, "");

  return [...metadata, extracted.text].join("\n");
}

export async function importUniversalDocument(
  storage: unknown,
  request: UniversalDocumentImportRequest,
): Promise<UniversalDocumentImportResult> {
  const mimeType = request.mimeType?.trim() || "application/octet-stream";
  const originalBytes = Buffer.from(request.contentBase64, "base64").length;
  const semanticMode = request.semanticMode ?? "auto";

  if (originalBytes > MAX_UNIVERSAL_IMPORT_BYTES) {
    throw new Error(
      `Archivo demasiado grande para importacion JSON local (${Math.round(originalBytes / (1024 * 1024))} MB). ` +
      "Usa un archivo menor o espera la capa de streaming nativo.",
    );
  }

  const shouldAttemptInlineExtraction = semanticMode === "inline"
    || (semanticMode === "auto" && originalBytes <= INLINE_SEMANTIC_EXTRACTION_LIMIT_BYTES);

  const extracted = shouldAttemptInlineExtraction
    ? await extractOfficeDocument({
      filename: request.filename,
      mimeType,
      contentBase64: request.contentBase64,
    })
    : null;

  if (extracted) {
    let binary: BinaryAssetImportResult | undefined;
    try {
      binary = await importBinaryAsset(storage, {
        userId: request.userId,
        filename: request.filename,
        mimeType,
        contentBase64: request.contentBase64,
      });
      const content = buildExtractedMarkdownContent(extracted, binary.key);
      const markdown = await importMarkdownDocument(storage, {
        userId: request.userId,
        filename: request.filename,
        content,
        key: request.key,
      });

      return {
        key: markdown.key,
        visibleKind: "document",
        extractionMode: "text",
        title: markdown.title,
        filename: request.filename,
        mimeType,
        searchable: true,
        chunked: markdown.chunked,
        chunkCount: markdown.chunkCount,
        originalBytes: markdown.originalBytes,
        internalKeys: [...new Set([binary.key, ...binary.chunks, ...internalKeysFromMarkdown(markdown)])],
        note: `Archivo ${extracted.kind.toUpperCase()} preservado como asset y convertido en documento consultable.`,
        semanticStatus: "completed",
        markdown,
        binary,
      };
    } catch (error) {
      if (binary) await deleteBinaryAsset(storage, binary.key).catch(() => undefined);
      throw error;
    }
  }

  if (isTextualFile(request.filename, mimeType)) {
    const rawContent = decodeUtf8(request.contentBase64);
    const shouldAnalyzeCode = request.analyzeCode !== false;
    const codeDocument = shouldAnalyzeCode && isSourceCodeFile(request.filename, mimeType)
      ? buildCodeMarkdownDocument({
        userId: request.userId,
        filename: request.filename,
        content: rawContent,
        includeTechnicalLinks: request.showCodeGraphRelations === true,
      })
      : null;
    const content = codeDocument?.content ?? rawContent;
    const markdown = await importMarkdownDocument(storage, {
      userId: request.userId,
      filename: request.filename,
      content,
      key: request.key,
    });

    return {
      key: markdown.key,
      visibleKind: "document",
      extractionMode: "text",
      title: markdown.title,
      filename: request.filename,
      mimeType,
      searchable: true,
      chunked: markdown.chunked,
      chunkCount: markdown.chunkCount,
      originalBytes: markdown.originalBytes,
      internalKeys: internalKeysFromMarkdown(markdown),
      note: codeDocument
        ? `Codigo fuente importado como documento consultable (${codeDocument.analysis.language}; imports: ${codeDocument.analysis.imports.length}; funciones: ${codeDocument.analysis.functions.length}; clases: ${codeDocument.analysis.classes.length}).`
        : markdown.chunked
        ? "Documento textual importado como nodo visible con fragmentos internos ocultos."
        : "Documento textual importado como nodo visible consultable.",
      semanticStatus: "completed",
      codeGraph: codeDocument ? summarizeCodeGraph(codeDocument.analysis) : undefined,
      markdown,
    };
  }

  const binary = await importBinaryAsset(storage, {
    userId: request.userId,
    filename: request.filename,
    mimeType,
    contentBase64: request.contentBase64,
    key: request.key,
  });

  return {
    key: binary.key,
    visibleKind: "asset",
    extractionMode: "binary",
    title: request.filename,
    filename: request.filename,
    mimeType,
    searchable: false,
    chunked: binary.chunkCount > 1,
    chunkCount: binary.chunkCount,
    originalBytes,
    internalKeys: binary.chunks,
    note: semanticMode === "skip" || !shouldAttemptInlineExtraction
      ? "Archivo preservado como asset verificable. La extraccion semantica quedo diferida para no bloquear la importacion."
      : "Archivo guardado como asset verificable. La extraccion semantica para este tipo queda pendiente para la siguiente capa.",
    semanticStatus: semanticMode === "skip" || !shouldAttemptInlineExtraction ? "deferred" : "not_applicable",
    binary,
  };
}
