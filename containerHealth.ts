import { existsSync } from "fs";
import { readFile, stat } from "fs/promises";
import path from "path";
import { getActiveTBitDataDir } from "./tbitRuntimePaths";

type MetadataEntry = {
  length?: number;
  probingAttempts?: number;
};

type WalRecord = {
  id?: string;
  state?: "PENDING" | "COMMITTED" | "ABORTED";
  error?: string;
};

type MemoryIndex = {
  records?: Record<string, { source?: string }>;
};

type QueryIndex = {
  totalRecords?: number;
};

type AssetIndex = {
  assets?: Record<string, { status?: string; dependencies?: string[]; bytes?: number }>;
};

export type TBitContainerHealth = {
  name: string;
  containerPath: string;
  metadataPath: string;
  walPath: string;
  exists: boolean;
  sizeBytes: number;
  usableBytes: number;
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

export type TBitHealthReport = {
  ok: boolean;
  generatedAt: string;
  status: "HEALTHY" | "WARN" | "CRITICAL";
  containers: TBitContainerHealth[];
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

const SYSTEM_HEADER_SIZE = 40;
const FRAME_HEADER_SIZE = 8;

async function readJsonSafe<T>(filePath: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as T;
  } catch {
    return fallback;
  }
}

async function statSize(filePath: string): Promise<number> {
  try {
    return (await stat(filePath)).size;
  } catch {
    return 0;
  }
}

async function readWalStats(walPath: string): Promise<TBitContainerHealth["wal"]> {
  try {
    const raw = await readFile(walPath, "utf8");
    const records = raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as WalRecord);
    const latestById = new Map<string, WalRecord>();

    for (let index = 0; index < records.length; index += 1) {
      const record = records[index];
      latestById.set(record.id || `legacy-${index}`, record);
    }

    const latestRecords = [...latestById.values()];

    return {
      total: records.length,
      pending: latestRecords.filter((record) => record.state === "PENDING").length,
      committed: latestRecords.filter((record) => record.state === "COMMITTED").length,
      aborted: latestRecords.filter((record) => record.state === "ABORTED").length,
      errors: latestRecords.filter((record) => Boolean(record.error)).length,
    };
  } catch {
    return { total: 0, pending: 0, committed: 0, aborted: 0, errors: 0 };
  }
}

function summarizeMetadata(metadata: Record<string, MetadataEntry>) {
  const entries = Object.entries(metadata);
  const usedBytesEstimate = entries.reduce((sum, [, entry]) => {
    const length = Number.isFinite(entry.length) ? Number(entry.length) : 0;
    return sum + (length + FRAME_HEADER_SIZE) * 2;
  }, 0);
  const probingAttempts = entries.map(([, entry]) => Number(entry.probingAttempts ?? 0));

  return {
    records: entries.length,
    chunks: entries.filter(([key]) => /::chunk_\d+$/i.test(key)).length,
    usedBytesEstimate,
    collisionAvoidedRecords: probingAttempts.filter((attempts) => attempts > 0).length,
    probingAttemptsTotal: probingAttempts.reduce((sum, attempts) => sum + attempts, 0),
    probingAttemptsMax: probingAttempts.length ? Math.max(...probingAttempts) : 0,
  };
}

async function buildLogicalIndexHealth(metadataRecords: number) {
  const dataDir = getActiveTBitDataDir();
  const memoryIndex = await readJsonSafe<MemoryIndex>(path.join(dataDir, "memory-core-index.json"), { records: {} });
  const queryIndex = await readJsonSafe<QueryIndex>(path.join(dataDir, "query-index.json"), {});
  const assetIndex = await readJsonSafe<AssetIndex>(path.join(dataDir, "asset-index.json"), { assets: {} });
  const memoryRecords = Object.keys(memoryIndex.records ?? {}).length;
  const activeAssets = Object.values(assetIndex.assets ?? {}).filter((asset) => asset.status !== "DELETED");

  return {
    memoryRecords,
    queryRecords: queryIndex.totalRecords ?? 0,
    activeAssets: activeAssets.length,
    assetDependencies: activeAssets.reduce((sum, asset) => sum + (asset.dependencies?.length ?? 0), 0),
    assetBytes: activeAssets.reduce((sum, asset) => sum + (asset.bytes ?? 0), 0),
    physicalLogicalDrift: Math.abs(metadataRecords - memoryRecords),
  };
}

async function buildContainerHealth(
  name: string,
  containerPath: string,
  metadataPath: string,
  walPath: string,
  includeLogicalIndex: boolean,
): Promise<TBitContainerHealth> {
  const metadata = await readJsonSafe<Record<string, MetadataEntry>>(metadataPath, {});
  const metadataSummary = summarizeMetadata(metadata);
  const sizeBytes = await statSize(containerPath);
  const usableBytes = Math.max(0, sizeBytes - SYSTEM_HEADER_SIZE);
  const freeBytesEstimate = Math.max(0, usableBytes - metadataSummary.usedBytesEstimate);

  return {
    name,
    containerPath,
    metadataPath,
    walPath,
    exists: existsSync(containerPath),
    sizeBytes,
    usableBytes,
    usedBytesEstimate: metadataSummary.usedBytesEstimate,
    freeBytesEstimate,
    usedPercentEstimate: usableBytes > 0 ? Number(((metadataSummary.usedBytesEstimate / usableBytes) * 100).toFixed(2)) : 0,
    metadataRecords: metadataSummary.records,
    chunks: metadataSummary.chunks,
    collisionAvoidedRecords: metadataSummary.collisionAvoidedRecords,
    probingAttemptsTotal: metadataSummary.probingAttemptsTotal,
    probingAttemptsMax: metadataSummary.probingAttemptsMax,
    wal: await readWalStats(walPath),
    logicalIndex: includeLogicalIndex ? await buildLogicalIndexHealth(metadataSummary.records) : undefined,
  };
}

export async function getContainerHealthReport(): Promise<TBitHealthReport> {
  const cwd = process.cwd();
  const containers = await Promise.all([
    buildContainerHealth(
      "universo",
      path.join(cwd, "universo.tbit"),
      path.join(cwd, "universo.tbit.meta.json"),
      path.join(cwd, "universo.tbit.wal.jsonl"),
      false,
    ),
    buildContainerHealth(
      "ai_memoria",
      path.join(cwd, "data", "ai_memoria.tbit"),
      path.join(cwd, "data", "ai_memoria.tbit.meta.json"),
      path.join(cwd, "data", "ai_memoria.tbit.wal.jsonl"),
      true,
    ),
  ]);

  const summary = {
    totalSizeBytes: containers.reduce((sum, container) => sum + container.sizeBytes, 0),
    totalUsedBytesEstimate: containers.reduce((sum, container) => sum + container.usedBytesEstimate, 0),
    totalMetadataRecords: containers.reduce((sum, container) => sum + container.metadataRecords, 0),
    totalChunks: containers.reduce((sum, container) => sum + container.chunks, 0),
    totalWalPending: containers.reduce((sum, container) => sum + container.wal.pending, 0),
    totalWalErrors: containers.reduce((sum, container) => sum + container.wal.errors, 0),
    totalCollisionAvoidedRecords: containers.reduce((sum, container) => sum + container.collisionAvoidedRecords, 0),
  };

  const hasCritical = containers.some((container) => !container.exists || container.wal.pending > 0);
  const hasWarn = summary.totalWalErrors > 0 || containers.some((container) => (container.logicalIndex?.physicalLogicalDrift ?? 0) > 0);

  return {
    ok: !hasCritical,
    generatedAt: new Date().toISOString(),
    status: hasCritical ? "CRITICAL" : hasWarn ? "WARN" : "HEALTHY",
    containers,
    summary,
  };
}
