import { buildTBitApiHeaders } from "./tbitApiHeaders";

const API_BASE_URL = import.meta.env.VITE_TBIT_API_BASE_URL?.trim() || "http://localhost:3000";

export type TBitAssetRecord = {
  assetKey: string;
  rootKey: string;
  userId: string;
  type: string;
  title: string;
  filename?: string;
  dependencies: string[];
  bytes?: number;
  status: "ACTIVE" | "DELETED";
  updatedAt: string;
};

async function parseJsonResponse<T>(response: Response): Promise<T & { error?: string }> {
  const text = await response.text();
  try {
    return JSON.parse(text) as T & { error?: string };
  } catch {
    throw new Error(`La API Asset Manager no devolvio JSON. URL: ${response.url}`);
  }
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: buildTBitApiHeaders(),
  });
  const payload = await parseJsonResponse<T>(response);
  if (!response.ok) throw new Error(payload.error ?? "Fallo en Asset Manager.");
  return payload;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: buildTBitApiHeaders(true),
    body: JSON.stringify(body),
  });
  const payload = await parseJsonResponse<T>(response);
  if (!response.ok) throw new Error(payload.error ?? "Fallo en Asset Manager.");
  return payload;
}

export const assetManagerClient = {
  list(userId?: string) {
    const query = userId?.trim() ? `?userId=${encodeURIComponent(userId.trim())}` : "";
    return getJson(`/api/assets/list${query}`);
  },
  stats(userId?: string) {
    const query = userId?.trim() ? `?userId=${encodeURIComponent(userId.trim())}` : "";
    return getJson(`/api/assets/stats${query}`);
  },
  delete(assetKey: string) {
    return postJson("/api/assets/delete", { assetKey });
  },
};
