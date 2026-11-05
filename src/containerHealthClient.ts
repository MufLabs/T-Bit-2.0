const API_BASE_URL = import.meta.env.VITE_TBIT_API_BASE_URL?.trim() || "http://localhost:3000";

export type ContainerHealth = {
  name: string;
  exists: boolean;
  sizeBytes: number;
  usedBytesEstimate: number;
  freeBytesEstimate: number;
  usedPercentEstimate: number;
  metadataRecords: number;
  chunks: number;
  collisionAvoidedRecords: number;
  probingAttemptsTotal: number;
  probingAttemptsMax: number;
  wal: {
    total: number;
    pending: number;
    committed: number;
    aborted: number;
    errors: number;
  };
  logicalIndex?: {
    memoryRecords: number;
    queryRecords: number;
    activeAssets: number;
    assetDependencies: number;
    assetBytes: number;
    physicalLogicalDrift: number;
  };
};

export type ContainerHealthReport = {
  ok: boolean;
  generatedAt: string;
  status: "HEALTHY" | "WARN" | "CRITICAL";
  containers: ContainerHealth[];
  summary: {
    totalSizeBytes: number;
    totalUsedBytesEstimate: number;
    totalMetadataRecords: number;
    totalChunks: number;
    totalWalPending: number;
    totalWalErrors: number;
    totalCollisionAvoidedRecords: number;
  };
};

export type HealthReconciliationReport = {
  ok: boolean;
  dryRun: boolean;
  generatedAt: string;
  scanned: {
    physicalRecords: number;
    memoryRecords: number;
    queryRecords: number;
  };
  drift: {
    staleMemoryRecords: string[];
    physicalRecordsWithoutMemoryIndex: string[];
    staleQueryRecords: string[];
    missingQueryRecords: string[];
  };
  actions: string[];
  note: string;
};

export type TBitSpaceStatus = {
  target: "universo" | "ai_memoria";
  exists: boolean;
  path: string;
  metadataPath: string;
  sizeBytes: number;
  sizeMB: number;
  requestedSizeMB?: number;
  metadataRecords: number;
  status: "MISSING" | "READY" | "EXISTS_SIZE_MISMATCH";
  warning?: string;
};

export type TBitSpacePrepareReport = {
  ok: boolean;
  status: "SPACE_READY" | "SPACE_EXISTS_REQUIRES_DECISION";
  requestedSizeMB: number;
  spaces: TBitSpaceStatus[];
  warnings: string[];
  error?: string;
};

export type TBitSpaceInventoryItem = {
  spaceId: string;
  label: string;
  ownerUserId: string;
  displayName: string;
  email?: string;
  rootDir: string;
  active: boolean;
  sizeBytes: number;
  sizeMB: number;
  createdAt?: string;
  updatedAt?: string;
};

type TBitUserProfileStorage = {
  userId?: string;
  displayName?: string;
  email?: string;
  vaultRoot?: string;
};

function getLocalApiKey(): string {
  return import.meta.env.VITE_TBIT_API_KEY ?? localStorage.getItem("tbit_api_key") ?? "";
}

function getActiveUserId(): string {
  try {
    const profile = JSON.parse(localStorage.getItem("tbit_user_profile") ?? "null") as TBitUserProfileStorage | null;
    return profile?.userId?.trim() || profile?.displayName?.trim() || "";
  } catch {
    return "";
  }
}

function getActiveVaultRoot(): string {
  try {
    const profile = JSON.parse(localStorage.getItem("tbit_user_profile") ?? "null") as TBitUserProfileStorage | null;
    return profile?.vaultRoot?.trim() || "";
  } catch {
    return "";
  }
}

function buildHeaders(includeJson = false): HeadersInit {
  const headers: Record<string, string> = { "x-tbit-api-key": getLocalApiKey() };
  const userId = getActiveUserId();
  const vaultRoot = getActiveVaultRoot();
  if (userId) headers["x-tbit-user-id"] = userId;
  if (vaultRoot) headers["x-tbit-vault-root"] = vaultRoot;
  if (includeJson) headers["Content-Type"] = "application/json; charset=utf-8";
  return headers;
}

async function parseJsonResponse<T>(response: Response): Promise<T & { error?: string }> {
  const text = await response.text();
  try {
    return JSON.parse(text) as T & { error?: string };
  } catch {
    const preview = text.slice(0, 80).replace(/\s+/g, " ").trim();
    throw new Error(
      `La API Health no devolvio JSON. Reinicia npm run dev:all para cargar el endpoint /api/health/container. URL: ${response.url}${preview ? ` | Respuesta: ${preview}` : ""}`,
    );
  }
}

export const containerHealthClient = {
  async read() {
    const response = await fetch(`${API_BASE_URL}/api/health/container`, {
      headers: buildHeaders(),
    });
    const payload = await parseJsonResponse<ContainerHealthReport>(response);
    if (!response.ok) throw new Error(payload.error ?? "Fallo leyendo salud del contenedor.");
    return payload;
  },
  async reconcile(dryRun = false) {
    const response = await fetch(`${API_BASE_URL}/api/health/reconcile`, {
      method: "POST",
      headers: {
        ...buildHeaders(true),
      },
      body: JSON.stringify({ dryRun }),
    });
    const payload = await parseJsonResponse<HealthReconciliationReport>(response);
    if (!response.ok) throw new Error(payload.error ?? "Fallo reconciliando indices del contenedor.");
    return payload;
  },
  async readSpaces() {
    const response = await fetch(`${API_BASE_URL}/api/container/space`, {
      headers: buildHeaders(),
    });
    const payload = await parseJsonResponse<{ ok: boolean; spaces: TBitSpaceStatus[]; error?: string }>(response);
    if (!response.ok) throw new Error(payload.error ?? "Fallo leyendo espacios T-BIT.");
    return payload;
  },
  async prepareSpace(
    sizeMb: number,
    target: "universo" | "ai_memoria" | "both" = "both",
    mode: "keep" | "overwrite" = "keep",
    user?: { userId: string; displayName: string; email?: string; vaultRoot?: string },
  ) {
    const response = await fetch(`${API_BASE_URL}/api/container/space/prepare`, {
      method: "POST",
      headers: buildHeaders(true),
      body: JSON.stringify({
        sizeMb,
        target,
        mode,
        userId: user?.userId,
        displayName: user?.displayName,
        email: user?.email,
        vaultRoot: user?.vaultRoot,
      }),
    });
    const payload = await parseJsonResponse<TBitSpacePrepareReport>(response);
    if (!response.ok && payload.status !== "SPACE_EXISTS_REQUIRES_DECISION") {
      throw new Error(payload.error ?? "Fallo preparando espacio T-BIT.");
    }
    return payload;
  },
  async listUserSpaces(vaultRoot?: string) {
    const response = await fetch(`${API_BASE_URL}/api/container/spaces`, {
      headers: {
        ...buildHeaders(),
        ...(vaultRoot?.trim() ? { "x-tbit-vault-root": vaultRoot.trim() } : {}),
      },
    });
    const payload = await parseJsonResponse<{ ok: boolean; activeSpaceId: string; spaces: TBitSpaceInventoryItem[]; error?: string }>(response);
    if (!response.ok) throw new Error(payload.error ?? "Fallo listando espacios T-BIT.");
    return payload;
  },
  async activateUserSpace(spaceId: string, displayName?: string, vaultRoot?: string, email?: string) {
    const response = await fetch(`${API_BASE_URL}/api/container/space/activate`, {
      method: "POST",
      headers: {
        ...buildHeaders(true),
        ...(vaultRoot?.trim() ? { "x-tbit-vault-root": vaultRoot.trim() } : {}),
      },
      body: JSON.stringify({ spaceId, displayName, vaultRoot, email }),
    });
    const payload = await parseJsonResponse<{ ok: boolean; activeSpaceId: string; spaces: TBitSpaceInventoryItem[]; status: string; error?: string }>(response);
    if (!response.ok) throw new Error(payload.error ?? "Fallo activando espacio T-BIT.");
    return payload;
  },
  async deleteUserSpaces(spaceIds: string[], confirmation: string, vaultRoot?: string) {
    const response = await fetch(`${API_BASE_URL}/api/container/spaces`, {
      method: "DELETE",
      headers: {
        ...buildHeaders(true),
        ...(vaultRoot?.trim() ? { "x-tbit-vault-root": vaultRoot.trim() } : {}),
      },
      body: JSON.stringify({ spaceIds, confirmation, vaultRoot }),
    });
    const payload = await parseJsonResponse<{ ok: boolean; deleted: string[]; spaces: TBitSpaceInventoryItem[]; error?: string }>(response);
    if (!response.ok) throw new Error(payload.error ?? "Fallo eliminando espacios T-BIT.");
    return payload;
  },
};
