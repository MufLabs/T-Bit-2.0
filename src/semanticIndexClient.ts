import { buildTBitApiHeaders } from "./tbitApiHeaders";

const API_BASE_URL = import.meta.env.VITE_TBIT_API_BASE_URL?.trim() || "http://localhost:3000";

export type SemanticSearchBody = {
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

async function parseJsonResponse<T>(response: Response): Promise<T & { error?: string }> {
  const text = await response.text();
  try {
    return JSON.parse(text) as T & { error?: string };
  } catch {
    throw new Error(`La API Semantic Index no devolvio JSON. URL: ${response.url}`);
  }
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: buildTBitApiHeaders(true),
    body: JSON.stringify(body),
  });
  const payload = await parseJsonResponse<T>(response);
  if (!response.ok) throw new Error(payload.error ?? "Fallo en Semantic Index.");
  return payload;
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "GET",
    headers: buildTBitApiHeaders(),
  });
  const payload = await parseJsonResponse<T>(response);
  if (!response.ok) throw new Error(payload.error ?? "Fallo en Semantic Index.");
  return payload;
}

export const semanticIndexClient = {
  stats() {
    return getJson("/api/semantic/stats");
  },
  rebuild() {
    return postJson<{
      ok: boolean;
      index: { builtAt: string; totalRecords: number; model: string; dimensions: number };
    }>("/api/semantic/rebuild", {});
  },
  search(body: SemanticSearchBody) {
    return postJson<{
      ok: boolean;
      index: { builtAt: string; totalRecords: number; model: string; dimensions: number };
      results: SemanticSearchResult[];
    }>("/api/semantic/search", body);
  },
};
