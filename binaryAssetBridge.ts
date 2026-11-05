import { createHash } from "crypto";
import { deleteAsset, registerAsset } from "./assetManager";
import {
  deleteMemoryRecordsBatch,
  recallMemory,
  rememberMemoryBatch,
} from "./memoryCore";
import type { MemoryCoreRememberRequest } from "./memoryCore";

export type BinaryAssetImportRequest = {
  userId: string;
  filename: string;
  mimeType?: string;
  contentBase64: string;
  key?: string;
};

export type BinaryAssetImportResult = {
  key: string;
  assetKey: string;
  filename: string;
  mimeType: string;
  originalBytes: number;
  sha256: string;
  chunkCount: number;
  chunks: string[];
};

export type BinaryAssetReconstructResult = {
  key: string;
  filename: string;
  mimeType: string;
  contentBase64: string;
  originalBytes: number;
  sha256: string;
  chunkCount: number;
};

// T-BIT records still have a 64 KB physical payload ceiling. Raw binary expands
// when stored as base64 inside JSON, so 32 KB is the largest safe production
// chunk until the container record contract is raised deliberately.
const SAFE_BINARY_CHUNK_BYTES = 32 * 1024;
const TARGET_BINARY_CHUNK_TIERS = [
  { minBytes: 64 * 1024 * 1024, chunkBytes: 256 * 1024 },
  { minBytes: 16 * 1024 * 1024, chunkBytes: 128 * 1024 },
  { minBytes: 4 * 1024 * 1024, chunkBytes: 64 * 1024 },
  { minBytes: 0, chunkBytes: 32 * 1024 },
];

function selectBinaryChunkBytes(originalBytes: number): number {
  const target = TARGET_BINARY_CHUNK_TIERS.find((tier) => originalBytes >= tier.minBytes)?.chunkBytes
    ?? SAFE_BINARY_CHUNK_BYTES;
  return Math.min(target, SAFE_BINARY_CHUNK_BYTES);
}

function slug(value: string): string {
  return value
    .normalize("NFC")
    .trim()
    .replace(/\.[^.]+$/, "")
    .replace(/[^\p{L}\p{N}_:-]+/gu, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

function sha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function inferAssetType(mimeType: string, filename: string): string {
  const lowerName = filename.toLowerCase();
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType.includes("zip") || lowerName.endsWith(".zip")) return "archive";
  if (lowerName.endsWith(".exe") || lowerName.endsWith(".msi") || lowerName.endsWith(".bat") || lowerName.endsWith(".cmd")) {
    return "executable-passive";
  }
  return "binary";
}

function chunkBuffer(buffer: Buffer, chunkSize: number): Buffer[] {
  const chunks: Buffer[] = [];
  for (let offset = 0; offset < buffer.length; offset += chunkSize) {
    chunks.push(buffer.subarray(offset, Math.min(offset + chunkSize, buffer.length)));
  }
  return chunks;
}

function buildChunkKey(rootKey: string, index: number): string {
  return `${rootKey}::chunk_${String(index + 1).padStart(4, "0")}`;
}

export async function importBinaryAsset(
  storage: unknown,
  request: BinaryAssetImportRequest,
): Promise<BinaryAssetImportResult> {
  const mimeType = request.mimeType?.trim() || "application/octet-stream";
  const binary = Buffer.from(request.contentBase64, "base64");
  const originalBytes = binary.length;
  const fileHash = sha256(binary);
  const rootKey = request.key || `Asset::${slug(request.userId)}::${slug(request.filename)}`;
  const chunkBytes = selectBinaryChunkBytes(originalBytes);
  const chunks = chunkBuffer(binary, chunkBytes);
  const chunkKeys: string[] = [];

  try {
    const memoryRecords: MemoryCoreRememberRequest[] = [];

    for (let index = 0; index < chunks.length; index += 1) {
      const chunk = chunks[index];
      const chunkKey = buildChunkKey(rootKey, index);
      chunkKeys.push(chunkKey);
      memoryRecords.push({
        userId: request.userId,
        key: chunkKey,
        text: `Binary chunk ${index + 1}/${chunks.length} for ${request.filename}`,
        payload: {
          type: "BINARY_CHUNK",
          parentKey: rootKey,
          filename: request.filename,
          mimeType,
          chunkIndex: index,
          chunkCount: chunks.length,
          bytes: chunk.length,
          encoding: "base64",
          contentBase64: chunk.toString("base64"),
        },
        tags: ["chunk", inferAssetType(mimeType, request.filename)],
        links: [],
        source: "binary-chunk",
        domain: "Asset",
        collection: "Chunks",
      });
    }

    memoryRecords.push({
      userId: request.userId,
      key: rootKey,
      text: `Archivo binario importado: ${request.filename}. ${chunks.length} fragmentos T-BIT.`,
      payload: {
        type: "BINARY_ASSET",
        filename: request.filename,
        mimeType,
        assetType: inferAssetType(mimeType, request.filename),
        originalBytes,
        sha256: fileHash,
        chunkCount: chunks.length,
        chunkBytes,
        chunkKeyPattern: `${rootKey}::chunk_0001..${String(chunks.length).padStart(4, "0")}`,
        passiveOnly: inferAssetType(mimeType, request.filename) === "executable-passive",
      },
      tags: [inferAssetType(mimeType, request.filename)],
      links: [],
      source: "binary",
      domain: "Asset",
      collection: "Files",
    });

    await rememberMemoryBatch(storage, memoryRecords);

    const asset = await registerAsset({
      rootKey,
      userId: request.userId,
      type: inferAssetType(mimeType, request.filename),
      title: request.filename,
      filename: request.filename,
      dependencies: chunkKeys,
      bytes: originalBytes,
    });

    return {
      key: rootKey,
      assetKey: asset.assetKey,
      filename: request.filename,
      mimeType,
      originalBytes,
      sha256: fileHash,
      chunkCount: chunks.length,
      chunks: chunkKeys,
    };
  } catch (error) {
    await deleteMemoryRecordsBatch(storage, [rootKey, ...chunkKeys]).catch(() => []);
    throw error;
  }
}

export async function reconstructBinaryAsset(storage: unknown, rootKey: string): Promise<BinaryAssetReconstructResult> {
  const manifest = await recallMemory(storage, rootKey);
  const payload = manifest.payload as {
    filename?: string;
    mimeType?: string;
    originalBytes?: number;
    sha256?: string;
    chunks?: string[];
    chunkCount?: number;
  };
  const chunkKeys = Array.isArray(payload.chunks)
    ? payload.chunks
    : Array.from({ length: Number(payload.chunkCount ?? 0) }, (_, index) => buildChunkKey(rootKey, index));
  const buffers: Buffer[] = [];

  for (const chunkKey of chunkKeys) {
    const chunkRecord = await recallMemory(storage, chunkKey);
    const chunkPayload = chunkRecord.payload as { contentBase64?: string };
    if (typeof chunkPayload.contentBase64 !== "string") {
      throw new Error(`Chunk binario invalido: ${chunkKey}`);
    }
    buffers.push(Buffer.from(chunkPayload.contentBase64, "base64"));
  }

  const binary = Buffer.concat(buffers);
  const currentHash = sha256(binary);
  if (payload.sha256 && payload.sha256 !== currentHash) {
    throw new Error("CORRUPCION DE INTEGRIDAD: hash reconstruido no coincide con manifiesto.");
  }

  return {
    key: rootKey,
    filename: payload.filename || rootKey.split("::").slice(-1)[0] || "asset.bin",
    mimeType: payload.mimeType || "application/octet-stream",
    contentBase64: binary.toString("base64"),
    originalBytes: payload.originalBytes ?? binary.length,
    sha256: currentHash,
    chunkCount: chunkKeys.length,
  };
}

export async function deleteBinaryAsset(storage: unknown, rootOrAssetKey: string) {
  return deleteAsset(storage, rootOrAssetKey);
}
