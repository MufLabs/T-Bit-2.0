import { buildTBitApiHeaders } from "./tbitApiHeaders";

const API_BASE_URL = import.meta.env.VITE_TBIT_API_BASE_URL ?? "http://localhost:3000";

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

export const webResearchClient = {
  async research(input: {
    url: string;
    query?: string;
    maxBytes?: number;
    maxTextChars?: number;
    maxLinks?: number;
  }): Promise<WebResearchResult> {
    const response = await fetch(`${API_BASE_URL}/api/web/research`, {
      method: "POST",
      headers: buildTBitApiHeaders(true),
      body: JSON.stringify(input),
    });
    const payload = (await response.json()) as { ok?: boolean; result?: WebResearchResult; error?: string };
    if (!response.ok || !payload.result) {
      throw new Error(payload.error ?? "Fallo ejecutando T-BIT Web Research Tool.");
    }
    return payload.result;
  },
};
