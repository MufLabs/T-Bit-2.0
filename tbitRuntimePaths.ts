import path from "path";
import { normalizeTBitKey } from "./textEncoding";

export type TBitSpacePaths = {
  spaceId: string;
  rootDir: string;
  containerPath: string;
  metadataPath: string;
  walPath: string;
  lockPath: string;
  snapshotsDir: string;
  replicasDir: string;
  aiContainerPath: string;
  aiMetadataPath: string;
  aiWalPath: string;
  aiLockPath: string;
  aiReplicasDir: string;
  aiRemoteReplicaDir?: string;
  memoryIndexPath: string;
  queryIndexPath: string;
  assetIndexPath: string;
  semanticIndexPath: string;
  manifestPath: string;
};

let activeDataDir = path.join(process.cwd(), "data");
let activeSpacesRoot = path.join(activeDataDir, "spaces");

export function normalizeTBitSpaceId(value: string): string {
  const normalized = normalizeTBitKey(value || "usuario_local")
    .replace(/[^a-zA-Z0-9_.-]/g, "_")
    .replace(/_{2,}/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 96);
  return normalized || "usuario_local";
}

export function getTBitSpacesRoot(): string {
  return activeSpacesRoot;
}

export function getTBitSpacePaths(spaceIdInput: string, remoteReplicaRoot?: string): TBitSpacePaths {
  const spaceId = normalizeTBitSpaceId(spaceIdInput);
  const spacesRoot = getTBitSpacesRoot();
  const rootDir = path.join(spacesRoot, spaceId);

  const relative = path.relative(spacesRoot, rootDir);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("ID de espacio T-BIT invalido.");
  }

  return {
    spaceId,
    rootDir,
    containerPath: path.join(rootDir, "universo.tbit"),
    metadataPath: path.join(rootDir, "universo.tbit.meta.json"),
    walPath: path.join(rootDir, "universo.tbit.wal.jsonl"),
    lockPath: path.join(rootDir, "universo.tbit.lock"),
    snapshotsDir: path.join(rootDir, "snapshots"),
    replicasDir: path.join(rootDir, "replica"),
    aiContainerPath: path.join(rootDir, "ai_memoria.tbit"),
    aiMetadataPath: path.join(rootDir, "ai_memoria.tbit.meta.json"),
    aiWalPath: path.join(rootDir, "ai_memoria.tbit.wal.jsonl"),
    aiLockPath: path.join(rootDir, "ai_memoria.tbit.lock"),
    aiReplicasDir: path.join(rootDir, "ai_replica"),
    aiRemoteReplicaDir: remoteReplicaRoot ? path.join(remoteReplicaRoot, spaceId, "ai_memoria") : undefined,
    memoryIndexPath: path.join(rootDir, "memory-core-index.json"),
    queryIndexPath: path.join(rootDir, "query-index.json"),
    assetIndexPath: path.join(rootDir, "asset-index.json"),
    semanticIndexPath: path.join(rootDir, "semantic-index.json"),
    manifestPath: path.join(rootDir, "space.json"),
  };
}

export function setActiveTBitDataDir(dataDir: string): void {
  activeDataDir = dataDir;
}

export function getActiveTBitDataDir(): string {
  return activeDataDir;
}

export function resolveActiveTBitDataPath(...parts: string[]): string {
  return path.join(activeDataDir, ...parts);
}

export function normalizeTBitVaultRoot(value: string | undefined | null): string {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return path.join(process.cwd(), "data", "spaces");
  return path.resolve(trimmed);
}

export function setActiveTBitSpacesRoot(rootDir: string): void {
  activeSpacesRoot = normalizeTBitVaultRoot(rootDir);
}
