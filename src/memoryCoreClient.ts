import { buildTBitApiHeaders } from "./tbitApiHeaders";

const API_BASE_URL = import.meta.env.VITE_TBIT_API_BASE_URL ?? "http://localhost:3000";

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: buildTBitApiHeaders(true),
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? "Fallo en Memory Core.");
  return payload;
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: buildTBitApiHeaders(),
  });
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? "Fallo en Memory Core.");
  return payload;
}

export const memoryCoreClient = {
  remember(body: {
    userId: string;
    text?: string;
    payload?: unknown;
    key?: string;
    domain?: string;
    collection?: string;
    tags?: string[];
    source?: string;
    links?: string[];
  }) {
    return postJson("/api/memory/remember", body);
  },
  recall(key: string) {
    return postJson("/api/memory/recall", { key });
  },
  context(userId: string, query: string, limit = 8) {
    return postJson("/api/memory/context", { userId, query, limit });
  },
  links(key: string) {
    return postJson("/api/memory/links", { key });
  },
  graph(userId?: string) {
    const query = userId ? `?userId=${encodeURIComponent(userId)}` : "";
    return getJson(`/api/memory/graph${query}`);
  },
  delete(key: string) {
    return postJson("/api/memory/delete", { key });
  },
};
