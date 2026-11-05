import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { deleteMemoryRecordsBatch } from "./memoryCore";
import { resolveActiveTBitDataPath } from "./tbitRuntimePaths";

export type TBitAssetStatus = "ACTIVE" | "DELETED";

export type TBitAssetRecord = {
  assetKey: string;
  rootKey: string;
  userId: string;
  type: string;
  title: string;
  filename?: string;
  dependencies: string[];
  bytes?: number;
  status: TBitAssetStatus;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
};

export type TBitAssetIndex = {
  version: "tbit-asset-index-v1";
  assets: Record<string, TBitAssetRecord>;
};

export type RegisterAssetRequest = {
  assetKey?: string;
  rootKey: string;
  userId: string;
  type: string;
  title: string;
  filename?: string;
  dependencies?: string[];
  bytes?: number;
};

export type DeleteAssetResult = {
  assetKey: string;
  rootKey: string;
  deletedKeys: string[];
  collapsedCount: number;
  indexRemovedCount: number;
  warnings: string[];
};

type MemoryCoreRecord = {
  key: string;
  userId: string;
  payload: unknown;
  links: string[];
  source: string;
  createdAt: string;
  updatedAt: string;
};

type MemoryIndex = {
  records: Record<string, MemoryCoreRecord>;
};

function assetIndexPath(): string {
  return resolveActiveTBitDataPath("asset-index.json");
}

function memoryIndexPath(): string {
  return resolveActiveTBitDataPath("memory-core-index.json");
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

async function loadAssetIndex(): Promise<TBitAssetIndex> {
  try {
    const parsed = JSON.parse(await readFile(assetIndexPath(), "utf8")) as TBitAssetIndex;
    return { version: "tbit-asset-index-v1", assets: parsed.assets ?? {} };
  } catch {
    return { version: "tbit-asset-index-v1", assets: {} };
  }
}

async function saveAssetIndex(index: TBitAssetIndex): Promise<void> {
  const indexPath = assetIndexPath();
  await mkdir(path.dirname(indexPath), { recursive: true });
  await writeFile(indexPath, JSON.stringify(index, null, 2), "utf8");
}

async function loadMemoryIndex(): Promise<MemoryIndex> {
  try {
    const parsed = JSON.parse(await readFile(memoryIndexPath(), "utf8")) as MemoryIndex;
    return { records: parsed.records ?? {} };
  } catch {
    return { records: {} };
  }
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim()))];
}

function inferAssetKey(rootKey: string): string {
  return `Asset::${rootKey}`;
}

function dependencyKeysFromMemoryRecord(record: MemoryCoreRecord): string[] {
  const payload = asRecord(record.payload);
  const explicitChunks = Array.isArray(payload.chunks)
    ? payload.chunks.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
  return unique([...record.links.filter((link) => link.startsWith(`${record.key}::chunk_`)), ...explicitChunks]);
}

async function syncMarkdownAssets(index: TBitAssetIndex): Promise<TBitAssetIndex> {
  const memoryIndex = await loadMemoryIndex();

  for (const record of Object.values(memoryIndex.records)) {
    if (record.source !== "markdown" || record.key.includes("::chunk_")) continue;

    const payload = asRecord(record.payload);
    const assetKey = inferAssetKey(record.key);
    const title = typeof payload.title === "string" && payload.title.trim()
      ? payload.title
      : record.key.split("::").slice(-1)[0] ?? record.key;
    const filename = typeof payload.filename === "string" ? payload.filename : undefined;
    const dependencies = unique([
      ...dependencyKeysFromMemoryRecord(record),
      ...Object.keys(memoryIndex.records).filter((key) => key.startsWith(`${record.key}::chunk_`)),
    ]);

    if (!index.assets[assetKey]) {
      index.assets[assetKey] = {
        assetKey,
        rootKey: record.key,
        userId: record.userId,
        type: "markdown",
        title,
        filename,
        dependencies,
        bytes: typeof payload.originalBytes === "number" ? payload.originalBytes : undefined,
        status: "ACTIVE",
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      };
    } else if (index.assets[assetKey].status === "ACTIVE") {
      index.assets[assetKey] = {
        ...index.assets[assetKey],
        title,
        filename,
        dependencies,
        bytes: typeof payload.originalBytes === "number" ? payload.originalBytes : index.assets[assetKey].bytes,
        updatedAt: record.updatedAt,
      };
    }
  }

  return index;
}

export async function registerAsset(request: RegisterAssetRequest): Promise<TBitAssetRecord> {
  const index = await loadAssetIndex();
  const now = new Date().toISOString();
  const assetKey = request.assetKey ?? inferAssetKey(request.rootKey);
  const previous = index.assets[assetKey];

  index.assets[assetKey] = {
    assetKey,
    rootKey: request.rootKey,
    userId: request.userId,
    type: request.type,
    title: request.title,
    filename: request.filename,
    dependencies: unique(request.dependencies ?? []),
    bytes: request.bytes,
    status: "ACTIVE",
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
  };

  await saveAssetIndex(index);
  return index.assets[assetKey];
}

export async function listAssets(userId?: string): Promise<TBitAssetRecord[]> {
  const index = await syncMarkdownAssets(await loadAssetIndex());
  await saveAssetIndex(index);

  return Object.values(index.assets)
    .filter((asset) => asset.status === "ACTIVE")
    .filter((asset) => !userId || asset.userId === userId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function deleteAsset(storage: unknown, assetKeyOrRootKey: string): Promise<DeleteAssetResult> {
  const index = await syncMarkdownAssets(await loadAssetIndex());
  const direct = index.assets[assetKeyOrRootKey];
  const byRoot = Object.values(index.assets).find((asset) => asset.rootKey === assetKeyOrRootKey);
  const asset = direct ?? byRoot;

  if (!asset || asset.status !== "ACTIVE") {
    throw new Error("Asset no encontrado o ya eliminado.");
  }

  const memoryIndex = await loadMemoryIndex();
  const prefixDependencies = Object.keys(memoryIndex.records).filter((key) => key.startsWith(`${asset.rootKey}::chunk_`));
  const keysToDelete = unique([...asset.dependencies, ...prefixDependencies, asset.rootKey]);
  const deletedKeys: string[] = [];
  const warnings: string[] = [];
  let collapsedCount = 0;
  let indexRemovedCount = 0;

  const batchResults = await deleteMemoryRecordsBatch(storage, keysToDelete);
  for (const result of batchResults) {
    deletedKeys.push(result.key);
    if (result.collapsed) collapsedCount += 1;
    if (result.removedFromIndex) indexRemovedCount += 1;
    if (result.warning) warnings.push(`${result.key}: ${result.warning}`);
  }

  index.assets[asset.assetKey] = {
    ...asset,
    dependencies: [],
    status: "DELETED",
    updatedAt: new Date().toISOString(),
    deletedAt: new Date().toISOString(),
  };
  await saveAssetIndex(index);

  return {
    assetKey: asset.assetKey,
    rootKey: asset.rootKey,
    deletedKeys,
    collapsedCount,
    indexRemovedCount,
    warnings,
  };
}

export async function getAssetStats(userId?: string) {
  const assets = await listAssets(userId);
  return {
    totalAssets: assets.length,
    totalDependencies: assets.reduce((sum, asset) => sum + asset.dependencies.length, 0),
    totalBytes: assets.reduce((sum, asset) => sum + (asset.bytes ?? 0), 0),
    byType: assets.reduce<Record<string, number>>((acc, asset) => {
      acc[asset.type] = (acc[asset.type] ?? 0) + 1;
      return acc;
    }, {}),
  };
}
