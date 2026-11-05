import { buildTBitApiHeaders } from "./tbitApiHeaders";

const API_BASE_URL = import.meta.env.VITE_TBIT_API_BASE_URL?.trim() || "http://localhost:3000";

export type QueryIndexSearchBody = {
  query?: string;
  userId?: string;
  source?: string;
  tags?: string[];
  document?: string;
  attribute?: string;
  value?: string;
  limit?: number;
};

export type QueryIndexSearchResult = {
  key: string;
  title: string;
  filename?: string;
  userId: string;
  source: string;
  tags: string[];
  score: number;
  updatedAt: string;
  textPreview: string;
  matchedBy: string[];
};

async function parseJsonResponse<T>(response: Response): Promise<T & { error?: string }> {
  const text = await response.text();
  try {
    return JSON.parse(text) as T & { error?: string };
  } catch {
    throw new Error(`La API Query Index no devolvio JSON. URL: ${response.url}`);
  }
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: buildTBitApiHeaders(true),
    body: JSON.stringify(body),
  });
  const payload = await parseJsonResponse<T>(response);
  if (!response.ok) throw new Error(payload.error ?? "Fallo en Query Index.");
  return payload;
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "GET",
    headers: buildTBitApiHeaders(),
  });
  const payload = await parseJsonResponse<T>(response);
  if (!response.ok) throw new Error(payload.error ?? "Fallo en Query Index.");
  return payload;
}

export const queryIndexClient = {
  stats() {
    return getJson("/api/query/stats");
  },
  rebuild() {
    return postJson("/api/query/rebuild", {});
  },
  search(body: QueryIndexSearchBody) {
    return postJson("/api/query/search", body);
  },
};
