import { buildTBitApiHeaders } from "./tbitApiHeaders";

const API_BASE_URL = import.meta.env.VITE_TBIT_API_BASE_URL?.trim() || "http://localhost:3000";

export type UniversalDocumentImportRequest = {
  userId: string;
  filename: string;
  mimeType?: string;
  contentBase64: string;
  key?: string;
  semanticMode?: "auto" | "inline" | "deferred" | "skip";
  analyzeCode?: boolean;
  showCodeGraphRelations?: boolean;
};

export type UniversalCodeGraphSummary = {
  language: string;
  imports: number;
  exports: number;
  functions: number;
  classes: number;
  routes: number;
  topImports: string[];
  topFunctions: string[];
  topClasses: string[];
};

export type UniversalDocumentImportResult = {
  key: string;
  visibleKind: "document" | "asset";
  extractionMode: "text" | "binary";
  title: string;
  filename: string;
  mimeType: string;
  searchable: boolean;
  chunked: boolean;
  chunkCount: number;
  originalBytes: number;
  internalKeys: string[];
  note: string;
  semanticStatus?: "completed" | "deferred" | "not_applicable";
  codeGraph?: UniversalCodeGraphSummary;
};

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: buildTBitApiHeaders(true),
    body: JSON.stringify(body),
  });

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error(`La API Documents no devolvio JSON. URL: ${response.url}`);
  }

  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? "Fallo importando documento.");
  return payload as T;
}

function postJsonWithProgress<T>(
  path: string,
  body: unknown,
  onUploadProgress?: (percent: number) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", `${API_BASE_URL}${path}`);
    const headers = buildTBitApiHeaders(true);
    Object.entries(headers).forEach(([key, value]) => request.setRequestHeader(key, value));
    request.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onUploadProgress?.(Math.round((event.loaded / event.total) * 100));
      }
    };
    request.onerror = () => reject(new Error("No se pudo conectar con la API Documents."));
    request.onload = () => {
      const contentType = request.getResponseHeader("content-type") ?? "";
      if (!contentType.includes("application/json")) {
        reject(new Error(`La API Documents no devolvio JSON. URL: ${API_BASE_URL}${path}`));
        return;
      }

      try {
        const payload = JSON.parse(request.responseText);
        if (request.status < 200 || request.status >= 300) {
          reject(new Error(payload.error ?? "Fallo importando documento."));
          return;
        }
        resolve(payload as T);
      } catch {
        reject(new Error("La API Documents devolvio JSON invalido."));
      }
    };
    request.send(JSON.stringify(body));
  });
}

export const universalDocumentClient = {
  importDocument(body: UniversalDocumentImportRequest) {
    return postJson<{ ok: boolean; result: UniversalDocumentImportResult }>("/api/documents/import", body);
  },
  importDocumentWithProgress(body: UniversalDocumentImportRequest, onUploadProgress?: (percent: number) => void) {
    return postJsonWithProgress<{ ok: boolean; result: UniversalDocumentImportResult }>(
      "/api/documents/import",
      body,
      onUploadProgress,
    );
  },
};
