import { buildTBitApiHeaders } from "./tbitApiHeaders";

const API_BASE_URL = import.meta.env.VITE_TBIT_API_BASE_URL?.trim() || "http://localhost:3000";

export type BinaryAssetImportRequest = {
  userId: string;
  filename: string;
  mimeType?: string;
  contentBase64: string;
  key?: string;
};

export type BinaryAssetImportResult = {
  key: string;
  assetKey: string;
  filename: string;
  mimeType: string;
  originalBytes: number;
  sha256: string;
  chunkCount: number;
  chunks: string[];
};

export type BinaryAssetReconstructResult = {
  key: string;
  filename: string;
  mimeType: string;
  contentBase64: string;
  originalBytes: number;
  sha256: string;
  chunkCount: number;
};

async function parseJsonResponse<T>(response: Response): Promise<T & { error?: string }> {
  const text = await response.text();
  try {
    return JSON.parse(text) as T & { error?: string };
  } catch {
    throw new Error(`La API Binary Asset no devolvio JSON. URL: ${response.url}`);
  }
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: buildTBitApiHeaders(true),
    body: JSON.stringify(body),
  });
  const payload = await parseJsonResponse<T>(response);
  if (!response.ok) throw new Error(payload.error ?? "Fallo en Binary Asset Bridge.");
  return payload;
}

export const binaryAssetClient = {
  importAsset(body: BinaryAssetImportRequest) {
    return postJson<{ ok: boolean; result: BinaryAssetImportResult }>("/api/assets/import-binary", body);
  },
  reconstruct(key: string) {
    return postJson<{ ok: boolean; result: BinaryAssetReconstructResult }>("/api/assets/reconstruct-binary", { key });
  },
  delete(key: string) {
    return postJson("/api/assets/delete-binary", { key });
  },
};
