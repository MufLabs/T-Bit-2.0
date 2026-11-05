import { buildTBitApiHeaders } from "./tbitApiHeaders";

const API_BASE_URL = import.meta.env.VITE_TBIT_API_BASE_URL?.trim() || "http://localhost:3000";

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: buildTBitApiHeaders(true),
    body: JSON.stringify(body),
  });
  const payload = await parseJsonResponse<T>(response);
  if (!response.ok) throw new Error(payload.error ?? "Fallo en Markdown Bridge.");
  return payload;
}

async function deleteJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "DELETE",
    headers: buildTBitApiHeaders(true),
    body: JSON.stringify(body),
  });
  const payload = await parseJsonResponse<T>(response);
  if (!response.ok) throw new Error(payload.error ?? "Fallo en Markdown Bridge.");
  return payload;
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "GET",
    headers: buildTBitApiHeaders(),
  });
  const payload = await parseJsonResponse<T>(response);
  if (!response.ok) throw new Error(payload.error ?? "Fallo en Markdown Bridge.");
  return payload;
}

async function parseJsonResponse<T>(response: Response): Promise<T & { error?: string }> {
  const text = await response.text();

  try {
    return JSON.parse(text) as T & { error?: string };
  } catch {
    const target = response.url || API_BASE_URL;
    throw new Error(
      `La API no devolvio JSON. Verifica que Express este activo y que VITE_TBIT_API_BASE_URL apunte a la API correcta. URL: ${target}`,
    );
  }
}

export const markdownBridgeClient = {
  preview(body: { userId: string; filename: string; content: string; key?: string }) {
    return postJson("/api/markdown/preview", body);
  },
  import(body: { userId: string; filename: string; content: string; key?: string }) {
    return postJson("/api/markdown/import", body);
  },
  reconstruct(key: string) {
    return postJson("/api/markdown/reconstruct", { key });
  },
  delete(key: string) {
    return deleteJson("/api/markdown/delete", { key });
  },
  purgeOrphans(userId?: string) {
    return postJson("/api/markdown/purge-orphans", { userId });
  },
  list(userId?: string) {
    const query = userId?.trim() ? `?userId=${encodeURIComponent(userId.trim())}` : "";
    return getJson(`/api/markdown/list${query}`);
  },
};
