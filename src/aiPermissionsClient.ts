import { buildTBitApiHeaders } from "./tbitApiHeaders";

const API_BASE_URL = import.meta.env.VITE_TBIT_API_BASE_URL?.trim() || "http://localhost:3000";

export type AiPermissionsPolicy = {
  version: "tbit-ai-permissions-v1";
  updatedAt: string;
  canRead: boolean;
  canWrite: boolean;
  canDelete: boolean;
  canSearch: boolean;
  canCompute: boolean;
  requireDeleteConfirmation: boolean;
  maxWriteBytes: number;
  allowedKeyPrefixes: string[];
  blockedKeyPrefixes: string[];
};

async function parseJsonResponse<T>(response: Response): Promise<T & { error?: string }> {
  const text = await response.text();
  try {
    return JSON.parse(text) as T & { error?: string };
  } catch {
    throw new Error(`La API Permisos IA no devolvio JSON. URL: ${response.url}`);
  }
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: buildTBitApiHeaders(),
  });
  const payload = await parseJsonResponse<T>(response);
  if (!response.ok) throw new Error(payload.error ?? "Fallo leyendo permisos IA.");
  return payload;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: buildTBitApiHeaders(true),
    body: JSON.stringify(body),
  });
  const payload = await parseJsonResponse<T>(response);
  if (!response.ok) throw new Error(payload.error ?? "Fallo actualizando permisos IA.");
  return payload;
}

export const aiPermissionsClient = {
  read() {
    return getJson<{ ok: boolean; policy: AiPermissionsPolicy }>("/api/ai/permissions");
  },
  update(policy: Partial<AiPermissionsPolicy>) {
    return postJson<{ ok: boolean; policy: AiPermissionsPolicy }>("/api/ai/permissions", policy);
  },
};
