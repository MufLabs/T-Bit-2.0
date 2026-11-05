import { buildTBitApiHeaders } from "./tbitApiHeaders";

const API_BASE_URL = import.meta.env.VITE_TBIT_API_BASE_URL?.trim() || "http://localhost:3000";

export type DocumentAskBody = {
  query: string;
  userId?: string;
  document?: string;
  key?: string;
  limit?: number;
};

export type DocumentAskResponse = {
  ok: boolean;
  answer: string;
  documentKey?: string;
  title?: string;
  filename?: string;
  matchedMode: "numbered-item" | "ordinal-item" | "heading" | "semantic-snippet" | "not-found";
  chunksRead: number;
  citations: Array<{ label: string; text: string }>;
  error?: string;
};

async function parseJsonResponse<T>(response: Response): Promise<T & { error?: string }> {
  const text = await response.text();
  try {
    return JSON.parse(text) as T & { error?: string };
  } catch {
    throw new Error(`La API Document Q&A no devolvio JSON. URL: ${response.url}`);
  }
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: buildTBitApiHeaders(true),
    body: JSON.stringify(body),
  });
  const payload = await parseJsonResponse<T>(response);
  if (!response.ok) throw new Error(payload.error ?? "Fallo en Document Q&A.");
  return payload;
}

export const documentQaClient = {
  ask(body: DocumentAskBody) {
    return postJson<DocumentAskResponse>("/api/document/ask", body);
  },
};
