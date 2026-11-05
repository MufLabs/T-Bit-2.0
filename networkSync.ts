import { createHash, createHmac, timingSafeEqual } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { normalizeTBitKey } from "./textEncoding";

export const TBIT_SYNC_PROTOCOL_VERSION = "tbit-sync-v1";

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

export type ImportRecordRequest = {
  key: string;
  payload: string;
  checksum: string;
  networkSignature?: string;
  networkKeyId?: string;
  sourceNodeId?: string;
  updatedAt?: string;
  force?: boolean;
};

export type ImportRecordResult = {
  status: "IMPORTED" | "NOOP_ALREADY_SYNCED" | "CONFLICT_PRESERVED" | "FORCE_IMPORTED";
  key: string;
  checksum: string;
  sourceNodeId: string;
  conflictKey?: string;
  ledgerChecksum: string;
};

type LedgerRecord = {
  key: string;
  checksum: string;
  sourceNodeId: string;
  importedAt: string;
  conflictKey?: string;
  status: ImportRecordResult["status"];
};

type SyncLedger = {
  protocolVersion: string;
  nodeId: string;
  records: LedgerRecord[];
};

type DynamicStorage = {
  inject?: (key: string, payload: string) => Promise<unknown>;
  write?: (key: string, payload: string) => Promise<unknown>;
  memorizar?: (key: string, payload: string) => Promise<unknown>;
  inyectar?: (key: string, payload: string) => Promise<unknown>;
  read?: (key: string) => Promise<unknown>;
  recover?: (key: string) => Promise<unknown>;
  recuperar?: (key: string) => Promise<unknown>;
  oracle?: (key: string) => Promise<unknown>;
};

const LEDGER_PATH = path.join(process.cwd(), "data", "network-ledger.json");

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function getNetworkSecret(): string {
  const secret = process.env.TBIT_NETWORK_HMAC_SECRET ?? process.env.TBIT_HMAC_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      "TBIT_NETWORK_HMAC_SECRET no configurado o demasiado corto. Ejecuta setup:secret o define un secreto de red.",
    );
  }
  return secret;
}

function getNetworkKeyId(): string {
  return process.env.TBIT_NETWORK_KEY_ID ?? process.env.TBIT_HMAC_KEY_ID ?? "network-primary";
}

function canonicalNetworkPayload(key: string, payload: string, sourceNodeId: string, checksum: string): string {
  return JSON.stringify({
    key: normalizeTBitKey(key),
    payload: normalizePayload(payload),
    sourceNodeId: normalizeTBitKey(sourceNodeId),
    checksum,
    protocolVersion: TBIT_SYNC_PROTOCOL_VERSION,
  });
}

export function signNetworkRecord(key: string, payload: string, sourceNodeId: string, checksum: string): string {
  return createHmac("sha256", getNetworkSecret())
    .update(canonicalNetworkPayload(key, payload, sourceNodeId, checksum), "utf8")
    .digest("hex");
}

export function verifyNetworkRecordSignature(request: {
  key: string;
  payload: string;
  sourceNodeId: string;
  checksum: string;
  networkSignature?: string;
}): boolean {
  if (!request.networkSignature) return false;
  const expected = signNetworkRecord(request.key, request.payload, request.sourceNodeId, request.checksum);
  const expectedBuffer = Buffer.from(expected, "hex");
  const receivedBuffer = Buffer.from(request.networkSignature, "hex");
  return expectedBuffer.length === receivedBuffer.length && timingSafeEqual(expectedBuffer, receivedBuffer);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function extractPayloadText(value: unknown): string {
  if (typeof value === "string") return value.normalize("NFC");
  const record = asRecord(value);
  const candidate = record.dato ?? record.data ?? record.payload ?? record.contenido ?? record.texto;
  if (typeof candidate === "string") return candidate.normalize("NFC");
  return JSON.stringify(record).normalize("NFC");
}

function safeConflictKey(sourceNodeId: string, key: string): string {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  return `Conflictos::${normalizeTBitKey(sourceNodeId)}::${stamp}::${sha256(key).slice(0, 12)}`;
}

function normalizePayload(payload: unknown): string {
  if (typeof payload === "string") return payload.normalize("NFC");
  return JSON.stringify(payload ?? {}).normalize("NFC");
}

async function callRead(storage: DynamicStorage, key: string): Promise<unknown> {
  const fn = storage.read ?? storage.recover ?? storage.recuperar ?? storage.oracle;
  if (!fn) throw new Error("El storage no expone metodo de recuperacion compatible.");
  return fn.call(storage, key);
}

async function callWrite(storage: DynamicStorage, key: string, payload: string): Promise<unknown> {
  const fn = storage.inject ?? storage.write ?? storage.memorizar ?? storage.inyectar;
  if (!fn) throw new Error("El storage no expone metodo de escritura compatible.");
  return fn.call(storage, key, payload);
}

async function loadLedger(nodeId: string): Promise<SyncLedger> {
  try {
    const text = await readFile(LEDGER_PATH, "utf8");
    const parsed = JSON.parse(text) as SyncLedger;
    return {
      protocolVersion: parsed.protocolVersion ?? TBIT_SYNC_PROTOCOL_VERSION,
      nodeId: parsed.nodeId ?? nodeId,
      records: Array.isArray(parsed.records) ? parsed.records : [],
    };
  } catch {
    return { protocolVersion: TBIT_SYNC_PROTOCOL_VERSION, nodeId, records: [] };
  }
}

async function saveLedger(ledger: SyncLedger): Promise<void> {
  await mkdir(path.dirname(LEDGER_PATH), { recursive: true });
  await writeFile(LEDGER_PATH, JSON.stringify(ledger, null, 2), "utf8");
}

function ledgerChecksum(ledger: SyncLedger): string {
  const stable = {
    protocolVersion: ledger.protocolVersion,
    nodeId: ledger.nodeId,
    records: ledger.records
      .map(({ key, checksum, sourceNodeId, conflictKey, status }) => ({
        key,
        checksum,
        sourceNodeId,
        conflictKey,
        status,
      }))
      .sort((a, b) => `${a.key}:${a.checksum}`.localeCompare(`${b.key}:${b.checksum}`)),
  };
  return sha256(JSON.stringify(stable));
}

function upsertLedgerRecord(ledger: SyncLedger, record: LedgerRecord): SyncLedger {
  const records = ledger.records.filter(
    (item) => !(item.key === record.key && item.sourceNodeId === record.sourceNodeId),
  );
  records.push(record);
  return { ...ledger, records };
}

export function getTBitNodeId(): string {
  return process.env.TBIT_NODE_ID?.normalize("NFC").trim() || "nodo_local_bogota";
}

export async function getNetworkState(): Promise<NetworkState> {
  const nodeId = getTBitNodeId();
  const ledger = await loadLedger(nodeId);
  return {
    nodeId,
    protocolVersion: TBIT_SYNC_PROTOCOL_VERSION,
    ledgerChecksum: ledgerChecksum(ledger),
    importedRecordCount: ledger.records.length,
    updatedAt: new Date().toISOString(),
    timestamp: Date.now(),
  };
}

export async function exportNetworkRecord(storageLike: unknown, keyInput: string): Promise<ExportedRecord> {
  const storage = storageLike as DynamicStorage;
  const key = normalizeTBitKey(keyInput);
  const payload = extractPayloadText(await callRead(storage, key));
  const checksum = sha256(payload);
  const sourceNodeId = getTBitNodeId();
  return {
    key,
    payload,
    checksum,
    networkSignature: signNetworkRecord(key, payload, sourceNodeId, checksum),
    networkKeyId: getNetworkKeyId(),
    sourceNodeId,
    exportedAt: new Date().toISOString(),
    protocolVersion: TBIT_SYNC_PROTOCOL_VERSION,
  };
}

export async function importNetworkRecord(
  storageLike: unknown,
  request: ImportRecordRequest,
): Promise<ImportRecordResult> {
  const storage = storageLike as DynamicStorage;
  const nodeId = getTBitNodeId();
  const sourceNodeId = normalizeTBitKey(request.sourceNodeId || "nodo_remoto");
  const key = normalizeTBitKey(request.key);
  const payload = normalizePayload(request.payload);
  const checksum = sha256(payload);

  if (!key) throw new Error("La importacion requiere key.");
  if (request.checksum !== checksum) {
    throw new Error("CHECKSUM_MISMATCH: el payload no coincide con el checksum declarado.");
  }
  if (
    !verifyNetworkRecordSignature({
      key,
      payload,
      sourceNodeId,
      checksum,
      networkSignature: request.networkSignature,
    })
  ) {
    throw new Error("REJECTED_BY_CONSENSUS: firma HMAC de red invalida o ausente.");
  }

  const ledger = await loadLedger(nodeId);
  let status: ImportRecordResult["status"] = "IMPORTED";
  let conflictKey: string | undefined;

  try {
    const existing = extractPayloadText(await callRead(storage, key));
    const existingChecksum = sha256(existing);
    if (existingChecksum === checksum) {
      status = "NOOP_ALREADY_SYNCED";
    } else if (request.force) {
      conflictKey = safeConflictKey(sourceNodeId, key);
      await callWrite(storage, conflictKey, existing);
      await callWrite(storage, key, payload);
      status = "FORCE_IMPORTED";
    } else {
      conflictKey = safeConflictKey(sourceNodeId, key);
      await callWrite(storage, conflictKey, payload);
      status = "CONFLICT_PRESERVED";
    }
  } catch {
    await callWrite(storage, key, payload);
    status = "IMPORTED";
  }

  const nextLedger = upsertLedgerRecord(ledger, {
    key,
    checksum,
    sourceNodeId,
    importedAt: new Date().toISOString(),
    conflictKey,
    status,
  });
  await saveLedger(nextLedger);

  return {
    status,
    key,
    checksum,
    sourceNodeId,
    conflictKey,
    ledgerChecksum: ledgerChecksum(nextLedger),
  };
}

export async function compareNetworkState(remoteState: NetworkState): Promise<{
  status: "IN_SYNC" | "DIVERGED";
  local: NetworkState;
  remote: NetworkState;
}> {
  const local = await getNetworkState();
  return {
    status:
      local.protocolVersion === remoteState.protocolVersion &&
      local.ledgerChecksum === remoteState.ledgerChecksum
        ? "IN_SYNC"
        : "DIVERGED",
    local,
    remote: remoteState,
  };
}
