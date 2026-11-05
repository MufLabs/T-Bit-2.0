import { buildTBitApiHeaders } from "./tbitApiHeaders";

const API_BASE_URL = import.meta.env.VITE_TBIT_API_BASE_URL?.trim() || "http://localhost:3000";

export type EncryptionStatus = {
  enabled: boolean;
  algorithm: string;
  activeKeyId: string;
  previousKeyIds: string[];
  keyCount: number;
  secretMaterialExposed: false;
};

export type EncryptionMigrationReport = {
  ok: boolean;
  status: "MIGRATION_DRY_RUN" | "MIGRATION_COMPLETED";
  storage: string;
  activeKeyId: string;
  scanned: number;
  migrated: string[];
  pendingAfterLimit: number;
  errors: Array<{ key: string; error: string }>;
  note: string;
};

async function parseJsonResponse<T>(response: Response): Promise<T & { error?: string }> {
  const text = await response.text();
  try {
    return JSON.parse(text) as T & { error?: string };
  } catch {
    throw new Error(`La API de llaves no devolvio JSON. URL: ${response.url}`);
  }
}

export const encryptionKeyClient = {
  async status() {
    const response = await fetch(`${API_BASE_URL}/api/security/encryption/status`, {
      headers: buildTBitApiHeaders(),
    });
    const payload = await parseJsonResponse<{ ok: boolean; encryption: EncryptionStatus }>(response);
    if (!response.ok || !payload.ok) throw new Error(payload.error ?? "Fallo leyendo llaves AES-GCM.");
    return payload.encryption;
  },
  async migrate(limit = 25, dryRun = false) {
    const response = await fetch(`${API_BASE_URL}/api/security/encryption/migrate`, {
      method: "POST",
      headers: buildTBitApiHeaders(true),
      body: JSON.stringify({ limit, dryRun }),
    });
    const payload = await parseJsonResponse<EncryptionMigrationReport>(response);
    if (!response.ok) throw new Error(payload.error ?? "Fallo migrando llaves AES-GCM.");
    return payload;
  },
};
