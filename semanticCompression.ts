import { createHash } from "crypto";
import { normalizeTBitKey } from "./textEncoding";

export type CompressionState =
  | "COMPRESSION_PENDING"
  | "ARCHIVE_WRITTEN"
  | "ORIGINALS_ZERO_FILLED"
  | "COMPRESSION_COMMITTED"
  | "COMPRESSION_PARTIAL";

export type SemanticCompressionRequest = {
  dominioTarget: string;
  candidateKeys?: string[];
  coldBefore?: number;
  maxItems?: number;
  dryRun?: boolean;
};

export type SemanticCompressionReport = {
  status: "SPACE_OPTIMIZED" | "DRY_RUN" | "NO_CANDIDATES" | "PARTIAL_RELEASE";
  state: CompressionState;
  dominioTarget: string;
  archiveKey?: string;
  archiveChecksum?: string;
  bytesLiberados: number;
  regionesLiberadas: number;
  vitsCondensados: number;
  originals: Array<{
    key: string;
    bytes: number;
    checksum: string;
    released: boolean;
    releaseMode: "ZERO_FILL" | "LOGICAL_ONLY" | "DRY_RUN" | "FAILED";
    error?: string;
  }>;
  manifestChecksum: string;
  note: string;
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
  destroy?: (key: string, length?: number) => Promise<unknown>;
  delete?: (key: string, length?: number) => Promise<unknown>;
  colapsar?: (key: string, length?: number) => Promise<unknown>;
};

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
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

async function callRead(storage: DynamicStorage, key: string): Promise<unknown> {
  const fn = storage.read ?? storage.recover ?? storage.recuperar ?? storage.oracle;
  if (!fn) throw new Error("El storage no expone un metodo de recuperacion compatible.");
  return fn.call(storage, key);
}

async function callWrite(storage: DynamicStorage, key: string, payload: string): Promise<unknown> {
  const fn = storage.inject ?? storage.write ?? storage.memorizar ?? storage.inyectar;
  if (!fn) throw new Error("El storage no expone un metodo de escritura compatible.");
  return fn.call(storage, key, payload);
}

async function callRelease(storage: DynamicStorage, key: string, bytes: number): Promise<"ZERO_FILL" | "LOGICAL_ONLY"> {
  const fn = storage.destroy ?? storage.delete ?? storage.colapsar;
  if (!fn) return "LOGICAL_ONLY";
  await fn.call(storage, key, bytes);
  return "ZERO_FILL";
}

function buildArchiveKey(dominioTarget: string): string {
  const safeDomain = normalizeTBitKey(dominioTarget || "AI");
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  return `${safeDomain}::ArchivoCondensado::${stamp}`;
}

export async function compressSemanticGravity(
  storageLike: unknown,
  request: SemanticCompressionRequest,
): Promise<SemanticCompressionReport> {
  const storage = storageLike as DynamicStorage;
  const dominioTarget = normalizeTBitKey(request.dominioTarget || "AI");
  const uniqueKeys = [...new Set((request.candidateKeys ?? []).map(normalizeTBitKey).filter(Boolean))];
  const candidateKeys = uniqueKeys.slice(0, request.maxItems ?? 50);

  if (candidateKeys.length === 0) {
    const manifest = {
      dominioTarget,
      candidateKeys: [],
      generatedAt: new Date().toISOString(),
      reason: "No se recibieron candidateKeys. El compresor no borra por inferencia ciega.",
    };
    return {
      status: "NO_CANDIDATES",
      state: "COMPRESSION_PENDING",
      dominioTarget,
      bytesLiberados: 0,
      regionesLiberadas: 0,
      vitsCondensados: 0,
      originals: [],
      manifestChecksum: sha256(JSON.stringify(manifest)),
      note: "Modo seguro: envia candidateKeys explicitas o integra un catalogo de metadata auditable.",
    };
  }

  const originals: SemanticCompressionReport["originals"] = [];
  const payloads: Array<{ key: string; payload: string; checksum: string; bytes: number }> = [];

  for (const key of candidateKeys) {
    const payload = extractPayloadText(await callRead(storage, key));
    const bytes = Buffer.byteLength(payload, "utf8");
    const checksum = sha256(payload);
    payloads.push({ key, payload, checksum, bytes });
    originals.push({ key, bytes, checksum, released: false, releaseMode: request.dryRun ? "DRY_RUN" : "FAILED" });
  }

  const archivePayload = {
    _tbit_meta: {
      type: "SEMANTIC_FRACTAL_ARCHIVE",
      version: "1.0",
      dominioTarget,
      generatedAt: new Date().toISOString(),
      state: "ARCHIVE_WRITTEN" satisfies CompressionState,
      reversible: true,
      originalCount: payloads.length,
      originalChecksums: payloads.map(({ key, checksum, bytes }) => ({ key, checksum, bytes })),
    },
    summary: {
      description:
        "Archivo condensado verificable. Conserva payloads originales para auditoria, expansion futura y recuperacion semantica.",
      totalBytes: payloads.reduce((sum, item) => sum + item.bytes, 0),
    },
    payloads: payloads.map(({ key, payload, checksum, bytes }) => ({ key, payload, checksum, bytes })),
  };

  const archiveText = JSON.stringify(archivePayload);
  const archiveChecksum = sha256(archiveText);
  const archiveKey = buildArchiveKey(dominioTarget);

  if (!request.dryRun) {
    await callWrite(storage, archiveKey, archiveText);
  }

  let state: CompressionState = request.dryRun ? "COMPRESSION_PENDING" : "ARCHIVE_WRITTEN";
  let bytesLiberados = 0;
  let regionesLiberadas = 0;

  if (!request.dryRun) {
    for (const original of originals) {
      try {
        const releaseMode = await callRelease(storage, original.key, original.bytes);
        original.released = true;
        original.releaseMode = releaseMode;
        bytesLiberados += original.bytes;
        regionesLiberadas += 1;
      } catch (error) {
        original.released = false;
        original.releaseMode = "FAILED";
        original.error = error instanceof Error ? error.message : "Fallo desconocido al liberar region.";
      }
    }
    state = originals.every((item) => item.released) ? "COMPRESSION_COMMITTED" : "COMPRESSION_PARTIAL";
  }

  const reportCore = {
    dominioTarget,
    archiveKey,
    archiveChecksum,
    originals,
    state,
    bytesLiberados,
    regionesLiberadas,
  };

  return {
    status: request.dryRun ? "DRY_RUN" : state === "COMPRESSION_COMMITTED" ? "SPACE_OPTIMIZED" : "PARTIAL_RELEASE",
    state,
    dominioTarget,
    archiveKey,
    archiveChecksum,
    bytesLiberados,
    regionesLiberadas,
    vitsCondensados: originals.length,
    originals,
    manifestChecksum: sha256(JSON.stringify(reportCore)),
    note:
      "Compresion semantica verificable: primero escribe archivo condensado, luego libera regiones originales. El archivo .tbit puede no reducir su tamano fisico hasta una reconstruccion/export-import.",
  };
}
