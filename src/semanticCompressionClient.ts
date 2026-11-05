import { buildTBitApiHeaders } from "./tbitApiHeaders";

export type CompressionReport = {
  status: "SPACE_OPTIMIZED" | "DRY_RUN" | "NO_CANDIDATES" | "PARTIAL_RELEASE";
  state: string;
  dominioTarget: string;
  archiveKey?: string;
  archiveChecksum?: string;
  bytesLiberados: number;
  regionesLiberadas: number;
  vitsCondensados: number;
  manifestChecksum: string;
  note: string;
  error?: string;
};

const API_BASE_URL = import.meta.env.VITE_TBIT_API_BASE_URL ?? "http://localhost:3000";

export async function compressSemanticGravityClient(options: {
  dominioTarget?: string;
  candidateKeys: string[];
  dryRun?: boolean;
  maxItems?: number;
}): Promise<CompressionReport> {
  const response = await fetch(`${API_BASE_URL}/api/ai/compress`, {
    method: "POST",
    headers: buildTBitApiHeaders(true),
    body: JSON.stringify({
      dominioTarget: options.dominioTarget ?? "AI",
      candidateKeys: options.candidateKeys,
      dryRun: Boolean(options.dryRun),
      maxItems: options.maxItems,
    }),
  });

  const payload = (await response.json()) as CompressionReport;
  if (!response.ok) {
    throw new Error(payload.error ?? payload.note ?? "Fallo en compresion semantica fractal.");
  }
  return payload;
}
