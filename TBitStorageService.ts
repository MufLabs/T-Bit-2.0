import { createHash, createHmac, timingSafeEqual } from "crypto";
import { existsSync, statSync } from "fs";
import { promises as fs } from "fs";
import type { FileHandle } from "fs/promises";
import { dirname, resolve } from "path";
import { AllocationMap } from "./AllocationMap";
import { TBitContainer } from "./TBitFileSystem";
import { normalizeTBitKey, normalizeUnicodeText } from "./textEncoding";

export type TBitMetadataEntry = {
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

export type TBitMetadata = Record<string, TBitMetadataEntry>;

export type TBitWalState = "PENDING" | "COMMITTED" | "ABORTED";

export type TBitWalRecord = {
  id: string;
  state: TBitWalState;
  operation: "INYECTAR" | "COLAPSAR";
  clave: string;
  length?: number;
  physicalLength?: number;
  offsetV?: number;
  offsetAntiV?: number;
  createdAt: string;
  error?: string;
};

export type TBitBatchWriteInput = {
  key: string;
  payload: string;
};

export type TBitBatchCollapseResult = {
  key: string;
  collapsed: boolean;
  warning?: string;
};

export type TBitStorageConfig = {
  name: string;
  containerPath: string;
  metadataPath: string;
  walPath: string;
  snapshotsDir: string;
  replicasDir: string;
  exportsDir: string;
  lockPath: string;
  hmacSecrets: Map<string, string>;
  hmacKeyId: string;
  remoteReplicaDir?: string;
  maxDatoBytes?: number;
  maxRecords?: number;
  containerSizeMB?: number;
};

const SYSTEM_HEADER_SIZE = 40;
const FRAME_HEADER_SIZE = 8;
const DEFAULT_CONTAINER_SIZE_MB = 10;
const DEFAULT_MAX_DATO_BYTES = 64 * 1024;
const MIN_DYNAMIC_MAX_RECORDS = 500;
const RECORDS_PER_CONTAINER_MB = 64;
const ABSOLUTE_MAX_RECORDS = 200_000;
const MAX_PROBING_ATTEMPTS = 2048;
const LOCK_TIMEOUT_MS = 10_000;
const LOCK_RETRY_MS = 100;
const STALE_LOCK_MS = 60_000;

export class TBitStorageService {
  readonly container: TBitContainer;
  private operationQueue = Promise.resolve();

  constructor(private readonly config: TBitStorageConfig) {
    this.container = new TBitContainer(config.containerPath);
  }

  async recover(): Promise<void> {
    await this.withOperation(async () => {
      await this.startupRecovery();
    });
  }

  async reinitializeContainer(sizeInMB: number): Promise<void> {
    await this.withOperation(async () => {
      await fs.mkdir(dirname(this.config.containerPath), { recursive: true });
      await this.container.initContainer(sizeInMB);
      await this.container.reloadFromDisk();
    });
  }

  async inject(clave: string, dato: string) {
    return this.withOperation(async () => {
      await this.ensureContainer();

      const normalizedClave = normalizeTBitKey(clave);
      const normalizedDato = normalizeUnicodeText(dato);
      const length = this.validateDatoSize(normalizedDato);
      const physicalLength = this.container.calculateStorageLength(normalizedDato);
      const primaryProjection = await this.container.calculateProjection(normalizedClave);
      const metadata = await this.readMetadata();
      let walId = "";

      try {
        if (!metadata[normalizedClave] && Object.keys(metadata).length >= this.maxRecords()) {
          throw new Error(`CUOTA_EXCEDIDA: limite de ${this.maxRecords()} registros activos alcanzado.`);
        }

        const allocation = this.findAllocatableOffsets(metadata, normalizedClave, primaryProjection.offsetV, physicalLength);
        walId = await this.beginWal("INYECTAR", normalizedClave, length, physicalLength, allocation.offsetV, allocation.offsetAntiV);

        if (metadata[normalizedClave]) {
          try {
            await this.container.destroyAtOffsets(metadata[normalizedClave].offsetV, metadata[normalizedClave].offsetAntiV, metadata[normalizedClave].length);
          } catch (error) {
            const message = error instanceof Error ? error.message : "";

            if (!message.includes("FRAME T-BIT NO ENCONTRADO")) {
              throw error;
            }
          }
        }

        await this.container.writeAtOffsets(allocation.offsetV, allocation.offsetAntiV, normalizedDato);
        const assignedProjection = await this.container.calculateProjectionFromOffsets(allocation.offsetV, allocation.offsetAntiV);
        const metadataEntry: Omit<TBitMetadataEntry, "authTag"> = {
          length,
          physicalLength,
          updatedAt: new Date().toISOString(),
          offsetV: allocation.offsetV,
          offsetAntiV: allocation.offsetAntiV,
          dataHash: this.hashData(normalizedDato),
          authKeyId: this.config.hmacKeyId,
          authVersion: 2,
          encryption: this.container.getPayloadEncryptionStatus().enabled ? "AES-256-GCM" : "none",
          encryptionKeyId: this.container.getPayloadEncryptionStatus().activeKeyId,
          probingAttempts: allocation.probingAttempts
        };

        metadata[normalizedClave] = {
          ...metadataEntry,
          authTag: this.signMetadata(normalizedClave, metadataEntry)
        };

        await this.writeMetadata(metadata);
        await this.updateReplica();
        await this.finishWal(walId, "INYECTAR", normalizedClave, "COMMITTED", length, physicalLength, allocation.offsetV, allocation.offsetAntiV);

        return {
          ok: true,
          status: "ESCRITURA_FISICA_CONFIRMADA",
          storage: this.config.name,
          clave: normalizedClave,
          length,
          offsetV: allocation.offsetV,
          offsetAntiV: allocation.offsetAntiV,
          probingAttempts: allocation.probingAttempts,
          coordinates: assignedProjection.coordinates,
          antiCoordinates: assignedProjection.antiCoordinates
        };
      } catch (error) {
        if (walId) {
          await this.finishWal(
            walId,
            "INYECTAR",
            normalizedClave,
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
  }

  async injectMany(records: TBitBatchWriteInput[]) {
    return this.withOperation(async () => {
      await this.ensureContainer();

      if (records.length === 0) return [];

      const metadata = await this.readMetadata();
      const allocationMap = this.buildAllocationMap(metadata);
      const prepared: Array<{
        key: string;
        dato: string;
        length: number;
        physicalLength: number;
        offsetV: number;
        offsetAntiV: number;
        probingAttempts: number;
        walId: string;
      }> = [];
      let activeCount = Object.keys(metadata).length;
      const maxRecords = this.maxRecords();

      try {
        for (const record of records) {
          const normalizedClave = normalizeTBitKey(record.key);
          const normalizedDato = normalizeUnicodeText(record.payload);
          const length = this.validateDatoSize(normalizedDato);
          const physicalLength = this.container.calculateStorageLength(normalizedDato);
          const primaryProjection = await this.container.calculateProjection(normalizedClave);

          if (!metadata[normalizedClave]) {
            if (activeCount >= maxRecords) {
              throw new Error(
                `CUOTA_EXCEDIDA: limite de ${maxRecords} registros activos alcanzado ` +
                  `(actuales: ${Object.keys(metadata).length}, lote: ${records.length}).`
              );
            }
            activeCount += 1;
          } else {
            allocationMap.remove(normalizedClave);
          }

          const allocation = this.findAllocatableOffsetsInMap(
            allocationMap,
            normalizedClave,
            primaryProjection.offsetV,
            physicalLength
          );
          const ranges = [
            ...allocationMap.circularRanges(allocation.offsetV, physicalLength),
            ...allocationMap.circularRanges(allocation.offsetAntiV, physicalLength),
          ];
          allocationMap.allocate(normalizedClave, ranges);

          prepared.push({
            key: normalizedClave,
            dato: normalizedDato,
            length,
            physicalLength,
            offsetV: allocation.offsetV,
            offsetAntiV: allocation.offsetAntiV,
            probingAttempts: allocation.probingAttempts,
            walId: "",
          });
        }

        for (const item of prepared) {
          item.walId = await this.beginWal("INYECTAR", item.key, item.length, item.physicalLength, item.offsetV, item.offsetAntiV);
        }

        const staleItems = prepared
          .map((item) => ({ item, previous: metadata[item.key] }))
          .filter((entry): entry is { item: typeof prepared[number]; previous: TBitMetadataEntry } => Boolean(entry.previous));

        await this.container.destroyManyAtOffsets(staleItems.map(({ previous }) => ({
          offsetV: previous.offsetV,
          offsetAntiV: previous.offsetAntiV,
          expectedLength: previous.length,
        })));

        await this.container.writeManyAtOffsets(prepared.map((item) => ({
          offsetV: item.offsetV,
          offsetAntiV: item.offsetAntiV,
          dataText: item.dato,
        })));

        const now = new Date().toISOString();
        for (const item of prepared) {
          const metadataEntry: Omit<TBitMetadataEntry, "authTag"> = {
            length: item.length,
            physicalLength: item.physicalLength,
            updatedAt: now,
            offsetV: item.offsetV,
            offsetAntiV: item.offsetAntiV,
            dataHash: this.hashData(item.dato),
            authKeyId: this.config.hmacKeyId,
            authVersion: 2,
            encryption: this.container.getPayloadEncryptionStatus().enabled ? "AES-256-GCM" : "none",
            encryptionKeyId: this.container.getPayloadEncryptionStatus().activeKeyId,
            probingAttempts: item.probingAttempts,
          };

          metadata[item.key] = {
            ...metadataEntry,
            authTag: this.signMetadata(item.key, metadataEntry),
          };
        }

        await this.writeMetadata(metadata);
        await this.updateReplica();

        for (const item of prepared) {
          await this.finishWal(item.walId, "INYECTAR", item.key, "COMMITTED", item.length, item.physicalLength, item.offsetV, item.offsetAntiV);
        }

        return Promise.all(prepared.map(async (item) => {
          const projection = await this.container.calculateProjectionFromOffsets(item.offsetV, item.offsetAntiV);
          return {
            ok: true,
            status: "ESCRITURA_FISICA_CONFIRMADA",
            storage: this.config.name,
            clave: item.key,
            length: item.length,
            offsetV: item.offsetV,
            offsetAntiV: item.offsetAntiV,
            probingAttempts: item.probingAttempts,
            coordinates: projection.coordinates,
            antiCoordinates: projection.antiCoordinates,
          };
        }));
      } catch (error) {
        for (const item of prepared) {
          if (item.walId) {
            await this.finishWal(
              item.walId,
              "INYECTAR",
              item.key,
              "ABORTED",
              item.length,
              item.physicalLength,
              item.offsetV,
              item.offsetAntiV,
              error instanceof Error ? error.message : "Error desconocido"
            );
          }
        }
        throw error;
      }
    });
  }

  async recoverData(clave: string) {
    return this.withOperation(async () => {
      await this.ensureContainer();

      const normalizedClave = normalizeTBitKey(clave);
      const metadata = await this.readMetadata();
      const entry = metadata[normalizedClave];

      if (!entry) {
        throw new Error("Clave no registrada en el indice local.");
      }

      this.assertMetadataSignature(normalizedClave, entry);

      const dato = await this.container.readAtOffsets(entry.offsetV, entry.offsetAntiV, entry.length);
      const currentHash = this.hashData(dato);

      if (entry.dataHash && entry.dataHash !== currentHash) {
        throw new Error("CORRUPCION DE INTEGRIDAD: hash de metadata no coincide.");
      }

      const projection = await this.container.calculateProjectionFromOffsets(entry.offsetV, entry.offsetAntiV);

      return {
        ok: true,
        status: "INTEGRIDAD_CONFIRMADA",
        integridadValida: true,
        storage: this.config.name,
        clave: normalizedClave,
        dato,
        length: entry.length,
        offsetV: entry.offsetV,
        offsetAntiV: entry.offsetAntiV,
        coordinates: projection.coordinates,
        antiCoordinates: projection.antiCoordinates
      };
    });
  }

  async listKeys(): Promise<string[]> {
    return this.withOperation(async () => {
      await this.ensureContainer();
      const metadata = await this.readMetadata();
      return Object.keys(metadata).sort();
    });
  }

  async collapse(clave: string) {
    return this.withOperation(async () => {
      await this.ensureContainer();

      const normalizedClave = normalizeTBitKey(clave);
      const metadata = await this.readMetadata();
      const entry = metadata[normalizedClave];

      if (!entry) {
        throw new Error("Clave no registrada en el indice local.");
      }

      this.assertMetadataSignature(normalizedClave, entry);

      const projection = await this.container.calculateProjectionFromOffsets(entry.offsetV, entry.offsetAntiV);
      const walId = await this.beginWal("COLAPSAR", normalizedClave, entry.length, entry.physicalLength, entry.offsetV, entry.offsetAntiV);

      try {
        await this.container.destroyAtOffsets(entry.offsetV, entry.offsetAntiV, entry.length);
        delete metadata[normalizedClave];
        await this.writeMetadata(metadata);
        await this.updateReplica();
        await this.finishWal(walId, "COLAPSAR", normalizedClave, "COMMITTED", entry.length, entry.physicalLength, entry.offsetV, entry.offsetAntiV);

        return {
          ok: true,
          status: "ANIQUILACION_EXITOSA",
          message: "Anulacion cuantica completada. Rastro eliminado.",
          storage: this.config.name,
          clave: normalizedClave,
          length: entry.length,
          offsetV: projection.offsetV,
          offsetAntiV: projection.offsetAntiV,
          coordinates: projection.coordinates,
          antiCoordinates: projection.antiCoordinates
        };
      } catch (error) {
        await this.finishWal(
          walId,
          "COLAPSAR",
          normalizedClave,
          "ABORTED",
          entry.length,
          entry.physicalLength,
          entry.offsetV,
          entry.offsetAntiV,
          error instanceof Error ? error.message : "Error desconocido"
        );
        throw error;
      }
    });
  }

  async collapseMany(keys: string[]): Promise<TBitBatchCollapseResult[]> {
    return this.withOperation(async () => {
      await this.ensureContainer();

      const normalizedKeys = [...new Set(keys.map((key) => normalizeTBitKey(key)).filter(Boolean))];
      const metadata = await this.readMetadata();
      const results: TBitBatchCollapseResult[] = [];
      const walItems: Array<{ key: string; entry: TBitMetadataEntry; walId: string }> = [];

      for (const key of normalizedKeys) {
        const entry = metadata[key];

        if (!entry) {
          results.push({ key, collapsed: false, warning: "Clave no registrada en el indice local." });
          continue;
        }

        this.assertMetadataSignature(key, entry);
        walItems.push({
          key,
          entry,
          walId: await this.beginWal("COLAPSAR", key, entry.length, entry.physicalLength, entry.offsetV, entry.offsetAntiV),
        });
      }

      try {
        await this.container.destroyManyAtOffsets(walItems.map(({ entry }) => ({
          offsetV: entry.offsetV,
          offsetAntiV: entry.offsetAntiV,
          expectedLength: entry.length,
        })));

        for (const { key } of walItems) {
          delete metadata[key];
        }

        await this.writeMetadata(metadata);
        await this.updateReplica();

        for (const { key, entry, walId } of walItems) {
          await this.finishWal(walId, "COLAPSAR", key, "COMMITTED", entry.length, entry.physicalLength, entry.offsetV, entry.offsetAntiV);
          results.push({ key, collapsed: true });
        }

        return results;
      } catch (error) {
        for (const { key, entry, walId } of walItems) {
          await this.finishWal(
            walId,
            "COLAPSAR",
            key,
            "ABORTED",
            entry.length,
            entry.physicalLength,
            entry.offsetV,
            entry.offsetAntiV,
            error instanceof Error ? error.message : "Error desconocido"
          );
        }
        throw error;
      }
    });
  }

  async snapshot(label = "manual") {
    return this.withOperation(async () => {
      await this.ensureContainer();
      await fs.mkdir(this.config.snapshotsDir, { recursive: true });

      const safeLabel = label.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40) || "manual";
      const id = `${new Date().toISOString().replace(/[:.]/g, "-")}_${safeLabel}`;
      const snapshotContainer = resolve(this.config.snapshotsDir, `${id}.tbit`);
      const snapshotMetadata = resolve(this.config.snapshotsDir, `${id}.meta.json`);

      await fs.copyFile(this.config.containerPath, snapshotContainer);

      if (existsSync(this.config.metadataPath)) {
        await fs.copyFile(this.config.metadataPath, snapshotMetadata);
      } else {
        await fs.writeFile(snapshotMetadata, "{}", "utf8");
      }

      const checksum = await this.hashFile(snapshotContainer);
      await fs.writeFile(
        resolve(this.config.snapshotsDir, `${id}.manifest.json`),
        JSON.stringify({ id, label, checksum, createdAt: new Date().toISOString() }, null, 2),
        "utf8"
      );

      return { id, checksum };
    });
  }

  async rollback(id: string) {
    return this.withOperation(async () => {
      const safeId = id.replace(/[^a-zA-Z0-9_.-]/g, "");
      const snapshotContainer = resolve(this.config.snapshotsDir, `${safeId}.tbit`);
      const snapshotMetadata = resolve(this.config.snapshotsDir, `${safeId}.meta.json`);

      if (!existsSync(snapshotContainer)) {
        throw new Error("Snapshot no encontrado.");
      }

      await fs.copyFile(snapshotContainer, this.config.containerPath);

      if (existsSync(snapshotMetadata)) {
        await fs.copyFile(snapshotMetadata, this.config.metadataPath);
      } else {
        await fs.writeFile(this.config.metadataPath, "{}", "utf8");
      }

      await this.updateReplica();
      return { ok: true, status: "ROLLBACK_COMPLETADO", id: safeId };
    });
  }

  async checksum() {
    return this.withOperation(() => this.globalChecksum());
  }

  async exportBundle(label = "manual") {
    return this.withOperation(async () => {
      await this.ensureContainer();
      await fs.mkdir(this.config.exportsDir, { recursive: true });

      const safeLabel = label.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40) || "manual";
      const id = `${new Date().toISOString().replace(/[:.]/g, "-")}_${safeLabel}`;
      const bundleDir = resolve(this.config.exportsDir, id);

      await fs.mkdir(bundleDir, { recursive: true });
      await fs.copyFile(this.config.containerPath, resolve(bundleDir, "universo.tbit"));
      await this.copyIfExistsOrWrite(this.config.metadataPath, resolve(bundleDir, "universo.tbit.meta.json"), "{}");
      await this.copyIfExistsOrWrite(this.config.walPath, resolve(bundleDir, "universo.tbit.wal.jsonl"), "");

      const containerHash = await this.hashFile(resolve(bundleDir, "universo.tbit"));
      const metadataHash = await this.hashFile(resolve(bundleDir, "universo.tbit.meta.json"));
      const walHash = await this.hashFile(resolve(bundleDir, "universo.tbit.wal.jsonl"));
      const combinedHash = createHash("sha256").update(containerHash).update(metadataHash).update(walHash).digest("hex");
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
    });
  }

  async importBundle(id: string) {
    return this.withOperation(async () => {
      const safeId = id.replace(/[^a-zA-Z0-9_.-]/g, "");
      const bundleDir = resolve(this.config.exportsDir, safeId);
      const manifestPath = resolve(bundleDir, "manifest.json");

      if (!existsSync(manifestPath)) {
        throw new Error("Bundle de exportacion no encontrado.");
      }

      const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as {
        combinedHash: string;
        files: Record<string, string>;
      };

      for (const [fileName, expectedHash] of Object.entries(manifest.files)) {
        const actualHash = await this.hashFile(resolve(bundleDir, fileName));

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

      await fs.copyFile(resolve(bundleDir, "universo.tbit"), this.config.containerPath);
      await fs.copyFile(resolve(bundleDir, "universo.tbit.meta.json"), this.config.metadataPath);
      await fs.copyFile(resolve(bundleDir, "universo.tbit.wal.jsonl"), this.config.walPath);
      await this.updateReplica();

      return { id: safeId, combinedHash };
    });
  }

  private async withOperation<T>(operation: () => Promise<T>): Promise<T> {
    const nextOperation = this.operationQueue.then(() => this.withFileLock(operation), () => this.withFileLock(operation));
    this.operationQueue = nextOperation.then(() => undefined, () => undefined);
    return nextOperation;
  }

  private async withFileLock<T>(operation: () => Promise<T>): Promise<T> {
    const startedAt = Date.now();
    let lockHandle: FileHandle | undefined;

    while (!lockHandle) {
      try {
        await fs.mkdir(dirname(this.config.lockPath), { recursive: true });
        lockHandle = await fs.open(this.config.lockPath, "wx");
        await lockHandle.writeFile(JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }), "utf8");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
          throw error;
        }

        try {
          const stat = await fs.stat(this.config.lockPath);

          if (Date.now() - stat.mtimeMs > STALE_LOCK_MS) {
            await fs.rm(this.config.lockPath, { force: true });
            continue;
          }
        } catch {
          continue;
        }

        if (Date.now() - startedAt > LOCK_TIMEOUT_MS) {
          throw new Error("LOCK_TIMEOUT: otro proceso mantiene bloqueado el contenedor T-BIT.");
        }

        await new Promise((resolve) => setTimeout(resolve, LOCK_RETRY_MS));
      }
    }

    try {
      return await operation();
    } finally {
      await lockHandle.close();
      await fs.rm(this.config.lockPath, { force: true });
    }
  }

  private async ensureContainer(): Promise<void> {
    await fs.mkdir(dirname(this.config.containerPath), { recursive: true });

    if (!existsSync(this.config.containerPath)) {
      await this.container.initContainer(this.config.containerSizeMB ?? DEFAULT_CONTAINER_SIZE_MB);
    }
  }

  private async startupRecovery(): Promise<void> {
    await this.ensureContainer();

    let rawWal = "";

    try {
      rawWal = await fs.readFile(this.config.walPath, "utf8");
    } catch {
      return;
    }

    const records = rawWal.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => JSON.parse(line) as TBitWalRecord);
    const recordsById = new Map<string, TBitWalRecord[]>();

    for (const record of records) {
      recordsById.set(record.id, [...(recordsById.get(record.id) ?? []), record]);
    }

    const metadata = await this.readMetadata();
    let metadataChanged = false;

    for (const [id, groupedRecords] of recordsById) {
      const latest = groupedRecords[groupedRecords.length - 1];

      if (latest.state !== "PENDING") {
        continue;
      }

      if (latest.offsetV !== undefined && latest.offsetAntiV !== undefined && latest.physicalLength !== undefined) {
        try {
          await this.container.zeroFillAtOffsets(latest.offsetV, latest.offsetAntiV, latest.physicalLength);
        } catch {
          // Continue recovery for other WAL entries.
        }
      }

      if (metadata[latest.clave]) {
        delete metadata[latest.clave];
        metadataChanged = true;
      }

      await this.finishWal(
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
      await this.writeMetadata(metadata);
    }
  }

  private async readMetadata(): Promise<TBitMetadata> {
    try {
      const raw = await fs.readFile(this.config.metadataPath, "utf8");
      const parsed = JSON.parse(raw) as Record<string, Partial<TBitMetadataEntry>>;
      const metadata: TBitMetadata = {};

      for (const [clave, entry] of Object.entries(parsed)) {
        if (!entry.length || !Number.isInteger(entry.length)) {
          continue;
        }

        const projection = entry.offsetV === undefined || entry.offsetAntiV === undefined
          ? await this.container.calculateProjection(clave)
          : { offsetV: entry.offsetV, offsetAntiV: entry.offsetAntiV };

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

  private async writeMetadata(metadata: TBitMetadata): Promise<void> {
    await fs.mkdir(dirname(this.config.metadataPath), { recursive: true });
    const tempPath = `${this.config.metadataPath}.tmp`;
    await fs.writeFile(tempPath, JSON.stringify(metadata, null, 2), "utf8");
    await fs.rename(tempPath, this.config.metadataPath);
  }

  private async beginWal(
    operation: TBitWalRecord["operation"],
    clave: string,
    length?: number,
    physicalLength?: number,
    offsetV?: number,
    offsetAntiV?: number
  ): Promise<string> {
    const id = createHash("sha256").update(`${operation}:${clave}:${Date.now()}:${Math.random()}`).digest("hex");

    await this.appendWal({
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

  private async finishWal(
    id: string,
    operation: TBitWalRecord["operation"],
    clave: string,
    state: Exclude<TBitWalState, "PENDING">,
    length?: number,
    physicalLength?: number,
    offsetV?: number,
    offsetAntiV?: number,
    error?: string
  ): Promise<void> {
    await this.appendWal({
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

  private async appendWal(record: TBitWalRecord): Promise<void> {
    await fs.mkdir(dirname(this.config.walPath), { recursive: true });
    await fs.appendFile(this.config.walPath, `${JSON.stringify(record)}\n`, "utf8");
  }

  private hashData(dato: string): string {
    return createHash("sha256").update(normalizeUnicodeText(dato), "utf8").digest("hex");
  }

  private signMetadata(clave: string, entry: Omit<TBitMetadataEntry, "authTag">): string {
    const secret = this.config.hmacSecrets.get(entry.authKeyId);

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
      .update(entry.authKeyId)
      .update("\0")
      .update(String(entry.probingAttempts ?? 0))
      .update(entry.authVersion === 2 ? `\0${entry.physicalLength ?? 0}\0${entry.encryption ?? "none"}` : "")
      .digest("hex");
  }

  private assertMetadataSignature(clave: string, entry: TBitMetadataEntry): void {
    if (!entry.authTag || !entry.authKeyId) {
      throw new Error("INTEGRIDAD CRIPTOGRAFICA NO DISPONIBLE: registro sin HMAC.");
    }

    const expected = this.signMetadata(clave, {
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

  private validateDatoSize(dato: string): number {
    const length = Buffer.byteLength(normalizeUnicodeText(dato), "utf8");

    if (length > this.maxDatoBytes()) {
      throw new Error(`El dato excede el limite del MVP (${this.maxDatoBytes()} bytes).`);
    }

    return length;
  }

  private findAllocatableOffsets(metadata: TBitMetadata, clave: string, primaryOffsetV: number, frameLength: number) {
    const allocationMap = this.buildAllocationMap(metadata);
    return this.findAllocatableOffsetsInMap(allocationMap, clave, primaryOffsetV, frameLength);
  }

  private findAllocatableOffsetsInMap(
    allocationMap: AllocationMap,
    clave: string,
    primaryOffsetV: number,
    frameLength: number
  ) {
    const step = this.deriveProbeStep(clave);

    for (let attempt = 0; attempt < MAX_PROBING_ATTEMPTS; attempt += 1) {
      const offsetV = this.normalizeUsableOffset(primaryOffsetV + attempt * step);
      const relative = offsetV - SYSTEM_HEADER_SIZE;
      const offsetAntiV = SYSTEM_HEADER_SIZE + ((this.usableContainerBytes() - relative) % this.usableContainerBytes());
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

  private buildAllocationMap(metadata: TBitMetadata): AllocationMap {
    const allocationMap = new AllocationMap(SYSTEM_HEADER_SIZE, this.containerSizeBytes());
    allocationMap.load(Object.entries(metadata).map(([clave, entry]) => ({
      clave,
        ranges: [
        ...allocationMap.circularRanges(entry.offsetV, entry.physicalLength ?? entry.length + FRAME_HEADER_SIZE),
        ...allocationMap.circularRanges(entry.offsetAntiV, entry.physicalLength ?? entry.length + FRAME_HEADER_SIZE)
      ]
    })));
    return allocationMap;
  }

  private deriveProbeStep(clave: string): number {
    const digest = createHash("sha256").update("probe").update(clave).digest();
    const raw = digest.readUInt32LE(0);
    const step = (raw % Math.max(1, this.usableContainerBytes() - 1)) + 1;
    return step % 2 === 0 ? step + 1 : step;
  }

  private normalizeUsableOffset(offset: number): number {
    return SYSTEM_HEADER_SIZE + ((offset - SYSTEM_HEADER_SIZE) % this.usableContainerBytes() + this.usableContainerBytes()) % this.usableContainerBytes();
  }

  private async updateReplica(): Promise<void> {
    await this.ensureContainer();
    await fs.mkdir(this.config.replicasDir, { recursive: true });

    if (existsSync(this.config.metadataPath)) {
      await fs.copyFile(this.config.metadataPath, resolve(this.config.replicasDir, "universo.tbit.meta.json"));
    }

    await fs.writeFile(resolve(this.config.replicasDir, `${this.config.name}.replica-manifest.json`), JSON.stringify({
      updatedAt: new Date().toISOString(),
      mode: "LIGHTWEIGHT_LOCAL_REPLICA",
      note: "Las escrituras normales solo replican metadata/manifest para evitar copiar contenedores grandes en cada operacion. Use snapshot/export para una copia fisica completa verificable."
    }, null, 2), "utf8");

    if (this.config.remoteReplicaDir) {
      await fs.mkdir(this.config.remoteReplicaDir, { recursive: true });
      await fs.copyFile(this.config.containerPath, resolve(this.config.remoteReplicaDir, `${this.config.name}.tbit`));

      if (existsSync(this.config.metadataPath)) {
        await fs.copyFile(this.config.metadataPath, resolve(this.config.remoteReplicaDir, `${this.config.name}.meta.json`));
      }

      if (existsSync(this.config.walPath)) {
        await fs.copyFile(this.config.walPath, resolve(this.config.remoteReplicaDir, `${this.config.name}.wal.jsonl`));
      }

      const checksum = await this.globalChecksum();
      await fs.writeFile(resolve(this.config.remoteReplicaDir, `${this.config.name}.replica-manifest.json`), JSON.stringify({
        updatedAt: new Date().toISOString(),
        ...checksum
      }, null, 2), "utf8");
    }
  }

  private async globalChecksum(): Promise<{ containerHash: string; metadataHash: string; combinedHash: string }> {
    await this.ensureContainer();

    const containerHash = await this.hashFile(this.config.containerPath);
    const metadataHash = existsSync(this.config.metadataPath) ? await this.hashFile(this.config.metadataPath) : this.hashData("{}");
    const combinedHash = createHash("sha256").update(containerHash).update(metadataHash).digest("hex");

    return { containerHash, metadataHash, combinedHash };
  }

  private async hashFile(filePath: string): Promise<string> {
    const content = await fs.readFile(filePath);
    return createHash("sha256").update(content).digest("hex");
  }

  private async copyIfExistsOrWrite(source: string, target: string, fallback: string): Promise<void> {
    if (existsSync(source)) {
      await fs.copyFile(source, target);
      return;
    }

    await fs.writeFile(target, fallback, "utf8");
  }

  private maxDatoBytes(): number {
    return this.config.maxDatoBytes ?? DEFAULT_MAX_DATO_BYTES;
  }

  private maxRecords(): number {
    if (this.config.maxRecords) return this.config.maxRecords;

    const configuredSizeMb = Math.max(1, Math.floor(this.containerSizeBytes() / (1024 * 1024)));
    return Math.min(
      ABSOLUTE_MAX_RECORDS,
      Math.max(MIN_DYNAMIC_MAX_RECORDS, configuredSizeMb * RECORDS_PER_CONTAINER_MB)
    );
  }

  private containerSizeBytes(): number {
    try {
      if (existsSync(this.config.containerPath)) {
        return statSync(this.config.containerPath).size;
      }
    } catch {
      // If stat fails, fall back to configured size; health reporting surfaces filesystem issues.
    }

    return (this.config.containerSizeMB ?? DEFAULT_CONTAINER_SIZE_MB) * 1024 * 1024;
  }

  private usableContainerBytes(): number {
    return this.containerSizeBytes() - SYSTEM_HEADER_SIZE;
  }
}
