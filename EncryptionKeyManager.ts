import { createHash } from "crypto";

export type EncryptionKeyMaterial = {
  id: string;
  secret: string;
  key: Buffer;
  active: boolean;
};

function normalizeKeyId(value: string | undefined): string {
  return (value ?? "primary")
    .normalize("NFC")
    .trim()
    .replace(/[^a-zA-Z0-9_.:-]+/g, "_")
    .slice(0, 48) || "primary";
}

function deriveKey(secret: string): Buffer {
  if (!secret || secret.length < 32) {
    throw new Error("CIFRADO_NO_DISPONIBLE: cada llave AES-GCM requiere un secreto de al menos 32 caracteres.");
  }
  return createHash("sha256").update(secret, "utf8").digest();
}

function parsePreviousSecrets(): EncryptionKeyMaterial[] {
  const raw = process.env.TBIT_ENCRYPTION_PREVIOUS_SECRETS?.trim();
  if (!raw) return [];

  return raw
    .split(/[;,]/g)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const separator = item.indexOf(":");
      if (separator <= 0) return null;
      const id = normalizeKeyId(item.slice(0, separator));
      const secret = item.slice(separator + 1);
      if (!secret || secret.length < 32) return null;
      return { id, secret, key: deriveKey(secret), active: false };
    })
    .filter((item): item is EncryptionKeyMaterial => Boolean(item));
}

export function getActiveEncryptionKey(): EncryptionKeyMaterial {
  const secret = process.env.TBIT_ENCRYPTION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("CIFRADO_NO_DISPONIBLE: configura TBIT_ENCRYPTION_SECRET con al menos 32 caracteres.");
  }

  return {
    id: normalizeKeyId(process.env.TBIT_ENCRYPTION_KEY_ID ?? process.env.TBIT_ENCRYPTION_ACTIVE_KEY_ID),
    secret,
    key: deriveKey(secret),
    active: true,
  };
}

export function getEncryptionKeyRing(): EncryptionKeyMaterial[] {
  const active = getActiveEncryptionKey();
  const byId = new Map<string, EncryptionKeyMaterial>();
  byId.set(active.id, active);

  for (const previous of parsePreviousSecrets()) {
    if (!byId.has(previous.id)) byId.set(previous.id, previous);
  }

  return [...byId.values()];
}

export function getEncryptionKeyById(keyId: string): EncryptionKeyMaterial {
  const normalized = normalizeKeyId(keyId);
  const key = getEncryptionKeyRing().find((candidate) => candidate.id === normalized);
  if (!key) {
    throw new Error(`CIFRADO_LLAVE_NO_DISPONIBLE: no existe llave AES-GCM '${normalized}' en el keyring local.`);
  }
  return key;
}

export function getEncryptionKeyStatus() {
  const active = getActiveEncryptionKey();
  const ring = getEncryptionKeyRing();

  return {
    enabled: true,
    algorithm: "AES-256-GCM",
    activeKeyId: active.id,
    previousKeyIds: ring.filter((key) => !key.active).map((key) => key.id),
    keyCount: ring.length,
  };
}
