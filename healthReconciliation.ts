import { readFile, writeFile } from "fs/promises";
import { syncQueryIndexIncremental } from "./queryIndex";
import { resolveActiveTBitDataPath } from "./tbitRuntimePaths";
import type { MemoryCoreRecord } from "./queryIndex";

type Metadata = Record<string, unknown>;

type MemoryIndex = {
  version: "memory-core-v1";
  records: Record<string, MemoryCoreRecord>;
};

type QueryIndex = {
  totalRecords?: number;
  entries?: Record<string, unknown>;
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

function aiMetadataPath(): string {
  return resolveActiveTBitDataPath("ai_memoria.tbit.meta.json");
}

function memoryIndexPath(): string {
  return resolveActiveTBitDataPath("memory-core-index.json");
}

function queryIndexPath(): string {
  return resolveActiveTBitDataPath("query-index.json");
}

async function readJsonSafe<T>(filePath: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function rebuildBacklinks(index: MemoryIndex): MemoryIndex {
  for (const record of Object.values(index.records)) record.backlinks = [];
  for (const record of Object.values(index.records)) {
    for (const link of record.links ?? []) {
      const target = index.records[link];
      if (target && !target.backlinks.includes(record.key)) target.backlinks.push(record.key);
    }
  }
  return index;
}

async function saveMemoryIndex(index: MemoryIndex): Promise<void> {
  await writeFile(memoryIndexPath(), JSON.stringify(index, null, 2), "utf8");
}

export async function reconcileContainerHealth(dryRun = false): Promise<HealthReconciliationReport> {
  const metadata = await readJsonSafe<Metadata>(aiMetadataPath(), {});
  const memoryIndex = await readJsonSafe<MemoryIndex>(memoryIndexPath(), { version: "memory-core-v1", records: {} });
  const queryIndex = await readJsonSafe<QueryIndex>(queryIndexPath(), { entries: {}, totalRecords: 0 });

  const physicalKeys = new Set(Object.keys(metadata));
  const memoryKeys = new Set(Object.keys(memoryIndex.records ?? {}));
  const queryKeys = new Set(Object.keys(queryIndex.entries ?? {}));
  const staleMemoryRecords = [...memoryKeys].filter((key) => !physicalKeys.has(key)).sort();
  const physicalRecordsWithoutMemoryIndex = [...physicalKeys].filter((key) => !memoryKeys.has(key)).sort();
  const staleQueryRecords = [...queryKeys].filter((key) => !memoryKeys.has(key)).sort();
  const missingQueryRecords = [...memoryKeys].filter((key) => !queryKeys.has(key)).sort();
  const actions: string[] = [];

  if (!dryRun) {
    for (const key of staleMemoryRecords) {
      delete memoryIndex.records[key];
      actions.push(`REMOVED_STALE_MEMORY:${key}`);
    }

    const rebuiltMemoryIndex = rebuildBacklinks(memoryIndex);
    await saveMemoryIndex(rebuiltMemoryIndex);
    await syncQueryIndexIncremental(rebuiltMemoryIndex);
    actions.push("REBUILT_BACKLINKS");
    actions.push("SYNCED_QUERY_INDEX");
  }

  return {
    ok: true,
    dryRun,
    generatedAt: new Date().toISOString(),
    scanned: {
      physicalRecords: physicalKeys.size,
      memoryRecords: memoryKeys.size,
      queryRecords: queryKeys.size,
    },
    drift: {
      staleMemoryRecords,
      physicalRecordsWithoutMemoryIndex,
      staleQueryRecords,
      missingQueryRecords,
    },
    actions,
    note: "Reconciliacion conservadora: corrige indices logicos y Query Index. No borra datos fisicos ni crea memoria ficticia para registros fisicos sin indice.",
  };
}
