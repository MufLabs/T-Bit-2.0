import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";
import readXlsxFile from "read-excel-file/node";

export type ExtractedOfficeDocument = {
  kind: "pdf" | "docx" | "xlsx";
  title: string;
  text: string;
  tags: string[];
  pageCount?: number;
  sheetCount?: number;
};

function titleFromFilename(filename: string): string {
  return filename
    .normalize("NFC")
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim() || "Documento";
}

function extensionOf(filename: string): string {
  return filename.toLowerCase().match(/\.[^.]+$/)?.[0] ?? "";
}

function isPdf(filename: string, mimeType?: string): boolean {
  return extensionOf(filename) === ".pdf" || (mimeType ?? "").toLowerCase() === "application/pdf";
}

function isDocx(filename: string, mimeType?: string): boolean {
  const normalizedMime = (mimeType ?? "").toLowerCase();
  return extensionOf(filename) === ".docx"
    || normalizedMime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
}

function isXlsx(filename: string, mimeType?: string): boolean {
  const normalizedMime = (mimeType ?? "").toLowerCase();
  return extensionOf(filename) === ".xlsx"
    || normalizedMime.includes("spreadsheet")
    || normalizedMime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
}

function cleanText(text: string): string {
  return text
    .normalize("NFC")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

function escapeMarkdownCell(value: unknown): string {
  return String(value ?? "")
    .replace(/\r?\n/g, " ")
    .replace(/\|/g, "\\|")
    .trim();
}

function sheetRowsToMarkdown(rows: unknown[][]): string {
  const visibleRows = rows
    .map((row) => row.map(escapeMarkdownCell))
    .filter((row) => row.some(Boolean));

  if (visibleRows.length === 0) return "";

  const width = Math.min(12, Math.max(...visibleRows.map((row) => row.length)));
  const normalized = visibleRows.map((row) => Array.from({ length: width }, (_, index) => row[index] ?? ""));
  const [first, ...rest] = normalized;
  const header = first.some(Boolean) ? first : Array.from({ length: width }, (_, index) => `Columna ${index + 1}`);
  const separator = Array.from({ length: width }, () => "---");
  const body = rest.length > 0 ? rest : normalized.slice(1);

  return [
    `| ${header.join(" | ")} |`,
    `| ${separator.join(" | ")} |`,
    ...body.map((row) => `| ${row.join(" | ")} |`),
  ].join("\n");
}

export async function extractOfficeDocument(request: {
  filename: string;
  mimeType?: string;
  contentBase64: string;
}): Promise<ExtractedOfficeDocument | null> {
  const buffer = Buffer.from(request.contentBase64, "base64");
  const title = titleFromFilename(request.filename);

  if (isDocx(request.filename, request.mimeType)) {
    const result = await mammoth.extractRawText({ buffer });
    const text = cleanText(result.value);
    if (!text) return null;
    return {
      kind: "docx",
      title,
      text: `# ${title}\n\n${text}`,
      tags: ["docx", "documento"],
    };
  }

  if (isPdf(request.filename, request.mimeType)) {
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      const text = cleanText(result.text ?? "");
      if (!text) return null;
      return {
        kind: "pdf",
        title,
        text: `# ${title}\n\n${text}`,
        tags: ["pdf", "documento"],
        pageCount: typeof result.total === "number" ? result.total : undefined,
      };
    } finally {
      await parser.destroy();
    }
  }

  if (isXlsx(request.filename, request.mimeType)) {
    const sheets = await readXlsxFile(buffer);
    const sections: string[] = [`# ${title}`];

    for (const sheet of sheets) {
      const table = sheetRowsToMarkdown(sheet.data);
      if (table) {
        sections.push(`\n## Hoja: ${sheet.sheet}\n\n${table}`);
      }
    }

    const text = cleanText(sections.join("\n\n"));
    if (!text || sections.length === 1) return null;
    return {
      kind: "xlsx",
      title,
      text,
      tags: ["xlsx", "excel", "tabla", "documento"],
      sheetCount: sheets.length,
    };
  }

  return null;
}
