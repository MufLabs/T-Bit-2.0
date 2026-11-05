import { createHash } from "crypto";

export type WebResearchMode = "manual" | "assisted" | "controlled";

export type WebResearchOptions = {
  url: string;
  query?: string;
  mode?: WebResearchMode;
  maxBytes?: number;
  maxTextChars?: number;
  maxLinks?: number;
};

export type WebResearchResult = {
  ok: boolean;
  url: string;
  fetchedAt: string;
  title: string;
  description?: string;
  headings: string[];
  text: string;
  links: Array<{ text: string; href: string }>;
  checksum: string;
  sourceBytes: number;
  extractedChars: number;
  truncated: boolean;
  safety: {
    rawHtmlSentToAi: false;
    scriptsRemoved: true;
    stylesRemoved: true;
    maxBytes: number;
    maxTextChars: number;
  };
};

const DEFAULT_MAX_BYTES = 750_000;
const DEFAULT_MAX_TEXT_CHARS = 12000;
const DEFAULT_MAX_LINKS = 24;
const USER_AGENT = "T-BIT-WebResearch/1.0 (+local-qvault)";

function assertHttpUrl(value: string): URL {
  const parsed = new URL(value.trim());
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Solo se permiten URLs http/https para investigacion web.");
  }
  return parsed;
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#(\d+);/g, (_match, code) => {
      const numeric = Number(code);
      return Number.isFinite(numeric) ? String.fromCharCode(numeric) : "";
    });
}

function compactWhitespace(value: string): string {
  return decodeHtmlEntities(value)
    .replace(/\r/g, "\n")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripNoise(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, " ")
    .replace(/<canvas\b[\s\S]*?<\/canvas>/gi, " ")
    .replace(/<iframe\b[\s\S]*?<\/iframe>/gi, " ")
    .replace(/<header\b[\s\S]*?<\/header>/gi, " ")
    .replace(/<footer\b[\s\S]*?<\/footer>/gi, " ")
    .replace(/<nav\b[\s\S]*?<\/nav>/gi, " ")
    .replace(/<form\b[\s\S]*?<\/form>/gi, " ");
}

function extractTagContent(html: string, pattern: RegExp): string {
  const match = html.match(pattern);
  return match?.[1] ? compactWhitespace(match[1].replace(/<[^>]+>/g, " ")) : "";
}

function extractMetaDescription(html: string): string | undefined {
  const patterns = [
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["'][^>]*>/i,
    /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["'][^>]*>/i,
  ];
  for (const pattern of patterns) {
    const value = extractTagContent(html, pattern);
    if (value) return value;
  }
  return undefined;
}

function extractHeadings(cleanHtml: string): string[] {
  const headings: string[] = [];
  const pattern = /<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(cleanHtml)) !== null) {
    const heading = compactWhitespace(match[1].replace(/<[^>]+>/g, " "));
    if (heading && !headings.includes(heading)) headings.push(heading);
    if (headings.length >= 18) break;
  }
  return headings;
}

function extractLinks(cleanHtml: string, baseUrl: URL, maxLinks: number): Array<{ text: string; href: string }> {
  const links: Array<{ text: string; href: string }> = [];
  const pattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(cleanHtml)) !== null) {
    const rawHref = match[1]?.trim();
    if (!rawHref || rawHref.startsWith("#") || /^javascript:/i.test(rawHref) || /^mailto:/i.test(rawHref)) continue;
    const text = compactWhitespace(match[2].replace(/<[^>]+>/g, " "));
    if (!text || text.length < 2) continue;
    try {
      const href = new URL(rawHref, baseUrl).toString();
      if (!links.some((link) => link.href === href)) links.push({ text: text.slice(0, 120), href });
    } catch {
      // Ignora URLs malformadas dentro del documento.
    }
    if (links.length >= maxLinks) break;
  }
  return links;
}

function extractMainText(cleanHtml: string, maxTextChars: number): { text: string; truncated: boolean } {
  const withBreaks = cleanHtml
    .replace(/<(h[1-6]|p|li|br|section|article|div)\b[^>]*>/gi, "\n")
    .replace(/<\/(h[1-6]|p|li|section|article|div)>/gi, "\n");
  const text = compactWhitespace(withBreaks.replace(/<[^>]+>/g, " "));
  return {
    text: text.slice(0, maxTextChars),
    truncated: text.length > maxTextChars,
  };
}

async function readLimitedResponse(response: Response, maxBytes: number): Promise<{ html: string; bytes: number; truncated: boolean }> {
  const arrayBuffer = await response.arrayBuffer();
  const bytes = arrayBuffer.byteLength;
  const limited = bytes > maxBytes ? arrayBuffer.slice(0, maxBytes) : arrayBuffer;
  return {
    html: new TextDecoder("utf-8", { fatal: false }).decode(limited),
    bytes,
    truncated: bytes > maxBytes,
  };
}

export async function researchWebPage(options: WebResearchOptions): Promise<WebResearchResult> {
  const parsedUrl = assertHttpUrl(options.url);
  const maxBytes = Math.min(2_000_000, Math.max(50_000, Math.round(options.maxBytes ?? DEFAULT_MAX_BYTES)));
  const maxTextChars = Math.min(40000, Math.max(2000, Math.round(options.maxTextChars ?? DEFAULT_MAX_TEXT_CHARS)));
  const maxLinks = Math.min(80, Math.max(0, Math.round(options.maxLinks ?? DEFAULT_MAX_LINKS)));

  const response = await fetch(parsedUrl.toString(), {
    redirect: "follow",
    headers: {
      "User-Agent": USER_AGENT,
      "Accept": "text/html,application/xhtml+xml,text/plain;q=0.8,*/*;q=0.2",
    },
  });

  if (!response.ok) {
    throw new Error(`La URL rechazo la investigacion: HTTP ${response.status}.`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType && !/(text\/html|application\/xhtml\+xml|text\/plain)/i.test(contentType)) {
    throw new Error(`Tipo de contenido no soportado para investigacion semantica: ${contentType}.`);
  }

  const limited = await readLimitedResponse(response, maxBytes);
  const cleanHtml = stripNoise(limited.html);
  const title = extractTagContent(cleanHtml, /<title\b[^>]*>([\s\S]*?)<\/title>/i) || parsedUrl.hostname;
  const description = extractMetaDescription(limited.html);
  const headings = extractHeadings(cleanHtml);
  const links = extractLinks(cleanHtml, parsedUrl, maxLinks);
  const mainText = extractMainText(cleanHtml, maxTextChars);
  const compactPayload = [
    `URL: ${parsedUrl.toString()}`,
    `Titulo: ${title}`,
    description ? `Descripcion: ${description}` : "",
    headings.length ? `Headings:\n- ${headings.join("\n- ")}` : "",
    `Contenido util:\n${mainText.text}`,
  ].filter(Boolean).join("\n\n");

  return {
    ok: true,
    url: parsedUrl.toString(),
    fetchedAt: new Date().toISOString(),
    title,
    description,
    headings,
    text: mainText.text,
    links,
    checksum: createHash("sha256").update(compactPayload, "utf8").digest("hex"),
    sourceBytes: limited.bytes,
    extractedChars: mainText.text.length,
    truncated: limited.truncated || mainText.truncated,
    safety: {
      rawHtmlSentToAi: false,
      scriptsRemoved: true,
      stylesRemoved: true,
      maxBytes,
      maxTextChars,
    },
  };
}

export function extractFirstUrlFromText(message: string): string | undefined {
  const match = message.match(/https?:\/\/[^\s"'<>]+|(?:www\.)[^\s"'<>]+/i);
  if (!match?.[0]) return undefined;
  return match[0].startsWith("www.") ? `https://${match[0]}` : match[0];
}

export function isWebResearchIntent(message: string): boolean {
  const normalized = message.toLowerCase();
  return Boolean(
    extractFirstUrlFromText(message)
    && /(url|web|sitio|pagina|página|analiza|revisa|diagnostica|audita|seo|velocidad|competencia|investiga|busca)/i.test(normalized),
  );
}

export function buildWebResearchPrompt(userMessage: string, result: WebResearchResult): string {
  return [
    userMessage,
    "",
    "=== CONTEXTO WEB FILTRADO POR T-BIT WEB RESEARCH TOOL ===",
    "No recibiste HTML crudo. Recibiste solo contenido semantico util, sin scripts, CSS, tracking, formularios ni navegacion repetitiva.",
    `URL: ${result.url}`,
    `Fecha de consulta: ${result.fetchedAt}`,
    `Titulo: ${result.title}`,
    result.description ? `Descripcion: ${result.description}` : "",
    result.headings.length ? `Headings principales:\n- ${result.headings.join("\n- ")}` : "",
    `Texto util extraido (${result.extractedChars} caracteres${result.truncated ? ", truncado por limite" : ""}):\n${result.text}`,
    result.links.length ? `Links relevantes:\n${result.links.map((link) => `- ${link.text}: ${link.href}`).join("\n")}` : "",
    "",
    "Instruccion: responde al usuario usando solo este contexto web y deja claro si falta evidencia para alguna conclusion.",
  ].filter(Boolean).join("\n");
}
