import cors from "cors";
import { operarSimbolicamente } from "./TBitSymbolicBridge";
import {
  AiProviderRuntime,
  AiProviderRuntimeConfig,
  createAiProviderRuntime,
  createAiProviderRuntimeFromConfig,
  createFallbackProviderChain,
  getAiProviderCatalog,
} from "./AiProviderFactory";
import { procesarMensajeUsuario, resetTBitChatSession } from "./TBitChatEngine";
import { createTBitLocalToolExecutor } from "./TBitLocalToolExecutor";
import { tbitCoreTools } from "./TBitToolSchemas";
import { compressSemanticGravity } from "./semanticCompression";
import { getEncryptionKeyStatus } from "./EncryptionKeyManager";
import {
  compareNetworkState,
  exportNetworkRecord,
  getNetworkState,
  importNetworkRecord,
} from "./networkSync";
import { deleteMemoryRecord, getMemoryContext, getMemoryGraph, getMemoryLinks, indexExternalMemoryRecord, recallMemory, rememberMemory } from "./memoryCore";
import { deleteMarkdownDocument, importMarkdownDocument, listMarkdownDocuments, parseMarkdownDocument, purgeOrphanMarkdownChunks, reconstructMarkdownDocument } from "./markdownBridge";
import { deleteBinaryAsset, importBinaryAsset, reconstructBinaryAsset } from "./binaryAssetBridge";
import { importUniversalDocument } from "./universalDocumentBridge";
import { getQueryIndexStats, rebuildQueryIndex, searchQueryIndex } from "./queryIndex";
import { getSemanticIndexStats, rebuildSemanticIndex, searchSemanticIndex } from "./semanticIndex";
import { observeGuardian } from "./guardianObserver";
import { buildWebResearchPrompt, extractFirstUrlFromText, isWebResearchIntent, researchWebPage } from "./webResearch";
import { answerDocumentQuestion } from "./documentQa";
import { deleteAsset, getAssetStats, listAssets } from "./assetManager";
import { getContainerHealthReport } from "./containerHealth";
import { reconcileContainerHealth } from "./healthReconciliation";
import { getAiPermissionsPolicy, updateAiPermissionsPolicy } from "./aiPermissions";
import { createHash, createHmac, timingSafeEqual } from "crypto";
import express, { Request, Response } from "express";
import { existsSync, rmSync, statSync } from "fs";
import { promises as fs, readFileSync } from "fs";
import { dirname, resolve } from "path";
import { AllocationMap, AllocationRange } from "./AllocationMap";
import { TBitContainer } from "./TBitFileSystem";
import { TBitStorageService } from "./TBitStorageService";
import {
  getTBitSpacePaths,
  getTBitSpacesRoot,
  normalizeTBitVaultRoot,
  normalizeTBitSpaceId,
  setActiveTBitDataDir,
  setActiveTBitSpacesRoot,
  TBitSpacePaths,
} from "./tbitRuntimePaths";
import { normalizeTBitKey, normalizeUnicodeText } from "./textEncoding";
import { getAgentEventBus } from "./src/agents/AgentEventBus";
import { AgentOrchestrator } from "./src/agents/AgentOrchestrator";
import {
  buildVaultContext,
  persistAgentRun,
  persistSwarmConsensus,
  verifyAgainstVault,
  type PersistedMemoryInfo,
  type VaultCitation,
  type VaultVerification,
} from "./src/agents/AgentMemoryBridge";

type MetadataEntry = {
  length: number;
  physicalLength?: number;
  updatedAt: string;
  offsetV: number;
  offsetAntiV: number;
  dataHash: string;
  authTag: string;
  authKeyId: string;
  authVersion?: 1 | 2;
  encryption?: "none" | "AES-256-GCM";
  encryptionKeyId?: string;
  probingAttempts?: number;
};

type Metadata = Record<string, MetadataEntry>;

type WalState = "PENDING" | "COMMITTED" | "ABORTED";

type WalRecord = {
  id: string;
  state: WalState;
  operation: "INYECTAR" | "COLAPSAR";
  clave: string;
  length?: number;
  physicalLength?: number;
  offsetV?: number;
  offsetAntiV?: number;
  createdAt: string;
  error?: string;
};

const PORT = Number(process.env.PORT ?? 3000);
const MAX_DATO_BYTES = 64 * 1024;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 120;
const MIN_DYNAMIC_MAX_RECORDS = 500;
const RECORDS_PER_CONTAINER_MB = 64;
const ABSOLUTE_MAX_RECORDS = 200_000;
const SYSTEM_HEADER_SIZE = 40;
const FRAME_HEADER_SIZE = 8;
const DEFAULT_CONTAINER_SIZE_MB = Math.max(1, Math.round(Number(process.env.TBIT_CONTAINER_SIZE_MB ?? 10)));
const DEFAULT_AI_CONTAINER_SIZE_MB = Math.max(1, Math.round(Number(process.env.TBIT_AI_CONTAINER_SIZE_MB ?? DEFAULT_CONTAINER_SIZE_MB)));
const DEFAULT_CONTAINER_SIZE_BYTES = DEFAULT_CONTAINER_SIZE_MB * 1024 * 1024;
const MIN_CONTAINER_SIZE_MB = 256;
const MAX_CONTAINER_SIZE_MB = 50 * 1024;
const MAX_PROBING_ATTEMPTS = 2048;
loadLocalEnv();
const HMAC_KEY_ID = process.env.TBIT_HMAC_KEY_ID ?? "primary";
const HMAC_SECRETS = loadHmacSecrets();
const API_KEY = loadApiKey();
const REMOTE_REPLICA_DIR = process.env.TBIT_REMOTE_REPLICA_DIR;
let activeSpaceId = "legacy";
let activeSpacePaths: TBitSpacePaths | null = null;
let containerPath = resolve(process.cwd(), "universo.tbit");
let metadataPath = resolve(process.cwd(), "universo.tbit.meta.json");
let walPath = resolve(process.cwd(), "universo.tbit.wal.jsonl");
let snapshotsDir = resolve(process.cwd(), "snapshots");
let replicasDir = resolve(process.cwd(), "replica");
let exportsDir = resolve(process.cwd(), "exports");
let lockPath = resolve(process.cwd(), "universo.tbit.lock");
const LOCK_TIMEOUT_MS = 10_000;
const LOCK_RETRY_MS = 100;
const STALE_LOCK_MS = 60_000;
let container = new TBitContainer(containerPath);
const app = express();

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (
    typeof origin === "string" &&
    (/^http:\/\/localhost:\d+$/.test(origin) || /^http:\/\/127\.0\.0\.1:\d+$/.test(origin))
  ) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-tbit-api-key, x-tbit-user-id, x-tbit-vault-root");
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});
const requestBuckets = new Map<string, { count: number; resetAt: number }>();
let operationQueue = Promise.resolve();
let aiContainerPath = resolve(process.cwd(), "data", "ai_memoria.tbit");
let aiMetadataPath = resolve(process.cwd(), "data", "ai_memoria.tbit.meta.json");
let aiWalPath = resolve(process.cwd(), "data", "ai_memoria.tbit.wal.jsonl");
let aiMemoryIndexPath = resolve(process.cwd(), "data", "memory-core-index.json");
let aiQueryIndexPath = resolve(process.cwd(), "data", "query-index.json");
let aiAssetIndexPath = resolve(process.cwd(), "data", "asset-index.json");
let aiSemanticIndexPath = resolve(process.cwd(), "data", "semantic-index.json");

function createAiStorage(): TBitStorageService {
  return new TBitStorageService({
    name: "ai_memoria",
    containerPath: aiContainerPath,
    metadataPath: aiMetadataPath,
    walPath: aiWalPath,
    snapshotsDir: activeSpacePaths ? resolve(activeSpacePaths.rootDir, "ai_snapshots") : resolve(process.cwd(), "data", "ai_snapshots"),
    replicasDir: activeSpacePaths?.aiReplicasDir ?? resolve(process.cwd(), "data", "ai_replica"),
    exportsDir: activeSpacePaths ? resolve(activeSpacePaths.rootDir, "ai_exports") : resolve(process.cwd(), "data", "ai_exports"),
    lockPath: activeSpacePaths?.aiLockPath ?? resolve(process.cwd(), "data", "ai_memoria.tbit.lock"),
    hmacSecrets: HMAC_SECRETS,
    hmacKeyId: HMAC_KEY_ID,
    remoteReplicaDir: activeSpacePaths?.aiRemoteReplicaDir ?? (REMOTE_REPLICA_DIR ? resolve(REMOTE_REPLICA_DIR, "ai_memoria") : undefined),
    containerSizeMB: DEFAULT_AI_CONTAINER_SIZE_MB
  });
}

let aiStorage = createAiStorage();
let tbitChatToolExecutor: ReturnType<typeof createTBitLocalToolExecutor> | null = null;

type TBitSpaceManifest = {
  spaceId: string;
  ownerUserId: string;
  displayName: string;
  email?: string;
  label: string;
  vaultRoot?: string;
  sizeMB: number;
  createdAt: string;
  updatedAt: string;
};

async function writeActiveSpaceManifest(displayName: string, ownerUserId: string, sizeMB: number, email?: string): Promise<void> {
  if (!activeSpacePaths) return;
  const now = new Date().toISOString();
  let previous: Partial<TBitSpaceManifest> = {};
  try {
    previous = JSON.parse(await fs.readFile(activeSpacePaths.manifestPath, "utf8")) as Partial<TBitSpaceManifest>;
  } catch {
    previous = {};
  }
  const manifest: TBitSpaceManifest = {
    spaceId: activeSpaceId,
    ownerUserId,
    displayName,
    email: email?.trim() || previous.email,
    label: `${displayName || ownerUserId} Vault`,
    vaultRoot: getTBitSpacesRoot(),
    sizeMB,
    createdAt: previous.createdAt ?? now,
    updatedAt: now,
  };
  await fs.mkdir(activeSpacePaths.rootDir, { recursive: true });
  await fs.writeFile(activeSpacePaths.manifestPath, JSON.stringify(manifest, null, 2), "utf8");
}

function activateVaultRoot(vaultRootInput?: string): void {
  const vaultRoot = normalizeTBitVaultRoot(vaultRootInput);
  setActiveTBitSpacesRoot(vaultRoot);
}

async function activateUserSpace(userIdInput?: string, displayNameInput?: string, emailInput?: string): Promise<void> {
  const requested = normalizeTBitSpaceId(userIdInput ?? "");
  if (!requested) return;

  const paths = getTBitSpacePaths(requested, REMOTE_REPLICA_DIR);
  if (requested === activeSpaceId && activeSpacePaths?.rootDir === paths.rootDir) return;
  await fs.mkdir(paths.rootDir, { recursive: true });

  activeSpaceId = requested;
  activeSpacePaths = paths;
  containerPath = paths.containerPath;
  metadataPath = paths.metadataPath;
  walPath = paths.walPath;
  snapshotsDir = paths.snapshotsDir;
  replicasDir = paths.replicasDir;
  exportsDir = resolve(paths.rootDir, "exports");
  lockPath = paths.lockPath;
  aiContainerPath = paths.aiContainerPath;
  aiMetadataPath = paths.aiMetadataPath;
  aiWalPath = paths.aiWalPath;
  aiMemoryIndexPath = paths.memoryIndexPath;
  aiQueryIndexPath = paths.queryIndexPath;
  aiAssetIndexPath = paths.assetIndexPath;
  aiSemanticIndexPath = paths.semanticIndexPath;
  setActiveTBitDataDir(paths.rootDir);
  container = new TBitContainer(containerPath);
  aiStorage = createAiStorage();
  tbitChatToolExecutor = createTBitLocalToolExecutor(aiStorage);

  if (displayNameInput) {
    await writeActiveSpaceManifest(normalizeUnicodeText(displayNameInput), requested, DEFAULT_AI_CONTAINER_SIZE_MB, emailInput);
  }
}

function extractRequestedUserId(req: Request): string | undefined {
  const headerValue = req.headers["x-tbit-user-id"];
  if (typeof headerValue === "string" && headerValue.trim()) return headerValue;
  if (typeof req.query?.userId === "string" && req.query.userId.trim()) return req.query.userId;
  const body = req.body as Record<string, unknown> | undefined;
  const bodyUserId = body?.userId;
  if (typeof bodyUserId === "string" && bodyUserId.trim()) return bodyUserId;
  return undefined;
}

function extractRequestedVaultRoot(req: Request): string | undefined {
  const headerValue = req.headers["x-tbit-vault-root"];
  if (typeof headerValue === "string" && headerValue.trim()) return headerValue;
  if (typeof req.query?.vaultRoot === "string" && req.query.vaultRoot.trim()) return req.query.vaultRoot;
  const body = req.body as Record<string, unknown> | undefined;
  const bodyVaultRoot = body?.vaultRoot;
  if (typeof bodyVaultRoot === "string" && bodyVaultRoot.trim()) return bodyVaultRoot;
  return undefined;
}

app.use(cors({ origin: ["http://localhost:5173", "http://127.0.0.1:5173"] }));
app.use((_request, response, next) => {
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  next();
});
app.use(express.json({ limit: "25mb" }));
function safeApiKeyEquals(received: string | undefined, expected: string): boolean {
  if (typeof received !== "string" || received.length === 0) return false;
  const receivedDigest = createHash("sha256").update(received, "utf8").digest();
  const expectedDigest = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(receivedDigest, expectedDigest);
}

app.use("/api", (request, response, next) => {
  const providedKey = request.header("x-tbit-api-key");

  if (!safeApiKeyEquals(providedKey, API_KEY)) {
    response.status(401).json({
      ok: false,
      error: "API key T-BIT invalida o ausente."
    });
    return;
  }

  next();
});
app.use("/api", async (request, response, next) => {
  try {
    const requestedUserId = extractRequestedUserId(request);
    const requestedVaultRoot = extractRequestedVaultRoot(request);
    if (requestedVaultRoot) {
      activateVaultRoot(requestedVaultRoot);
    }
    if (requestedUserId) {
      await activateUserSpace(requestedUserId);
    }
    next();
  } catch (error: any) {
    response.status(400).json({
      ok: false,
      error: `No se pudo activar el espacio T-BIT del usuario: ${error.message}`,
    });
  }
});
app.use((request, response, next) => {
  const key = request.ip ?? request.socket.remoteAddress ?? "unknown";
  const now = Date.now();
  const bucket = requestBuckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    requestBuckets.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    next();
    return;
  }

  bucket.count += 1;

  if (bucket.count > RATE_LIMIT_MAX_REQUESTS) {
    response.status(429).json({
      ok: false,
      error: "Limite de solicitudes excedido. Intenta de nuevo en unos segundos."
    });
    return;
  }

  next();
});

function enqueueOperation<T>(operation: () => Promise<T>): Promise<T> {
  const nextOperation = operationQueue.then(() => withFileLock(operation), () => withFileLock(operation));
  operationQueue = nextOperation.then(() => undefined, () => undefined);
  return nextOperation;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function withFileLock<T>(operation: () => Promise<T>): Promise<T> {
  const startedAt = Date.now();
  let lockHandle: fs.FileHandle | undefined;

  while (!lockHandle) {
    try {
      lockHandle = await fs.open(lockPath, "wx");
      await lockHandle.writeFile(JSON.stringify({
        pid: process.pid,
        createdAt: new Date().toISOString()
      }), "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
        throw error;
      }

      try {
        const stat = await fs.stat(lockPath);

        if (Date.now() - stat.mtimeMs > STALE_LOCK_MS) {
          await fs.rm(lockPath, { force: true });
          continue;
        }
      } catch {
        continue;
      }

      if (Date.now() - startedAt > LOCK_TIMEOUT_MS) {
        throw new Error("LOCK_TIMEOUT: otro proceso mantiene bloqueado el contenedor T-BIT.");
      }

      await sleep(LOCK_RETRY_MS);
    }
  }

  try {
    return await operation();
  } finally {
    await lockHandle.close();
    await fs.rm(lockPath, { force: true });
  }
}
/**
 * Guard de instancia unica del servidor (portabilidad Tanda 3).
 *
 * La exclusion mutua del indice de memoria (`withIndexWriteLock` en memoryCore)
 * es SOLO intraproceso: si dos procesos de servidor apuntaran al mismo
 * almacenamiento, las escrituras de los indices JSON podrian interleavarse.
 * Este guard impide ese escenario: solo un proceso de servidor puede activarse
 * sobre un mismo directorio de trabajo/almacenamiento.
 *
 * Multiplataforma por construccion: usa creacion exclusiva (`wx`, equivalente a
 * O_EXCL en POSIX y Windows), deteccion de lock huerfano por mtime y `rmSync`,
 * sin comandos de shell ni APIs especificas de un sistema operativo.
 */
const SERVER_INSTANCE_LOCK_PATH = resolve(process.cwd(), "data", "server-instance.lock");
let serverInstanceLockHandle: fs.FileHandle | undefined;

function releaseServerInstanceLockSync(): void {
  if (!serverInstanceLockHandle) return;
  serverInstanceLockHandle = undefined;
  try {
    rmSync(SERVER_INSTANCE_LOCK_PATH, { force: true });
  } catch {
    // El lock huerfano se reclama por antiguedad (STALE_LOCK_MS) en el proximo arranque.
  }
}

async function acquireServerInstanceLock(): Promise<void> {
  await fs.mkdir(dirname(SERVER_INSTANCE_LOCK_PATH), { recursive: true });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      serverInstanceLockHandle = await fs.open(SERVER_INSTANCE_LOCK_PATH, "wx");
      await serverInstanceLockHandle.writeFile(
        JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }),
        "utf8",
      );
      process.once("exit", releaseServerInstanceLockSync);
      for (const signal of ["SIGINT", "SIGTERM"] as const) {
        process.once(signal, () => {
          releaseServerInstanceLockSync();
          process.exit(0);
        });
      }
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
        throw error;
      }

      // Este lock se retiene durante TODA la vida del servidor, por lo que la
      // antiguedad (mtime) no indica huerfandad: un servidor sano puede llevar
      // horas activo. La vitalidad del titular se comprueba por PID (senal 0).
      let holderAlive = false;
      try {
        const raw = await fs.readFile(SERVER_INSTANCE_LOCK_PATH, "utf8");
        const holderPid = Number((JSON.parse(raw) as { pid?: number }).pid);
        if (Number.isFinite(holderPid) && holderPid > 0 && holderPid !== process.pid) {
          try {
            process.kill(holderPid, 0);
            holderAlive = true;
          } catch (killError) {
            holderAlive = (killError as NodeJS.ErrnoException).code === "EPERM";
          }
        }
      } catch {
        holderAlive = false;
      }

      if (holderAlive) {
        break;
      }

      // Lock huerfano (proceso titular muerto o archivo ilegible): se reclama.
      await fs.rm(SERVER_INSTANCE_LOCK_PATH, { force: true });
    }
  }

  throw new Error(
    "SERVER_ALREADY_RUNNING: ya existe un proceso T-BIT API sobre este almacenamiento. " +
      "La exclusion mutua del indice es intraproceso; no lance multiples servidores sobre el mismo vault.",
  );
}


function loadLocalEnv(): void {
  const envPath = resolve(process.cwd(), ".env");

  if (!existsSync(envPath)) {
    return;
  }

  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    const value = rawValue.replace(/^["']|["']$/g, "");

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function loadHmacSecrets(): Map<string, string> {
  const currentSecret = process.env.TBIT_HMAC_SECRET;

  if (!currentSecret || currentSecret.length < 32) {
    throw new Error("Configura TBIT_HMAC_SECRET con al menos 32 caracteres aleatorios antes de iniciar la API.");
  }

  const secrets = new Map<string, string>([[HMAC_KEY_ID, currentSecret]]);
  const previousSecrets = process.env.TBIT_HMAC_PREVIOUS_SECRETS;

  if (previousSecrets) {
    for (const pair of previousSecrets.split(",")) {
      const separatorIndex = pair.indexOf(":");

      if (separatorIndex <= 0) {
        throw new Error("Formato invalido en TBIT_HMAC_PREVIOUS_SECRETS. Usa keyId:secret,keyId2:secret2.");
      }

      const keyId = pair.slice(0, separatorIndex).trim();
      const secret = pair.slice(separatorIndex + 1).trim();

      if (!keyId || secret.length < 32) {
        throw new Error("Cada secreto anterior debe tener keyId y al menos 32 caracteres.");
      }

      secrets.set(keyId, secret);
    }
  }

  return secrets;
}

function loadApiKey(): string {
  const apiKey = process.env.TBIT_API_KEY;

  if (!apiKey || apiKey.length < 24) {
    throw new Error("Configura TBIT_API_KEY con al menos 24 caracteres aleatorios antes de iniciar la API.");
  }

  return apiKey;
}

async function ensureContainer(): Promise<void> {
  if (!existsSync(containerPath)) {
    await container.initContainer(DEFAULT_CONTAINER_SIZE_MB);
  }
}

function mainContainerSizeBytes(): number {
  try {
    if (existsSync(containerPath)) {
      return statSync(containerPath).size;
    }
  } catch {
    // Fall back to configured boot size; health endpoints will report filesystem errors separately.
  }

  return DEFAULT_CONTAINER_SIZE_BYTES;
}

function usableContainerBytes(): number {
  return mainContainerSizeBytes() - SYSTEM_HEADER_SIZE;
}

function maxRecordsForMainContainer(): number {
  const sizeMb = Math.max(1, Math.floor(mainContainerSizeBytes() / (1024 * 1024)));
  return Math.min(
    ABSOLUTE_MAX_RECORDS,
    Math.max(MIN_DYNAMIC_MAX_RECORDS, sizeMb * RECORDS_PER_CONTAINER_MB)
  );
}

async function readMetadata(): Promise<Metadata> {
  try {
    const raw = await fs.readFile(metadataPath, "utf8");
    const parsed = JSON.parse(raw) as Record<string, Partial<MetadataEntry>>;
    const metadata: Metadata = {};

    for (const [clave, entry] of Object.entries(parsed)) {
      if (!entry.length || !Number.isInteger(entry.length)) {
        continue;
      }

      const projection = entry.offsetV === undefined || entry.offsetAntiV === undefined
        ? await container.calculateProjection(clave)
        : {
            offsetV: entry.offsetV,
            offsetAntiV: entry.offsetAntiV
          };

      metadata[clave] = {
        length: entry.length,
        physicalLength: entry.physicalLength,
        updatedAt: entry.updatedAt ?? new Date(0).toISOString(),
        offsetV: projection.offsetV,
        offsetAntiV: projection.offsetAntiV,
        dataHash: entry.dataHash ?? "",
        authTag: entry.authTag ?? "",
        authKeyId: entry.authKeyId ?? "",
        authVersion: entry.authVersion === 2 ? 2 : 1,
        encryption: entry.encryption === "AES-256-GCM" ? "AES-256-GCM" : "none",
        encryptionKeyId: typeof entry.encryptionKeyId === "string" ? entry.encryptionKeyId : undefined,
        probingAttempts: entry.probingAttempts ?? 0
      };
    }

    return metadata;
  } catch {
    return {};
  }
}

async function writeMetadata(metadata: Metadata): Promise<void> {
  const tempPath = `${metadataPath}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(metadata, null, 2), "utf8");
  await fs.rename(tempPath, metadataPath);
}

async function appendWal(record: WalRecord): Promise<void> {
  await fs.appendFile(walPath, `${JSON.stringify(record)}\n`, "utf8");
}

async function beginWal(
  operation: WalRecord["operation"],
  clave: string,
  length?: number,
  physicalLength?: number,
  offsetV?: number,
  offsetAntiV?: number
): Promise<string> {
  const id = createHash("sha256")
    .update(`${operation}:${clave}:${Date.now()}:${Math.random()}`)
    .digest("hex");

  await appendWal({
    id,
    state: "PENDING",
    operation,
    clave,
    length,
    physicalLength,
    offsetV,
    offsetAntiV,
    createdAt: new Date().toISOString()
  });

  return id;
}

async function finishWal(
  id: string,
  operation: WalRecord["operation"],
  clave: string,
  state: Exclude<WalState, "PENDING">,
  length?: number,
  physicalLength?: number,
  offsetV?: number,
  offsetAntiV?: number,
  error?: string
): Promise<void> {
  await appendWal({
    id,
    state,
    operation,
    clave,
    length,
    physicalLength,
    offsetV,
    offsetAntiV,
    error,
    createdAt: new Date().toISOString()
  });
}

async function startupRecovery(): Promise<void> {
  await ensureContainer();

  let rawWal = "";

  try {
    rawWal = await fs.readFile(walPath, "utf8");
  } catch {
    return;
  }

  const records = rawWal
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as WalRecord);
  const recordsById = new Map<string, WalRecord[]>();

  for (const record of records) {
    recordsById.set(record.id, [...(recordsById.get(record.id) ?? []), record]);
  }

  const metadata = await readMetadata();
  let metadataChanged = false;

  for (const [id, groupedRecords] of recordsById) {
    const latest = groupedRecords[groupedRecords.length - 1];

    if (latest.state !== "PENDING") {
      continue;
    }

    if (
      latest.offsetV !== undefined
      && latest.offsetAntiV !== undefined
      && latest.physicalLength !== undefined
    ) {
      try {
        await container.zeroFillAtOffsets(latest.offsetV, latest.offsetAntiV, latest.physicalLength);
      } catch {
        // Recovery must continue scanning other WAL entries.
      }
    }

    if (metadata[latest.clave]) {
      delete metadata[latest.clave];
      metadataChanged = true;
    }

    await finishWal(
      id,
      latest.operation,
      latest.clave,
      "ABORTED",
      latest.length,
      latest.physicalLength,
      latest.offsetV,
      latest.offsetAntiV,
      "Recovery automatico al iniciar: operacion pendiente anulada."
    );
  }

  if (metadataChanged) {
    await writeMetadata(metadata);
  }
}

function validateText(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${fieldName} debe ser texto no vacio.`);
  }

  return normalizeUnicodeText(value.trim());
}

function hashData(dato: string): string {
  return createHash("sha256").update(normalizeUnicodeText(dato), "utf8").digest("hex");
}

type SpaceTarget = "universo" | "ai_memoria";
type SpacePrepareMode = "keep" | "overwrite";

type SpaceStatus = {
  target: SpaceTarget;
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

function normalizeSpaceTarget(value: unknown): SpaceTarget | "both" {
  if (value === "universo" || value === "ai_memoria" || value === "both") return value;
  return "both";
}

function normalizeSpacePrepareMode(value: unknown): SpacePrepareMode {
  return value === "overwrite" ? "overwrite" : "keep";
}

function bytesToRoundedMb(bytes: number): number {
  return Math.round((bytes / (1024 * 1024)) * 100) / 100;
}

async function countMetadataRecords(filePath: string): Promise<number> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return parsed && typeof parsed === "object" ? Object.keys(parsed).length : 0;
  } catch {
    return 0;
  }
}

async function readSpaceStatus(target: SpaceTarget, requestedSizeMB?: number): Promise<SpaceStatus> {
  const targetPath = target === "universo" ? containerPath : aiContainerPath;
  const targetMetadataPath = target === "universo" ? metadataPath : aiMetadataPath;
  const exists = existsSync(targetPath);
  const sizeBytes = exists ? statSync(targetPath).size : 0;
  const sizeMB = bytesToRoundedMb(sizeBytes);
  const metadataRecords = await countMetadataRecords(targetMetadataPath);
  const requested = requestedSizeMB && Number.isFinite(requestedSizeMB) ? Math.max(1, Math.round(requestedSizeMB)) : undefined;
  const mismatched = Boolean(exists && requested && Math.round(sizeBytes / (1024 * 1024)) !== requested);

  return {
    target,
    exists,
    path: targetPath,
    metadataPath: targetMetadataPath,
    sizeBytes,
    sizeMB,
    requestedSizeMB: requested,
    metadataRecords,
    status: !exists ? "MISSING" : mismatched ? "EXISTS_SIZE_MISMATCH" : "READY",
    warning: mismatched
      ? `Ya existe ${target}.tbit de ${sizeMB} MB; no se sobrescribio con ${requested} MB para proteger datos existentes.`
      : undefined
  };
}

async function resetSpaceSidecars(target: SpaceTarget): Promise<void> {
  const targetMetadataPath = target === "universo" ? metadataPath : aiMetadataPath;
  const targetWalPath = target === "universo" ? walPath : aiWalPath;
  await fs.mkdir(resolve(targetMetadataPath, ".."), { recursive: true });
  await fs.writeFile(targetMetadataPath, "{}", "utf8");
  await fs.writeFile(targetWalPath, "", "utf8");

  if (target === "ai_memoria") {
    await fs.mkdir(resolve(process.cwd(), "data"), { recursive: true });
    await fs.writeFile(aiMemoryIndexPath, JSON.stringify({ version: "memory-core-v1", records: {} }, null, 2), "utf8");
    await fs.writeFile(aiQueryIndexPath, JSON.stringify({
      version: "tbit-query-index-v1",
      builtAt: new Date().toISOString(),
      sourceFingerprint: "",
      totalRecords: 0,
      entries: {},
      byUser: {},
      bySource: {},
      byTag: {},
      byToken: {},
      byDocument: {},
      byDate: {},
      byAttribute: {}
    }, null, 2), "utf8");
    await fs.writeFile(aiAssetIndexPath, JSON.stringify({ version: "tbit-asset-index-v1", assets: {} }, null, 2), "utf8");
    await fs.writeFile(aiSemanticIndexPath, JSON.stringify({
      version: "tbit-semantic-index-v1",
      builtAt: new Date().toISOString(),
      sourceFingerprint: "",
      model: "tbit-local-hash-embedding-v1",
      dimensions: 192,
      entries: {}
    }, null, 2), "utf8");
  }
}

async function prepareSpaceTarget(target: SpaceTarget, requestedSizeMB: number, mode: SpacePrepareMode): Promise<SpaceStatus> {
  const before = await readSpaceStatus(target, requestedSizeMB);
  if (before.exists && mode !== "overwrite" && before.status !== "EXISTS_SIZE_MISMATCH") return before;
  if (before.exists && before.metadataRecords > 0 && mode !== "overwrite") return before;

  if (target === "ai_memoria") {
    await fs.mkdir(resolve(process.cwd(), "data"), { recursive: true });
    await aiStorage.reinitializeContainer(requestedSizeMB);
  } else {
    await new TBitContainer(containerPath).initContainer(requestedSizeMB);
    await container.reloadFromDisk();
  }
  await resetSpaceSidecars(target);

  return readSpaceStatus(target, requestedSizeMB);
}

async function hashFile(filePath: string): Promise<string> {
  const content = await fs.readFile(filePath);
  return createHash("sha256").update(content).digest("hex");
}

async function createSnapshot(label = "manual"): Promise<{ id: string; checksum: string }> {
  await ensureContainer();
  await fs.mkdir(snapshotsDir, { recursive: true });

  const safeLabel = label.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40) || "manual";
  const id = `${new Date().toISOString().replace(/[:.]/g, "-")}_${safeLabel}`;
  const snapshotContainer = resolve(snapshotsDir, `${id}.tbit`);
  const snapshotMetadata = resolve(snapshotsDir, `${id}.meta.json`);

  await fs.copyFile(containerPath, snapshotContainer);

  if (existsSync(metadataPath)) {
    await fs.copyFile(metadataPath, snapshotMetadata);
  } else {
    await fs.writeFile(snapshotMetadata, "{}", "utf8");
  }

  const checksum = await hashFile(snapshotContainer);
  await fs.writeFile(
    resolve(snapshotsDir, `${id}.manifest.json`),
    JSON.stringify({
      id,
      label,
      checksum,
      createdAt: new Date().toISOString()
    }, null, 2),
    "utf8"
  );

  return { id, checksum };
}

async function rollbackSnapshot(id: string): Promise<void> {
  const safeId = id.replace(/[^a-zA-Z0-9_.-]/g, "");
  const snapshotContainer = resolve(snapshotsDir, `${safeId}.tbit`);
  const snapshotMetadata = resolve(snapshotsDir, `${safeId}.meta.json`);

  if (!existsSync(snapshotContainer)) {
    throw new Error("Snapshot no encontrado.");
  }

  await fs.copyFile(snapshotContainer, containerPath);

  if (existsSync(snapshotMetadata)) {
    await fs.copyFile(snapshotMetadata, metadataPath);
  } else {
    await fs.writeFile(metadataPath, "{}", "utf8");
  }
}

async function globalChecksum(): Promise<{ containerHash: string; metadataHash: string; combinedHash: string }> {
  await ensureContainer();

  const containerHash = await hashFile(containerPath);
  const metadataHash = existsSync(metadataPath) ? await hashFile(metadataPath) : hashData("{}");
  const combinedHash = createHash("sha256")
    .update(containerHash)
    .update(metadataHash)
    .digest("hex");

  return { containerHash, metadataHash, combinedHash };
}

async function updateLocalReplica(): Promise<void> {
  await ensureContainer();
  await fs.mkdir(replicasDir, { recursive: true });

  if (existsSync(metadataPath)) {
    await fs.copyFile(metadataPath, resolve(replicasDir, "universo.tbit.meta.json"));
  }

  await fs.writeFile(
    resolve(replicasDir, "universo.replica-manifest.json"),
    JSON.stringify({
      updatedAt: new Date().toISOString(),
      mode: "LIGHTWEIGHT_LOCAL_REPLICA",
      note: "Las escrituras normales solo replican metadata/manifest para evitar copiar contenedores grandes en cada operacion. Use snapshot/export para una copia fisica completa verificable."
    }, null, 2),
    "utf8"
  );

  if (REMOTE_REPLICA_DIR) {
    await fs.mkdir(REMOTE_REPLICA_DIR, { recursive: true });
    await fs.copyFile(containerPath, resolve(REMOTE_REPLICA_DIR, "universo.tbit"));

    if (existsSync(metadataPath)) {
      await fs.copyFile(metadataPath, resolve(REMOTE_REPLICA_DIR, "universo.tbit.meta.json"));
    }

    if (existsSync(walPath)) {
      await fs.copyFile(walPath, resolve(REMOTE_REPLICA_DIR, "universo.tbit.wal.jsonl"));
    }

    const checksum = await globalChecksum();
    await fs.writeFile(
      resolve(REMOTE_REPLICA_DIR, "replica-manifest.json"),
      JSON.stringify({
        updatedAt: new Date().toISOString(),
        ...checksum
      }, null, 2),
      "utf8"
    );
  }
}

async function exportBundle(label = "manual"): Promise<{ id: string; manifestPath: string; combinedHash: string }> {
  await ensureContainer();
  await fs.mkdir(exportsDir, { recursive: true });

  const safeLabel = label.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40) || "manual";
  const id = `${new Date().toISOString().replace(/[:.]/g, "-")}_${safeLabel}`;
  const bundleDir = resolve(exportsDir, id);

  await fs.mkdir(bundleDir, { recursive: true });
  await fs.copyFile(containerPath, resolve(bundleDir, "universo.tbit"));

  if (existsSync(metadataPath)) {
    await fs.copyFile(metadataPath, resolve(bundleDir, "universo.tbit.meta.json"));
  } else {
    await fs.writeFile(resolve(bundleDir, "universo.tbit.meta.json"), "{}", "utf8");
  }

  if (existsSync(walPath)) {
    await fs.copyFile(walPath, resolve(bundleDir, "universo.tbit.wal.jsonl"));
  } else {
    await fs.writeFile(resolve(bundleDir, "universo.tbit.wal.jsonl"), "", "utf8");
  }

  const containerHash = await hashFile(resolve(bundleDir, "universo.tbit"));
  const metadataHash = await hashFile(resolve(bundleDir, "universo.tbit.meta.json"));
  const walHash = await hashFile(resolve(bundleDir, "universo.tbit.wal.jsonl"));
  const combinedHash = createHash("sha256")
    .update(containerHash)
    .update(metadataHash)
    .update(walHash)
    .digest("hex");
  const manifestPath = resolve(bundleDir, "manifest.json");

  await fs.writeFile(manifestPath, JSON.stringify({
    id,
    label,
    createdAt: new Date().toISOString(),
    files: {
      "universo.tbit": containerHash,
      "universo.tbit.meta.json": metadataHash,
      "universo.tbit.wal.jsonl": walHash
    },
    combinedHash
  }, null, 2), "utf8");

  return { id, manifestPath, combinedHash };
}

async function importBundle(id: string): Promise<{ id: string; combinedHash: string }> {
  const safeId = id.replace(/[^a-zA-Z0-9_.-]/g, "");
  const bundleDir = resolve(exportsDir, safeId);
  const manifestPath = resolve(bundleDir, "manifest.json");

  if (!existsSync(manifestPath)) {
    throw new Error("Bundle de exportacion no encontrado.");
  }

  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as {
    combinedHash: string;
    files: Record<string, string>;
  };

  for (const [fileName, expectedHash] of Object.entries(manifest.files)) {
    const actualHash = await hashFile(resolve(bundleDir, fileName));

    if (actualHash !== expectedHash) {
      throw new Error(`IMPORT_VERIFICATION_FAILED: checksum invalido para ${fileName}.`);
    }
  }

  const combinedHash = createHash("sha256")
    .update(manifest.files["universo.tbit"])
    .update(manifest.files["universo.tbit.meta.json"])
    .update(manifest.files["universo.tbit.wal.jsonl"])
    .digest("hex");

  if (combinedHash !== manifest.combinedHash) {
    throw new Error("IMPORT_VERIFICATION_FAILED: manifest combinado invalido.");
  }

  await fs.copyFile(resolve(bundleDir, "universo.tbit"), containerPath);
  await fs.copyFile(resolve(bundleDir, "universo.tbit.meta.json"), metadataPath);
  await fs.copyFile(resolve(bundleDir, "universo.tbit.wal.jsonl"), walPath);
  await updateLocalReplica();

  return { id: safeId, combinedHash };
}

function signMetadata(clave: string, entry: Omit<MetadataEntry, "authTag">): string {
  const secret = HMAC_SECRETS.get(entry.authKeyId);

  if (!secret) {
    throw new Error(`HMAC key '${entry.authKeyId}' no esta disponible.`);
  }

  return createHmac("sha256", secret)
    .update(normalizeTBitKey(clave))
    .update("\0")
    .update(String(entry.length))
    .update("\0")
    .update(entry.updatedAt)
    .update("\0")
    .update(String(entry.offsetV))
    .update("\0")
    .update(String(entry.offsetAntiV))
    .update("\0")
    .update(entry.dataHash)
    .update("\0")
    .update(String(entry.probingAttempts ?? 0))
    .update(entry.authVersion === 2 ? `\0${entry.physicalLength ?? 0}\0${entry.encryption ?? "none"}` : "")
    .digest("hex");
}

function assertMetadataSignature(clave: string, entry: MetadataEntry): void {
  if (!entry.authTag || !entry.authKeyId) {
    throw new Error("INTEGRIDAD CRIPTOGRAFICA NO DISPONIBLE: registro sin HMAC.");
  }

  const expected = signMetadata(clave, {
    length: entry.length,
    physicalLength: entry.physicalLength,
    updatedAt: entry.updatedAt,
    offsetV: entry.offsetV,
    offsetAntiV: entry.offsetAntiV,
    dataHash: entry.dataHash,
    authKeyId: entry.authKeyId,
    authVersion: entry.authVersion,
    encryption: entry.encryption,
    probingAttempts: entry.probingAttempts
  });

  const expectedBuffer = Buffer.from(expected, "hex");
  const actualBuffer = Buffer.from(entry.authTag, "hex");

  if (expectedBuffer.length !== actualBuffer.length || !timingSafeEqual(expectedBuffer, actualBuffer)) {
    throw new Error("CORRUPCION DE INTEGRIDAD: firma HMAC invalida.");
  }
}

function validateDatoSize(dato: string): number {
  const length = Buffer.byteLength(dato, "utf8");

  if (length > MAX_DATO_BYTES) {
    throw new Error(`El dato excede el limite del MVP (${MAX_DATO_BYTES} bytes).`);
  }

  return length;
}

function circularIntervals(startOffset: number, length: number, sizeInBytes: number): Array<[number, number]> {
  const endOffset = startOffset + length;

  if (endOffset <= sizeInBytes) {
    return [[startOffset, endOffset]];
  }

  return [
    [startOffset, sizeInBytes],
    [0, endOffset % sizeInBytes]
  ];
}

function intervalsOverlap(left: Array<[number, number]>, right: Array<[number, number]>): boolean {
  return left.some(([leftStart, leftEnd]) => (
    right.some(([rightStart, rightEnd]) => Math.max(leftStart, rightStart) < Math.min(leftEnd, rightEnd))
  ));
}

function assertNoMetadataCollision(
  metadata: Metadata,
  clave: string,
  offsetV: number,
  offsetAntiV: number,
  frameLength: number
): void {
  const allocationMap = new AllocationMap(SYSTEM_HEADER_SIZE, mainContainerSizeBytes());
  const regions = Object.entries(metadata).map(([existingKey, entry]) => ({
    clave: existingKey,
    ranges: [
      ...allocationMap.circularRanges(entry.offsetV, entry.physicalLength ?? entry.length + FRAME_HEADER_SIZE),
      ...allocationMap.circularRanges(entry.offsetAntiV, entry.physicalLength ?? entry.length + FRAME_HEADER_SIZE)
    ] as AllocationRange[]
  }));
  const candidateRanges = [
    ...allocationMap.circularRanges(offsetV, frameLength),
    ...allocationMap.circularRanges(offsetAntiV, frameLength)
  ];

  allocationMap.load(regions);

  if (!allocationMap.canAllocate(clave, candidateRanges)) {
    throw new Error("COLISION FISICA: la clave colisiona con una region ocupada.");
  }
}

function buildAllocationMap(metadata: Metadata): AllocationMap {
  const allocationMap = new AllocationMap(SYSTEM_HEADER_SIZE, mainContainerSizeBytes());
  allocationMap.load(Object.entries(metadata).map(([clave, entry]) => ({
    clave,
    ranges: [
      ...allocationMap.circularRanges(entry.offsetV, entry.physicalLength ?? entry.length + FRAME_HEADER_SIZE),
      ...allocationMap.circularRanges(entry.offsetAntiV, entry.physicalLength ?? entry.length + FRAME_HEADER_SIZE)
    ]
  })));
  return allocationMap;
}

function deriveProbeStep(clave: string): number {
  const digest = createHash("sha256").update("probe").update(clave).digest();
  const raw = digest.readUInt32LE(0);
  const usableBytes = usableContainerBytes();
  const step = (raw % Math.max(1, usableBytes - 1)) + 1;
  return step % 2 === 0 ? step + 1 : step;
}

function normalizeUsableOffset(offset: number): number {
  const usableBytes = usableContainerBytes();
  return SYSTEM_HEADER_SIZE + ((offset - SYSTEM_HEADER_SIZE) % usableBytes + usableBytes) % usableBytes;
}

function findAllocatableOffsets(
  metadata: Metadata,
  clave: string,
  primaryOffsetV: number,
  frameLength: number
): { offsetV: number; offsetAntiV: number; probingAttempts: number } {
  const allocationMap = buildAllocationMap(metadata);
  const step = deriveProbeStep(clave);

  for (let attempt = 0; attempt < MAX_PROBING_ATTEMPTS; attempt += 1) {
    const offsetV = normalizeUsableOffset(primaryOffsetV + attempt * step);
    const relative = offsetV - SYSTEM_HEADER_SIZE;
    const usableBytes = usableContainerBytes();
    const offsetAntiV = SYSTEM_HEADER_SIZE + ((usableBytes - relative) % usableBytes);
    const candidateRanges = [
      ...allocationMap.circularRanges(offsetV, frameLength),
      ...allocationMap.circularRanges(offsetAntiV, frameLength)
    ];

    if (allocationMap.canAllocate(clave, candidateRanges)) {
      return { offsetV, offsetAntiV, probingAttempts: attempt };
    }
  }

  throw new Error("SIN_ESPACIO_CONTIGUO: no se encontro region libre tras probing determinista.");
}

app.post("/api/inyectar", async (request: Request, response: Response) => {
  try {
    await enqueueOperation(async () => {
      await ensureContainer();

      const clave = validateText(request.body?.clave, "clave");
      const dato = validateText(request.body?.dato, "dato");
      const length = validateDatoSize(dato);
      const physicalLength = container.calculateStorageLength(dato);
      const primaryProjection = await container.calculateProjection(clave);
      const metadata = await readMetadata();
      let walId = "";

      try {
        const maxRecords = maxRecordsForMainContainer();
        if (!metadata[clave] && Object.keys(metadata).length >= maxRecords) {
          throw new Error(`CUOTA_EXCEDIDA: limite de ${maxRecords} registros activos alcanzado.`);
        }

        const allocation = findAllocatableOffsets(metadata, clave, primaryProjection.offsetV, physicalLength);
        walId = await beginWal("INYECTAR", clave, length, physicalLength, allocation.offsetV, allocation.offsetAntiV);

        if (metadata[clave]) {
          try {
            await container.destroyAtOffsets(metadata[clave].offsetV, metadata[clave].offsetAntiV, metadata[clave].length);
          } catch (error) {
            const message = error instanceof Error ? error.message : "";

            if (!message.includes("FRAME T-BIT NO ENCONTRADO")) {
              throw error;
            }
          }
        }

        await container.writeAtOffsets(allocation.offsetV, allocation.offsetAntiV, dato);
        const assignedProjection = await container.calculateProjectionFromOffsets(
          allocation.offsetV,
          allocation.offsetAntiV
        );

        const metadataEntry: Omit<MetadataEntry, "authTag"> = {
          length,
          physicalLength,
          updatedAt: new Date().toISOString(),
          offsetV: allocation.offsetV,
          offsetAntiV: allocation.offsetAntiV,
          dataHash: hashData(dato),
          authKeyId: HMAC_KEY_ID,
          authVersion: 2,
          encryption: container.getPayloadEncryptionStatus().enabled ? "AES-256-GCM" : "none",
          encryptionKeyId: container.getPayloadEncryptionStatus().activeKeyId,
          probingAttempts: allocation.probingAttempts
        };

        metadata[clave] = {
          ...metadataEntry,
          authTag: signMetadata(clave, metadataEntry)
        };
        await writeMetadata(metadata);
        await updateLocalReplica();
        await finishWal(walId, "INYECTAR", clave, "COMMITTED", length, physicalLength, allocation.offsetV, allocation.offsetAntiV);

        response.status(200).json({
          ok: true,
          status: "ESCRITURA_FISICA_CONFIRMADA",
          clave,
          length,
          offsetV: allocation.offsetV,
          offsetAntiV: allocation.offsetAntiV,
          probingAttempts: allocation.probingAttempts,
          coordinates: assignedProjection.coordinates,
          antiCoordinates: assignedProjection.antiCoordinates
        });
      } catch (error) {
        if (walId) {
          await finishWal(
            walId,
            "INYECTAR",
            clave,
            "ABORTED",
            length,
            physicalLength,
            undefined,
            undefined,
            error instanceof Error ? error.message : "Error desconocido"
          );
        }
        throw error;
      }
    });
  } catch (error) {
    response.status(400).json({
      ok: false,
      error: error instanceof Error ? error.message : "Error desconocido"
    });
  }
});

app.post("/api/recuperar", async (request: Request, response: Response) => {
  try {
    await enqueueOperation(async () => {
      await ensureContainer();

      const clave = validateText(request.body?.clave, "clave");
      const metadata = await readMetadata();
      const entry = metadata[clave];

      if (!entry) {
        response.status(404).json({
          ok: false,
          error: "Clave no registrada en el indice local."
        });
        return;
      }

      assertMetadataSignature(clave, entry);

      const dato = await container.readAtOffsets(entry.offsetV, entry.offsetAntiV, entry.length);
      const currentHash = hashData(dato);

      if (entry.dataHash && entry.dataHash !== currentHash) {
        response.status(409).json({
          ok: false,
          error: "CORRUPCION DE INTEGRIDAD: hash de metadata no coincide."
        });
        return;
      }

      const projection = await container.calculateProjectionFromOffsets(entry.offsetV, entry.offsetAntiV);

      response.status(200).json({
        ok: true,
        status: "INTEGRIDAD_CONFIRMADA",
        integridadValida: true,
        clave,
        dato,
        length: entry.length,
        offsetV: projection.offsetV,
        offsetAntiV: projection.offsetAntiV,
        coordinates: projection.coordinates,
        antiCoordinates: projection.antiCoordinates
      });
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    const status = message.includes("CORRUPCION") ? 409 : 400;

    response.status(status).json({
      ok: false,
      error: message
    });
  }
});

app.delete("/api/colapsar", async (request: Request, response: Response) => {
  try {
    await enqueueOperation(async () => {
      await ensureContainer();

      const clave = validateText(request.body?.clave, "clave");
      const metadata = await readMetadata();
      const entry = metadata[clave];

      if (!entry) {
        response.status(404).json({
          ok: false,
          error: "Clave no registrada en el indice local."
        });
        return;
      }

      assertMetadataSignature(clave, entry);

      const projection = await container.calculateProjectionFromOffsets(entry.offsetV, entry.offsetAntiV);
      const walId = await beginWal("COLAPSAR", clave, entry.length, entry.physicalLength, entry.offsetV, entry.offsetAntiV);

      try {
        await container.destroyAtOffsets(entry.offsetV, entry.offsetAntiV, entry.length);

        delete metadata[clave];
        await writeMetadata(metadata);
        await updateLocalReplica();
        await finishWal(walId, "COLAPSAR", clave, "COMMITTED", entry.length, entry.physicalLength, entry.offsetV, entry.offsetAntiV);
      } catch (error) {
        await finishWal(
          walId,
          "COLAPSAR",
          clave,
          "ABORTED",
          entry.length,
          entry.physicalLength,
          entry.offsetV,
          entry.offsetAntiV,
          error instanceof Error ? error.message : "Error desconocido"
        );
        throw error;
      }

      response.status(200).json({
        ok: true,
        status: "ANIQUILACION_EXITOSA",
        message: "Anulacion cuantica completada. Rastro eliminado.",
        clave,
        length: entry.length,
        offsetV: projection.offsetV,
        offsetAntiV: projection.offsetAntiV,
        coordinates: projection.coordinates,
        antiCoordinates: projection.antiCoordinates
      });
    });
  } catch (error) {
    response.status(400).json({
      ok: false,
      error: error instanceof Error ? error.message : "Error desconocido"
    });
  }
});

app.post("/api/snapshot", async (request: Request, response: Response) => {
  try {
    const label = typeof request.body?.label === "string" ? request.body.label : "manual";
    const snapshot = await enqueueOperation(() => createSnapshot(label));

    response.status(200).json({
      ok: true,
      status: "SNAPSHOT_CREADO",
      ...snapshot
    });
  } catch (error) {
    response.status(400).json({
      ok: false,
      error: error instanceof Error ? error.message : "Error desconocido"
    });
  }
});

app.post("/api/rollback", async (request: Request, response: Response) => {
  try {
    const id = validateText(request.body?.id, "id");

    await enqueueOperation(async () => {
      await rollbackSnapshot(id);
      await updateLocalReplica();
    });

    response.status(200).json({
      ok: true,
      status: "ROLLBACK_COMPLETADO",
      id
    });
  } catch (error) {
    response.status(400).json({
      ok: false,
      error: error instanceof Error ? error.message : "Error desconocido"
    });
  }
});

app.get("/api/auditoria/checksum", async (_request: Request, response: Response) => {
  try {
    const checksum = await enqueueOperation(() => globalChecksum());

    response.status(200).json({
      ok: true,
      status: "CHECKSUM_GLOBAL",
      ...checksum
    });
  } catch (error) {
    response.status(400).json({
      ok: false,
      error: error instanceof Error ? error.message : "Error desconocido"
    });
  }
});

app.post("/api/exportar", async (request: Request, response: Response) => {
  try {
    const label = typeof request.body?.label === "string" ? request.body.label : "manual";
    const exported = await enqueueOperation(() => exportBundle(label));

    response.status(200).json({
      ok: true,
      status: "EXPORT_VERIFICABLE_CREADO",
      ...exported
    });
  } catch (error) {
    response.status(400).json({
      ok: false,
      error: error instanceof Error ? error.message : "Error desconocido"
    });
  }
});

app.post("/api/importar", async (request: Request, response: Response) => {
  try {
    const id = validateText(request.body?.id, "id");
    const imported = await enqueueOperation(() => importBundle(id));

    response.status(200).json({
      ok: true,
      status: "IMPORT_VERIFICADO_COMPLETADO",
      ...imported
    });
  } catch (error) {
    response.status(400).json({
      ok: false,
      error: error instanceof Error ? error.message : "Error desconocido"
    });
  }
});

app.post("/api/ai/inject", async (request: Request, response: Response) => {
  try {
    const key = validateText(request.body?.key ?? request.body?.clave, "key");
    const payload = typeof request.body?.payload === "string"
      ? request.body.payload
      : JSON.stringify(request.body?.payload ?? request.body?.dato ?? "", null, 2);
    const dato = validateText(payload, "payload");
    const result = await aiStorage.inject(key, dato);

    response.status(200).json(result);
  } catch (error) {
    response.status(400).json({
      ok: false,
      error: error instanceof Error ? error.message : "Error desconocido"
    });
  }
});

app.post("/api/ai/oracle", async (request: Request, response: Response) => {
  try {
    const key = validateText(request.body?.key ?? request.body?.clave, "key");
    const result = await aiStorage.recoverData(key);

    response.status(200).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    const status = message.includes("CORRUPCION") ? 409 : 400;

    response.status(status).json({
      ok: false,
      error: message
    });
  }
});

startupRecovery()
  .then(() => aiStorage.recover())
  .then(() => acquireServerInstanceLock())
  .then(() => {
const requireSymbolicApiKey = (req: any, res: any, next: any) => {
  const expectedApiKey = process.env.TBIT_API_KEY ?? process.env.VITE_TBIT_API_KEY;
  if (!expectedApiKey) {
    res.status(503).json({
      ok: false,
      error: "API key local no configurada. Ejecuta npm run setup:secret.",
    });
    return;
  }

  const receivedApiKey = req.header("x-tbit-api-key");
  if (!safeApiKeyEquals(receivedApiKey, expectedApiKey)) {
    res.status(401).json({
      ok: false,
      error: "API key invalida para Oraculo Simbolico.",
    });
    return;
  }

  next();
};

type TBitSpaceInventoryItem = {
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

async function readSpaceManifest(paths: TBitSpacePaths): Promise<Partial<TBitSpaceManifest>> {
  try {
    return JSON.parse(await fs.readFile(paths.manifestPath, "utf8")) as Partial<TBitSpaceManifest>;
  } catch {
    return {};
  }
}

async function listUserSpaces(): Promise<TBitSpaceInventoryItem[]> {
  const root = getTBitSpacesRoot();
  await fs.mkdir(root, { recursive: true });
  const entries = await fs.readdir(root, { withFileTypes: true });
  const spaces: TBitSpaceInventoryItem[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const paths = getTBitSpacePaths(entry.name, REMOTE_REPLICA_DIR);
    const manifest = await readSpaceManifest(paths);
    let sizeBytes = 0;
    for (const filePath of [paths.containerPath, paths.aiContainerPath]) {
      try {
        sizeBytes += statSync(filePath).size;
      } catch {
        // Espacio listado pero aun sin contenedores fisicos.
      }
    }
    spaces.push({
      spaceId: paths.spaceId,
      label: manifest.label ?? `${manifest.displayName ?? paths.spaceId} Vault`,
      ownerUserId: manifest.ownerUserId ?? paths.spaceId,
      displayName: manifest.displayName ?? paths.spaceId,
      email: manifest.email,
      rootDir: paths.rootDir,
      active: paths.spaceId === activeSpaceId,
      sizeBytes,
      sizeMB: typeof manifest.sizeMB === "number" && Number.isFinite(manifest.sizeMB)
        ? manifest.sizeMB
        : Math.round((sizeBytes / (1024 * 1024)) * 100) / 100,
      createdAt: manifest.createdAt,
      updatedAt: manifest.updatedAt,
    });
  }

  return spaces.sort((a, b) => Number(b.active) - Number(a.active) || a.label.localeCompare(b.label));
}

app.get("/api/container/space", requireSymbolicApiKey, async (_req, res) => {
  try {
    const spaces = await Promise.all([
      readSpaceStatus("universo"),
      readSpaceStatus("ai_memoria")
    ]);
    res.json({
      ok: true,
      activeSpaceId,
      defaultSizeMB: DEFAULT_CONTAINER_SIZE_MB,
      defaultAiSizeMB: DEFAULT_AI_CONTAINER_SIZE_MB,
      spaces
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Fallo leyendo espacios T-BIT."
    });
  }
});

app.get("/api/container/spaces", requireSymbolicApiKey, async (_req, res) => {
  try {
    res.json({
      ok: true,
      activeSpaceId,
      spaces: await listUserSpaces(),
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Fallo listando espacios T-BIT.",
    });
  }
});

app.post("/api/container/space/activate", requireSymbolicApiKey, async (req, res) => {
  try {
    const rawSpaceId = typeof req.body?.spaceId === "string" ? req.body.spaceId.trim() : "";
    const requestedSpaceId = rawSpaceId ? normalizeTBitSpaceId(rawSpaceId) : "";
    if (!requestedSpaceId) {
      res.status(400).json({ ok: false, error: "spaceId requerido para activar una boveda T-BIT." });
      return;
    }

    const displayName = typeof req.body?.displayName === "string" ? normalizeUnicodeText(req.body.displayName) : requestedSpaceId;
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : undefined;
    await activateUserSpace(requestedSpaceId, displayName, email);

    res.json({
      ok: true,
      activeSpaceId,
      spaces: await listUserSpaces(),
      status: "SPACE_ACTIVATED",
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Fallo activando espacio T-BIT.",
    });
  }
});

app.delete("/api/container/spaces", requireSymbolicApiKey, async (req, res) => {
  try {
    const requested = Array.isArray(req.body?.spaceIds) ? req.body.spaceIds : [];
    const confirmation = String(req.body?.confirmation ?? "");
    const normalizedIds = requested.map((spaceId: unknown) => normalizeTBitSpaceId(String(spaceId))).filter(Boolean);

    if (confirmation !== "ELIMINAR") {
      res.status(400).json({ ok: false, error: "Confirmacion requerida: escribe ELIMINAR." });
      return;
    }

    if (normalizedIds.length === 0) {
      res.status(400).json({ ok: false, error: "Selecciona al menos un espacio T-BIT." });
      return;
    }

    if (normalizedIds.includes(activeSpaceId)) {
      res.status(409).json({ ok: false, error: "No se puede eliminar el espacio activo. Cambia de usuario/espacio antes de borrarlo." });
      return;
    }

    const root = getTBitSpacesRoot();
    const deleted: string[] = [];
    for (const spaceId of normalizedIds) {
      const paths = getTBitSpacePaths(spaceId, REMOTE_REPLICA_DIR);
      if (!paths.rootDir.startsWith(root)) throw new Error(`Ruta invalida para espacio ${spaceId}.`);
      await fs.rm(paths.rootDir, { recursive: true, force: true });
      deleted.push(spaceId);
    }

    res.json({
      ok: true,
      deleted,
      spaces: await listUserSpaces(),
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Fallo eliminando espacios T-BIT.",
    });
  }
});

app.post("/api/container/space/prepare", requireSymbolicApiKey, async (req, res) => {
  try {
    const target = normalizeSpaceTarget(req.body?.target);
    const mode = normalizeSpacePrepareMode(req.body?.mode);
    const requestedSizeMB = Math.min(
      MAX_CONTAINER_SIZE_MB,
      Math.max(MIN_CONTAINER_SIZE_MB, Math.round(Number(req.body?.sizeMb ?? req.body?.sizeMB ?? DEFAULT_CONTAINER_SIZE_MB))),
    );
    const rawUserId = typeof req.body?.userId === "string" ? req.body.userId.trim() : "";
    const requestedUserId = rawUserId ? normalizeTBitSpaceId(rawUserId) : "";
    const requestedDisplayName = normalizeUnicodeText(String(req.body?.displayName ?? requestedUserId));
    const requestedEmail = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : undefined;
    if (requestedUserId) {
      await activateUserSpace(requestedUserId, requestedDisplayName, requestedEmail);
    }
    const targets: SpaceTarget[] = target === "both" ? ["universo", "ai_memoria"] : [target];
    const spaces = await enqueueOperation(async () => {
      const preparedSpaces: SpaceStatus[] = [];

      for (const spaceTarget of targets) {
        preparedSpaces.push(await prepareSpaceTarget(spaceTarget, requestedSizeMB, mode));
      }

      return preparedSpaces;
    });
    if (requestedUserId) {
      await writeActiveSpaceManifest(requestedDisplayName, requestedUserId, requestedSizeMB, requestedEmail);
    }

    const warnings = spaces.flatMap((space) => space.warning ? [space.warning] : []);
    res.status(warnings.length > 0 ? 409 : 200).json({
      ok: warnings.length === 0,
      status: warnings.length > 0 ? "SPACE_EXISTS_REQUIRES_DECISION" : "SPACE_READY",
      requestedSizeMB,
      spaces,
      warnings
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Fallo preparando espacio T-BIT."
    });
  }
});

app.post("/api/ai/symbolic", requireSymbolicApiKey, async (req, res) => {
  try {
    const { key, text, operation, variable } = req.body ?? {};
    const result = await operarSimbolicamente(aiStorage, { key, text, operation, variable });
    res.status(result.ok ? 200 : 400).json(result);
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Error simbolico desconocido.",
    });
  }
});

const aiProviderRuntime = createAiProviderRuntime();
tbitChatToolExecutor = createTBitLocalToolExecutor(aiStorage);

function scopeAiToolArgsToUser(args: Record<string, unknown>, userId?: string): Record<string, unknown> {
  const scopedUserId = userId ? normalizeTBitKey(userId) : "";
  if (!scopedUserId) return args;

  const nextArgs: Record<string, unknown> = { ...args, userId: scopedUserId };
  if (typeof nextArgs.key === "string") {
    const normalizedKey = normalizeTBitKey(nextArgs.key);
    nextArgs.key = normalizedKey.startsWith("Usuario::")
      ? normalizedKey.replace(/^Usuario::/, `${scopedUserId}::`)
      : normalizedKey;
  }
  return nextArgs;
}

function aiProviderPublicView(runtime: AiProviderRuntime) {
  return {
    id: runtime.id,
    label: runtime.label,
    model: runtime.model,
    mode: runtime.mode,
    baseUrl: runtime.baseUrl,
  };
}

function providerConfigFromRequest(value: unknown): AiProviderRuntimeConfig | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const data = value as Record<string, unknown>;
  const id = typeof data.id === "string" ? data.id.trim() : "";
  if (!id) return undefined;
  return {
    id,
    apiKey: typeof data.apiKey === "string" ? data.apiKey.trim() : undefined,
    model: typeof data.model === "string" ? data.model.trim() : undefined,
    baseUrl: typeof data.baseUrl === "string" ? data.baseUrl.trim() : undefined,
  };
}

app.get("/api/ai/provider", requireSymbolicApiKey, async (_req, res) => {
  res.json({
    ok: true,
    provider: aiProviderPublicView(aiProviderRuntime),
  });
});

app.get("/api/ai/providers", requireSymbolicApiKey, async (_req, res) => {
  res.json({
    ok: true,
    activeProvider: aiProviderPublicView(aiProviderRuntime),
    providers: getAiProviderCatalog(),
  });
});

// Fase 65 — Salud de la cadena de failover de proveedores IA.
app.get("/api/ai/providers/health", requireSymbolicApiKey, async (_req, res) => {
  try {
    const chain = createFallbackProviderChain();
    res.json({
      ok: true,
      chainSize: chain.size,
      fallbackChainEnv: process.env.TBIT_AI_FALLBACK_CHAIN ?? null,
      providers: chain.getHealth(),
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Fallo leyendo la salud de proveedores IA.",
    });
  }
});

app.post("/api/ai/provider/test", requireSymbolicApiKey, async (req, res) => {
  try {
    const runtime = createAiProviderRuntimeFromConfig(providerConfigFromRequest(req.body?.provider));
    const response = await runtime.provider.generateWithTools({
      messages: [
        { role: "system", content: "Responde de forma breve para confirmar que el proveedor esta operativo." },
        { role: "user", content: "Di OK T-BIT." },
      ],
      toolChoice: "none",
    });

    res.json({
      ok: true,
      provider: aiProviderPublicView(runtime),
      sample: response.message.content ?? "OK",
    });
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : "No se pudo probar el proveedor IA.";
    const message = rawMessage.includes("TIMEOUT")
      ? `${rawMessage} Si usas Ollama, verifica que el servidor local este activo, que el modelo exista exactamente con ese nombre y que no este tardando en cargar.`
      : rawMessage.includes("fetch failed")
        ? `${rawMessage}. No se pudo conectar con la URL del proveedor. Verifica Base URL, puerto y que el servicio IA este activo.`
        : rawMessage;
    res.status(400).json({
      ok: false,
      error: message,
    });
  }
});

app.get("/api/security/encryption/status", requireSymbolicApiKey, async (_req, res) => {
  try {
    const status = getEncryptionKeyStatus();
    res.json({
      ok: true,
      encryption: {
        ...status,
        secretMaterialExposed: false,
      },
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Fallo leyendo estado de llaves AES-GCM.",
    });
  }
});

app.post("/api/security/encryption/migrate", requireSymbolicApiKey, async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(Number(req.body?.limit ?? 25), 100));
    const dryRun = req.body?.dryRun === true;
    const keys = await aiStorage.listKeys();
    const selectedKeys = keys.slice(0, limit);
    const migrated: string[] = [];
    const errors: Array<{ key: string; error: string }> = [];

    if (!dryRun) {
      for (const key of selectedKeys) {
        try {
          const recovered = await aiStorage.recoverData(key);
          await aiStorage.inject(key, recovered.dato);
          migrated.push(key);
        } catch (error) {
          errors.push({
            key,
            error: error instanceof Error ? error.message : "Fallo migrando registro.",
          });
        }
      }
    }

    res.json({
      ok: errors.length === 0,
      status: dryRun ? "MIGRATION_DRY_RUN" : "MIGRATION_COMPLETED",
      storage: "ai_memoria",
      activeKeyId: getEncryptionKeyStatus().activeKeyId,
      scanned: selectedKeys.length,
      migrated: dryRun ? [] : migrated,
      pendingAfterLimit: Math.max(0, keys.length - selectedKeys.length),
      errors,
      note: "La migracion reescribe memorias IA con la llave AES-GCM activa. Para leer registros antiguos, configure TBIT_ENCRYPTION_PREVIOUS_SECRETS antes de migrar.",
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Fallo migrando llaves AES-GCM.",
    });
  }
});

app.post("/api/web/research", requireSymbolicApiKey, async (req, res) => {
  try {
    const url = typeof req.body?.url === "string" ? req.body.url : "";
    const query = typeof req.body?.query === "string" ? req.body.query : undefined;
    const maxBytes = typeof req.body?.maxBytes === "number" ? req.body.maxBytes : undefined;
    const maxTextChars = typeof req.body?.maxTextChars === "number" ? req.body.maxTextChars : undefined;
    const maxLinks = typeof req.body?.maxLinks === "number" ? req.body.maxLinks : undefined;

    if (!url.trim()) {
      res.status(400).json({ ok: false, error: "URL requerida para investigacion web." });
      return;
    }

    const result = await researchWebPage({
      url,
      query,
      mode: "assisted",
      maxBytes,
      maxTextChars,
      maxLinks,
    });

    res.json({ ok: true, result });
  } catch (error) {
    res.status(400).json({
      ok: false,
      error: error instanceof Error ? error.message : "Fallo ejecutando T-BIT Web Research Tool.",
    });
  }
});

app.post("/api/ai/chat", requireSymbolicApiKey, async (req, res) => {
  try {
    const { sessionId, message, userId } = req.body ?? {};
    const requestedConfig: AiProviderRuntimeConfig = providerConfigFromRequest(req.body?.provider) ?? {};
    // Fase 65: el chat usa la cadena de failover continuo. El proveedor
    // solicitado tiene prioridad; si agota cuota, falla o expira, la cadena
    // conmuta en caliente y siempre conserva el proveedor determinista local.
    const fallbackChain = createFallbackProviderChain({ requested: requestedConfig });
    const requestProvider: AiProviderRuntime = {
      provider: fallbackChain,
      id: requestedConfig.id ?? "fallback-chain",
      label: fallbackChain.size > 1 ? `T-BIT Failover (${fallbackChain.size} proveedores)` : "T-BIT Local",
      model: requestedConfig.model ?? "auto",
      mode: "remote",
    };
    const normalizedSessionId = typeof sessionId === "string" && sessionId.trim() ? sessionId.trim() : "default";
    const normalizedUserId = typeof userId === "string" && userId.trim() ? normalizeTBitKey(userId) : undefined;
    if (typeof message !== "string" || !message.trim()) {
      res.status(400).json({ ok: false, error: "El mensaje del chat IA es obligatorio." });
      return;
    }

    let effectiveMessage = message;
    const webResearchToolResults: unknown[] = [];
    if (isWebResearchIntent(message)) {
      const url = extractFirstUrlFromText(message);
      if (url) {
        const webResult = await researchWebPage({
          url,
          query: message,
          mode: "assisted",
          maxBytes: 750_000,
          maxTextChars: 12000,
          maxLinks: 24,
        });
        webResearchToolResults.push({
          tool: "tbit_web_research",
          status: "WEB_CONTEXT_READY",
          url: webResult.url,
          title: webResult.title,
          checksum: webResult.checksum,
          fetchedAt: webResult.fetchedAt,
          extractedChars: webResult.extractedChars,
          sourceBytes: webResult.sourceBytes,
          truncated: webResult.truncated,
        });
        effectiveMessage = buildWebResearchPrompt(message, webResult);
      }
    }

    const response = await procesarMensajeUsuario(
      { sessionId: normalizedSessionId, message: effectiveMessage, userId: normalizedUserId },
      {
        provider: requestProvider.provider,
        toolExecutor: (toolName, args) => {
          if (!tbitChatToolExecutor) throw new Error("Ejecutor local T-BIT no inicializado.");
          return tbitChatToolExecutor(toolName, scopeAiToolArgsToUser(args, normalizedUserId));
        },
        tools: tbitCoreTools,
        locale: "es-CO",
        timeZone: "America/Bogota",
        // Tanda 2 — Verificacion anti-alucinacion del chat contra Q-Vault,
        // con la misma fuente de verdad que el runtime de agentes (Fase 66).
        vaultContextProvider: (query, userId) => buildVaultContext(query, userId),
        vaultVerifier: (text, userId) => verifyAgainstVault(text, userId),
        interactionPersister: async (record) => {
          const sessionPart = normalizeTBitKey(record.sessionId) || "sesion";
          const key = `AI::Chat::${sessionPart}::${Date.now().toString(36)}`;
          const text = [
            `Interaccion de chat T-BIT (sesion ${record.sessionId}).`,
            `Usuario: ${record.userMessage}`,
            `Asistente: ${record.assistantMessage}`,
            record.citations.length
              ? `Respaldo en Q-Vault:\n${record.citations.map((citation) => `- [[${citation.key}]] ${citation.title} (${citation.source}, score ${citation.score})`).join("\n")}`
              : "Sin respaldo directo en Q-Vault.",
          ].join("\n");
          const persisted = await indexExternalMemoryRecord({
            key,
            userId: record.userId ?? "ai",
            text,
            payload: {
              tipo: "chat-interaction",
              sessionId: record.sessionId,
              userMessage: record.userMessage,
              assistantMessage: record.assistantMessage,
            },
            tags: ["chat", "interaccion"],
            links: record.citations.map((citation) => citation.key),
            source: "chat",
          });
          // Refresco del indice semantico: el fingerprint del query index
          // cambia al persistir, getSemanticIndexStats fuerza la reconstruccion.
          try {
            await getSemanticIndexStats();
          } catch {
            // best-effort
          }
          return { key: persisted.key, checksum: persisted.checksum };
        },
      },
    );

    // Tanda 2 — Proveedor real que sirvio la respuesta (incluido el eslabon
    // determinista final). Debe ser visible para no confundir una respuesta
    // sin IA con una respuesta de IA.
    const served = fallbackChain.getLastServed();
    const servedRuntime: AiProviderRuntime = served
      ? {
          provider: requestProvider.provider,
          id: served.id,
          label: served.label,
          model: served.model,
          mode: served.mode,
        }
      : requestProvider;
    const deterministicFallback = served?.mode === "deterministic";

    res.json({
      ok: true,
      ...response,
      toolResults: [...webResearchToolResults, ...(response.toolResults ?? [])],
      provider: servedRuntime.label,
      providerInfo: aiProviderPublicView(servedRuntime),
      deterministicFallback,
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Error en Orquestador Cognitivo Multi-IA.",
    });
  }
});

app.delete("/api/ai/chat/:sessionId", requireSymbolicApiKey, (req, res) => {
  resetTBitChatSession(req.params.sessionId);
  res.json({ ok: true, status: "SESION_COGNITIVA_REINICIADA" });
});

// ---------------------------------------------------------------------------
// Fase 64 — Runtime Multi-Agente (AgentOrchestrator + AgentEventBus)
// ---------------------------------------------------------------------------

/** Concurrencia maxima del pool de agentes (TBIT_AGENT_MAX_CONCURRENCY, default 4). */
const agentMaxConcurrency = Number(process.env.TBIT_AGENT_MAX_CONCURRENCY ?? "").toString().match(/^\d+$/)
  ? Number(process.env.TBIT_AGENT_MAX_CONCURRENCY)
  : 4;

const defaultAgentOrchestrator = new AgentOrchestrator();

app.get("/api/agents", requireSymbolicApiKey, (_req, res) => {
  try {
    const agents = defaultAgentOrchestrator.listAgents();
    res.json({ ok: true, total: agents.length, agents });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Fallo listando agentes T-BIT.",
    });
  }
});

app.get("/api/agents/events", requireSymbolicApiKey, (req, res) => {
  try {
    const limitParam = Number(req.query.limit);
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 2000) : undefined;
    res.json({ ok: true, events: getAgentEventBus().getJournal(limit) });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Fallo leyendo el journal de eventos de agentes.",
    });
  }
});

app.post("/api/agents/run", requireSymbolicApiKey, async (req, res) => {
  try {
    const { agent, task, userId, context } = req.body ?? {};
    if (typeof agent !== "string" || !agent.trim()) {
      res.status(400).json({ ok: false, error: "agents/run requiere el nombre del agente." });
      return;
    }
    if (typeof task !== "string" || !task.trim()) {
      res.status(400).json({ ok: false, error: "agents/run requiere la tarea (task)." });
      return;
    }
    const normalizedUserId = typeof userId === "string" && userId.trim() ? normalizeTBitKey(userId) : undefined;

    // Fase 66: contexto recuperado de Q-Vault antes de ejecutar (memoria evolutiva).
    let vaultContext = typeof context === "string" ? context : undefined;
    let vaultCitations: VaultCitation[] = [];
    try {
      const retrieved = await buildVaultContext(task, normalizedUserId);
      if (retrieved.contextText) {
        vaultContext = vaultContext ? `${vaultContext}\n\n${retrieved.contextText}` : retrieved.contextText;
        vaultCitations = retrieved.citations;
      }
    } catch {
      // La recuperacion de contexto es best-effort: nunca bloquea la ejecucion.
    }

    const chatExecutor = tbitChatToolExecutor;
    const orchestrator = new AgentOrchestrator({
      toolExecutor: chatExecutor
        ? (toolName, args) => chatExecutor(toolName, scopeAiToolArgsToUser(args, normalizedUserId))
        : undefined,
      tools: tbitCoreTools,
      maxConcurrency: agentMaxConcurrency,
      onRunComplete: async (result, runTask) => {
        await persistAgentRun(result, runTask, normalizedUserId);
      },
    });

    const result = await orchestrator.runAgent(agent, {
      task,
      userId: normalizedUserId,
      context: vaultContext,
    });

    // Fase 66: verificacion cruzada contra Q-Vault antes de entregar la respuesta.
    let verification: VaultVerification | null = null;
    if (result.output) {
      try {
        verification = await verifyAgainstVault(result.output, normalizedUserId);
      } catch {
        verification = null;
      }
    }

    res.json({ ok: result.status === "completed", result, vaultCitations, verification });
  } catch (error) {
    res.status(400).json({
      ok: false,
      error: error instanceof Error ? error.message : "Fallo ejecutando agente T-BIT.",
    });
  }
});

app.post("/api/agents/swarm", requireSymbolicApiKey, async (req, res) => {
  try {
    const { task, userId, context, agents, validators } = req.body ?? {};
    if (typeof task !== "string" || !task.trim()) {
      res.status(400).json({ ok: false, error: "agents/swarm requiere la tarea (task)." });
      return;
    }
    const normalizedUserId = typeof userId === "string" && userId.trim() ? normalizeTBitKey(userId) : undefined;

    // Fase 66: contexto recuperado de Q-Vault antes de ejecutar el enjambre.
    let vaultContext = typeof context === "string" ? context : undefined;
    let vaultCitations: VaultCitation[] = [];
    try {
      const retrieved = await buildVaultContext(task, normalizedUserId);
      if (retrieved.contextText) {
        vaultContext = vaultContext ? `${vaultContext}\n\n${retrieved.contextText}` : retrieved.contextText;
        vaultCitations = retrieved.citations;
      }
    } catch {
      // best-effort
    }

    const chatExecutor = tbitChatToolExecutor;
    const orchestrator = new AgentOrchestrator({
      toolExecutor: chatExecutor
        ? (toolName, args) => chatExecutor(toolName, scopeAiToolArgsToUser(args, normalizedUserId))
        : undefined,
      tools: tbitCoreTools,
      maxConcurrency: agentMaxConcurrency,
      onRunComplete: async (result, runTask) => {
        await persistAgentRun(result, runTask, normalizedUserId);
      },
    });

    const swarm = await orchestrator.runSwarm(
      {
        task,
        userId: normalizedUserId,
        context: vaultContext,
      },
      {
        agents: Array.isArray(agents) ? agents.filter((item): item is string => typeof item === "string") : undefined,
        validators: Array.isArray(validators) ? validators.filter((item): item is string => typeof item === "string") : undefined,
      },
    );

    // Fase 66: la bitacora de consenso se persiste en Q-Vault y la respuesta
    // consolidada se verifica contra el vault antes de entregarse.
    let consensusMemory: PersistedMemoryInfo | null = null;
    try {
      consensusMemory = await persistSwarmConsensus(swarm, task, normalizedUserId);
    } catch {
      consensusMemory = null;
    }

    let verification: VaultVerification | null = null;
    if (swarm.consolidated) {
      try {
        verification = await verifyAgainstVault(swarm.consolidated, normalizedUserId);
      } catch {
        verification = null;
      }
    }

    res.json({ ok: true, swarm, consensusMemory, vaultCitations, verification });
  } catch (error) {
    res.status(400).json({
      ok: false,
      error: error instanceof Error ? error.message : "Fallo ejecutando el enjambre multi-agente T-BIT.",
    });
  }
});

app.post("/api/ai/compress", requireSymbolicApiKey, async (req, res) => {
  try {
    const { dominioTarget, candidateKeys, coldBefore, maxItems, dryRun } = req.body ?? {};
    const report = await compressSemanticGravity(aiStorage, {
      dominioTarget: typeof dominioTarget === "string" ? dominioTarget : "AI",
      candidateKeys: Array.isArray(candidateKeys) ? candidateKeys.filter((item) => typeof item === "string") : [],
      coldBefore: typeof coldBefore === "number" ? coldBefore : undefined,
      maxItems: typeof maxItems === "number" ? maxItems : undefined,
      dryRun: Boolean(dryRun),
    });

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.status(report.status === "NO_CANDIDATES" ? 400 : 200).json(report);
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Fallo en compresion semantica fractal.",
    });
  }
});

app.get("/api/network/state", requireSymbolicApiKey, async (_req, res) => {
  try {
    const state = await getNetworkState();
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.json(state);
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Fallo al consultar estado anti-entropia.",
    });
  }
});

app.post("/api/network/export-record", requireSymbolicApiKey, async (req, res) => {
  try {
    const { key } = req.body ?? {};
    if (typeof key !== "string" || !key.trim()) {
      res.status(400).json({ ok: false, error: "export-record requiere key." });
      return;
    }

    const record = await exportNetworkRecord(aiStorage, key);
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.json(record);
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Fallo al exportar registro T-BIT.",
    });
  }
});

app.post("/api/network/import-record", requireSymbolicApiKey, async (req, res) => {
  try {
    const { key, payload, checksum, networkSignature, networkKeyId, sourceNodeId, updatedAt, force } = req.body ?? {};
    if (typeof key !== "string" || typeof payload !== "string" || typeof checksum !== "string") {
      res.status(400).json({ ok: false, error: "import-record requiere key, payload y checksum." });
      return;
    }

    const result = await importNetworkRecord(aiStorage, {
      key,
      payload,
      checksum,
      networkSignature: typeof networkSignature === "string" ? networkSignature : undefined,
      networkKeyId: typeof networkKeyId === "string" ? networkKeyId : undefined,
      sourceNodeId: typeof sourceNodeId === "string" ? sourceNodeId : undefined,
      updatedAt: typeof updatedAt === "string" ? updatedAt : undefined,
      force: Boolean(force),
    });
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.json(result);
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Fallo al importar registro T-BIT.",
    });
  }
});

app.post("/api/network/compare", requireSymbolicApiKey, async (req, res) => {
  try {
    const { remoteState } = req.body ?? {};
    if (!remoteState || typeof remoteState !== "object") {
      res.status(400).json({ ok: false, error: "compare requiere remoteState." });
      return;
    }

    const comparison = await compareNetworkState(remoteState);
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.json(comparison);
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Fallo al comparar estado de red.",
    });
  }
});

app.post("/api/memory/remember", requireSymbolicApiKey, async (req, res) => {
  try {
    const { userId, text, payload, key, domain, collection, tags, source, links } = req.body ?? {};
    if (typeof userId !== "string" || !userId.trim()) {
      res.status(400).json({ ok: false, error: "memory/remember requiere userId." });
      return;
    }
    const record = await rememberMemory(aiStorage, {
      userId,
      text: typeof text === "string" ? text : undefined,
      payload,
      key: typeof key === "string" ? key : undefined,
      domain: typeof domain === "string" ? domain : undefined,
      collection: typeof collection === "string" ? collection : undefined,
      tags: Array.isArray(tags) ? tags.filter((item) => typeof item === "string") : undefined,
      source: typeof source === "string" ? source : undefined,
      links: Array.isArray(links) ? links.filter((item) => typeof item === "string") : undefined,
    });
    res.json({ ok: true, record });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Fallo en Memory Core remember.",
    });
  }
});

app.post("/api/memory/recall", requireSymbolicApiKey, async (req, res) => {
  try {
    const { key } = req.body ?? {};
    if (typeof key !== "string" || !key.trim()) {
      res.status(400).json({ ok: false, error: "memory/recall requiere key." });
      return;
    }
    const record = await recallMemory(aiStorage, key);
    res.json({ ok: true, record });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Fallo en Memory Core recall.",
    });
  }
});

app.post("/api/memory/context", requireSymbolicApiKey, async (req, res) => {
  try {
    const { userId, query, limit } = req.body ?? {};
    if (typeof userId !== "string" || typeof query !== "string") {
      res.status(400).json({ ok: false, error: "memory/context requiere userId y query." });
      return;
    }
    const context = await getMemoryContext(userId, query, typeof limit === "number" ? limit : undefined);
    res.json({ ok: true, context });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Fallo en Memory Core context.",
    });
  }
});

app.post("/api/memory/links", requireSymbolicApiKey, async (req, res) => {
  try {
    const { key } = req.body ?? {};
    if (typeof key !== "string" || !key.trim()) {
      res.status(400).json({ ok: false, error: "memory/links requiere key." });
      return;
    }
    const links = await getMemoryLinks(key);
    res.json({ ok: true, ...links });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Fallo en Memory Core links.",
    });
  }
});

app.get("/api/memory/graph", requireSymbolicApiKey, async (req, res) => {
  try {
    const userId = typeof req.query.userId === "string" ? req.query.userId : undefined;
    const graph = await getMemoryGraph(userId);
    res.json({ ok: true, graph });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Fallo en Memory Graph.",
    });
  }
});

app.post("/api/memory/delete", requireSymbolicApiKey, async (req, res) => {
  try {
    const { key } = req.body ?? {};
    if (typeof key !== "string" || !key.trim()) {
      res.status(400).json({ ok: false, error: "memory/delete requiere key." });
      return;
    }
    const result = await deleteMemoryRecord(aiStorage, key);
    res.json({ ok: true, result });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Fallo eliminando memoria.",
    });
  }
});

app.get("/api/query/stats", requireSymbolicApiKey, async (_req, res) => {
  try {
    const stats = await getQueryIndexStats();
    res.json({ ok: true, stats });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Fallo leyendo Query Index.",
    });
  }
});

app.post("/api/query/rebuild", requireSymbolicApiKey, async (_req, res) => {
  try {
    const index = await rebuildQueryIndex();
    res.json({
      ok: true,
      index: {
        builtAt: index.builtAt,
        totalRecords: index.totalRecords,
        users: Object.keys(index.byUser).length,
        sources: Object.keys(index.bySource).length,
        tags: Object.keys(index.byTag).length,
        tokens: Object.keys(index.byToken).length,
        documents: Object.keys(index.byDocument).length,
        attributes: Object.keys(index.byAttribute).length,
      },
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Fallo reconstruyendo Query Index.",
    });
  }
});

app.post("/api/query/search", requireSymbolicApiKey, async (req, res) => {
  try {
    const result = await searchQueryIndex(req.body ?? {});
    res.json({ ok: true, ...result });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Fallo buscando en Query Index.",
    });
  }
});

app.get("/api/semantic/stats", requireSymbolicApiKey, async (_req, res) => {
  try {
    const stats = await getSemanticIndexStats();
    res.json({ ok: true, stats });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Fallo leyendo Semantic Index.",
    });
  }
});

app.post("/api/semantic/rebuild", requireSymbolicApiKey, async (_req, res) => {
  try {
    const index = await rebuildSemanticIndex();
    res.json({
      ok: true,
      index: {
        builtAt: index.builtAt,
        totalRecords: Object.keys(index.entries).length,
        model: index.model,
        dimensions: index.dimensions,
      }
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Fallo reconstruyendo Semantic Index.",
    });
  }
});

app.post("/api/semantic/search", requireSymbolicApiKey, async (req, res) => {
  try {
    const result = await searchSemanticIndex(req.body ?? {});
    res.json({ ok: true, ...result });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Fallo buscando semanticamente.",
    });
  }
});

app.post("/api/guardian/observe", requireSymbolicApiKey, async (req, res) => {
  try {
    const { userId, maxDocuments, minConfidence } = req.body ?? {};
    const report = await observeGuardian({
      userId: typeof userId === "string" && userId.trim() ? userId.trim() : undefined,
      maxDocuments: typeof maxDocuments === "number" ? maxDocuments : undefined,
      minConfidence: typeof minConfidence === "number" ? minConfidence : undefined,
    });
    res.json({ ok: true, report });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Fallo ejecutando Guardian Observer.",
    });
  }
});

app.post("/api/document/ask", requireSymbolicApiKey, async (req, res) => {
  try {
    const { query, userId, document, key, limit } = req.body ?? {};
    if (typeof query !== "string" || !query.trim()) {
      res.status(400).json({ ok: false, error: "document/ask requiere query." });
      return;
    }

    const result = await answerDocumentQuestion(aiStorage, {
      query,
      userId: typeof userId === "string" && userId.trim() ? userId : undefined,
      document: typeof document === "string" && document.trim() ? document : undefined,
      key: typeof key === "string" && key.trim() ? key : undefined,
      limit: typeof limit === "number" ? limit : undefined,
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Fallo respondiendo pregunta documental.",
    });
  }
});

app.get("/api/health/container", requireSymbolicApiKey, async (_req, res) => {
  try {
    const report = await getContainerHealthReport();
    res.json(report);
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Fallo leyendo salud del contenedor.",
    });
  }
});

app.post("/api/health/reconcile", requireSymbolicApiKey, async (req, res) => {
  try {
    const report = await reconcileContainerHealth(req.body?.dryRun === true);
    res.json(report);
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Fallo reconciliando indices del contenedor.",
    });
  }
});

app.get("/api/ai/permissions", requireSymbolicApiKey, async (_req, res) => {
  try {
    const policy = await getAiPermissionsPolicy();
    res.json({ ok: true, policy });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Fallo leyendo permisos IA.",
    });
  }
});

app.post("/api/ai/permissions", requireSymbolicApiKey, async (req, res) => {
  try {
    const policy = await updateAiPermissionsPolicy(req.body ?? {});
    res.json({ ok: true, policy });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Fallo actualizando permisos IA.",
    });
  }
});

app.get("/api/assets/list", requireSymbolicApiKey, async (req, res) => {
  try {
    const userId = typeof req.query.userId === "string" && req.query.userId.trim() ? req.query.userId : undefined;
    const assets = await listAssets(userId);
    res.json({ ok: true, assets });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Fallo listando assets.",
    });
  }
});

app.get("/api/assets/stats", requireSymbolicApiKey, async (req, res) => {
  try {
    const userId = typeof req.query.userId === "string" && req.query.userId.trim() ? req.query.userId : undefined;
    const stats = await getAssetStats(userId);
    res.json({ ok: true, stats });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Fallo leyendo estado de assets.",
    });
  }
});

app.delete("/api/assets/delete", requireSymbolicApiKey, async (req, res) => {
  try {
    const { assetKey } = req.body ?? {};
    if (typeof assetKey !== "string" || !assetKey.trim()) {
      res.status(400).json({ ok: false, error: "assets/delete requiere assetKey." });
      return;
    }
    const result = await deleteAsset(aiStorage, assetKey);
    res.json({ ok: true, result });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Fallo eliminando asset.",
    });
  }
});

app.post("/api/assets/delete", requireSymbolicApiKey, async (req, res) => {
  try {
    const { assetKey } = req.body ?? {};
    if (typeof assetKey !== "string" || !assetKey.trim()) {
      res.status(400).json({ ok: false, error: "assets/delete requiere assetKey." });
      return;
    }
    const result = await deleteAsset(aiStorage, assetKey);
    res.json({ ok: true, result });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Fallo eliminando asset.",
    });
  }
});

app.post("/api/markdown/preview", requireSymbolicApiKey, async (req, res) => {
  try {
    const { userId, filename, content, key } = req.body ?? {};
    if (typeof userId !== "string" || typeof filename !== "string" || typeof content !== "string") {
      res.status(400).json({ ok: false, error: "markdown/preview requiere userId, filename y content." });
      return;
    }
    const parsed = parseMarkdownDocument({ userId, filename, content, key: typeof key === "string" ? key : undefined });
    res.json({ ok: true, parsed });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Fallo en Markdown preview.",
    });
  }
});

app.post("/api/assets/import-binary", requireSymbolicApiKey, async (req, res) => {
  try {
    const { userId, filename, mimeType, contentBase64, key } = req.body ?? {};
    if (typeof userId !== "string" || typeof filename !== "string" || typeof contentBase64 !== "string") {
      res.status(400).json({ ok: false, error: "assets/import-binary requiere userId, filename y contentBase64." });
      return;
    }
    const result = await importBinaryAsset(aiStorage, {
      userId,
      filename,
      mimeType: typeof mimeType === "string" ? mimeType : undefined,
      contentBase64,
      key: typeof key === "string" ? key : undefined,
    });
    res.json({ ok: true, result });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Fallo importando asset binario.",
    });
  }
});

app.post("/api/documents/import", requireSymbolicApiKey, async (req, res) => {
  try {
    const {
      userId,
      filename,
      mimeType,
      contentBase64,
      key,
      semanticMode,
      analyzeCode,
      showCodeGraphRelations,
    } = req.body ?? {};
    if (typeof userId !== "string" || typeof filename !== "string" || typeof contentBase64 !== "string") {
      res.status(400).json({ ok: false, error: "documents/import requiere userId, filename y contentBase64." });
      return;
    }
    const result = await importUniversalDocument(aiStorage, {
      userId,
      filename,
      mimeType: typeof mimeType === "string" ? mimeType : undefined,
      contentBase64,
      key: typeof key === "string" ? key : undefined,
      semanticMode: semanticMode === "inline" || semanticMode === "deferred" || semanticMode === "skip"
        ? semanticMode
        : "auto",
      analyzeCode: typeof analyzeCode === "boolean" ? analyzeCode : undefined,
      showCodeGraphRelations: typeof showCodeGraphRelations === "boolean" ? showCodeGraphRelations : undefined,
    });
    res.json({ ok: true, result });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Fallo importando documento universal.",
    });
  }
});

app.post("/api/assets/reconstruct-binary", requireSymbolicApiKey, async (req, res) => {
  try {
    const { key } = req.body ?? {};
    if (typeof key !== "string" || !key.trim()) {
      res.status(400).json({ ok: false, error: "assets/reconstruct-binary requiere key." });
      return;
    }
    const result = await reconstructBinaryAsset(aiStorage, key);
    res.json({ ok: true, result });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Fallo reconstruyendo asset binario.",
    });
  }
});

app.post("/api/assets/delete-binary", requireSymbolicApiKey, async (req, res) => {
  try {
    const { key } = req.body ?? {};
    if (typeof key !== "string" || !key.trim()) {
      res.status(400).json({ ok: false, error: "assets/delete-binary requiere key." });
      return;
    }
    const result = await deleteBinaryAsset(aiStorage, key);
    res.json({ ok: true, result });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Fallo eliminando asset binario.",
    });
  }
});

app.post("/api/markdown/import", requireSymbolicApiKey, async (req, res) => {
  try {
    const { userId, filename, content, key } = req.body ?? {};
    if (typeof userId !== "string" || typeof filename !== "string" || typeof content !== "string") {
      res.status(400).json({ ok: false, error: "markdown/import requiere userId, filename y content." });
      return;
    }
    const result = await importMarkdownDocument(aiStorage, {
      userId,
      filename,
      content,
      key: typeof key === "string" ? key : undefined,
    });
    res.json({ ok: true, result });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Fallo en Markdown import.",
    });
  }
});

app.post("/api/markdown/reconstruct", requireSymbolicApiKey, async (req, res) => {
  try {
    const { key } = req.body ?? {};
    if (typeof key !== "string" || !key.trim()) {
      res.status(400).json({ ok: false, error: "markdown/reconstruct requiere key." });
      return;
    }
    const result = await reconstructMarkdownDocument(aiStorage, key);
    res.json({ ok: true, result });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Fallo reconstruyendo Markdown.",
    });
  }
});

app.get("/api/markdown/list", requireSymbolicApiKey, async (req, res) => {
  try {
    const userId = typeof req.query.userId === "string" && req.query.userId.trim() ? req.query.userId : undefined;
    const documents = await listMarkdownDocuments(userId);
    res.json({ ok: true, documents });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Fallo listando Markdown.",
    });
  }
});

app.delete("/api/markdown/delete", requireSymbolicApiKey, async (req, res) => {
  try {
    const { key } = req.body ?? {};
    if (typeof key !== "string" || !key.trim()) {
      res.status(400).json({ ok: false, error: "markdown/delete requiere key." });
      return;
    }
    const result = await deleteMarkdownDocument(aiStorage, key);
    res.json({ ok: true, result });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Fallo eliminando Markdown.",
    });
  }
});

app.delete("/api/markdown/purge-orphans", requireSymbolicApiKey, async (req, res) => {
  try {
    const { userId } = req.body ?? {};
    const result = await purgeOrphanMarkdownChunks(aiStorage, typeof userId === "string" && userId.trim() ? userId : undefined);
    res.json({ ok: true, result });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Fallo limpiando chunks huerfanos.",
    });
  }
});

app.post("/api/markdown/purge-orphans", requireSymbolicApiKey, async (req, res) => {
  try {
    const { userId } = req.body ?? {};
    const result = await purgeOrphanMarkdownChunks(aiStorage, typeof userId === "string" && userId.trim() ? userId : undefined);
    res.json({ ok: true, result });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Fallo limpiando chunks huerfanos.",
    });
  }
});

// Tanda 3 (Fase 77) — empaquetado desktop: cuando exista un frontend construido
// (dist/index.html, producto de `npm run build`), se sirve desde este mismo
// proceso. Es aditivo: no altera ninguna ruta /api existente y evita lanzar un
// segundo proceso (vite preview) para la app de escritorio, de modo que todo el
// almacenamiento del vault sigue siendo tocado por un unico proceso.
const frontendDistDir = resolve(process.cwd(), "dist");
const frontendIndexHtml = resolve(frontendDistDir, "index.html");
if (existsSync(frontendIndexHtml)) {
  app.use(express.static(frontendDistDir));
  app.get(/^\/(?!api(\/|$)).*/, (_req, res) => {
    res.sendFile(frontendIndexHtml);
  });
}

app.listen(PORT, () => {
      console.log(`T-BIT API activa en http://localhost:${PORT}`);
      if (existsSync(frontendIndexHtml)) {
        console.log(`Q-Vault OS (frontend construido) disponible en http://localhost:${PORT}`);
      }
      console.log(`Integridad HMAC activa con key id '${HMAC_KEY_ID}'.`);
      console.log("Recovery WAL completado para universo principal y memoria IA.");
    });
  })
  .catch((error) => {
    console.error("No fue posible iniciar T-BIT API:", error);
    process.exitCode = 1;
  });
