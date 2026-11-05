import { buildTBitApiHeaders, getLocalApiKey } from "./tbitApiHeaders";

export type NetworkState = {
  nodeId: string;
  protocolVersion: string;
  ledgerChecksum: string;
  importedRecordCount: number;
  updatedAt: string;
  timestamp: number;
};

export type ExportedRecord = {
  key: string;
  payload: string;
  checksum: string;
  networkSignature: string;
  networkKeyId: string;
  sourceNodeId: string;
  exportedAt: string;
  protocolVersion: string;
};

const API_BASE_URL = import.meta.env.VITE_TBIT_API_BASE_URL ?? "http://localhost:3000";

async function jsonRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      ...buildTBitApiHeaders(true),
      ...(options.headers ?? {}),
    },
  });
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? "Fallo de sincronizacion T-BIT.");
  return payload;
}

export function getLocalNetworkState(): Promise<NetworkState> {
  return jsonRequest<NetworkState>("/api/network/state");
}

export function exportNetworkRecordClient(key: string): Promise<ExportedRecord> {
  return jsonRequest<ExportedRecord>("/api/network/export-record", {
    method: "POST",
    body: JSON.stringify({ key }),
  });
}

export function importNetworkRecordClient(record: ExportedRecord, force = false) {
  return jsonRequest("/api/network/import-record", {
    method: "POST",
    body: JSON.stringify({ ...record, force }),
  });
}

export async function exportRecordFromPeer(peerUrl: string, key: string): Promise<ExportedRecord> {
  const response = await fetch(`${peerUrl.replace(/\/$/, "")}/api/network/export-record`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "x-tbit-api-key": getLocalApiKey(),
    },
    body: JSON.stringify({ key }),
  });
  const payload = (await response.json()) as ExportedRecord & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? "No se pudo exportar desde el peer remoto.");
  return payload;
}

export async function importRecordToPeer(peerUrl: string, record: ExportedRecord, force = false) {
  const response = await fetch(`${peerUrl.replace(/\/$/, "")}/api/network/import-record`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "x-tbit-api-key": getLocalApiKey(),
    },
    body: JSON.stringify({ ...record, force }),
  });
  const payload = (await response.json()) as { error?: string };
  if (!response.ok) throw new Error(payload.error ?? "No se pudo importar hacia el peer remoto.");
  return payload;
}

export function compareNetworkStateClient(remoteState: NetworkState) {
  return jsonRequest("/api/network/compare", {
    method: "POST",
    body: JSON.stringify({ remoteState }),
  });
}

export async function getPeerNetworkState(peerUrl: string): Promise<NetworkState> {
  const response = await fetch(`${peerUrl.replace(/\/$/, "")}/api/network/state`, {
    headers: {
      "x-tbit-api-key": getLocalApiKey(),
    },
  });
  const payload = (await response.json()) as NetworkState & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? "No se pudo leer el nodo remoto.");
  return payload;
}

export async function compareWithPeer(peerUrl: string) {
  const remoteState = await getPeerNetworkState(peerUrl);
  return compareNetworkStateClient(remoteState);
}

export function getConfiguredPeers(): string[] {
  const raw = import.meta.env.VITE_TBIT_REMOTE_PEERS ?? localStorage.getItem("tbit_remote_peers") ?? "[]";
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return raw
      .split(",")
      .map((item: string) => item.trim())
      .filter(Boolean);
  }
}

export const networkSyncClient = {
  getNetworkState: getLocalNetworkState,
  exportRecord: exportNetworkRecordClient,
  importRecord: importNetworkRecordClient,
  compareState: compareNetworkStateClient,
  exportFromPeer: exportRecordFromPeer,
  importToPeer: importRecordToPeer,
  getPeerState: getPeerNetworkState,
  compareWithPeer,
  getConfiguredPeers,
};
