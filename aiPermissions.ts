import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

export type AiPermissionAction = "read" | "write" | "delete" | "search" | "compute";

export type AiPermissionsPolicy = {
  version: "tbit-ai-permissions-v1";
  updatedAt: string;
  canRead: boolean;
  canWrite: boolean;
  canDelete: boolean;
  canSearch: boolean;
  canCompute: boolean;
  requireDeleteConfirmation: boolean;
  maxWriteBytes: number;
  allowedKeyPrefixes: string[];
  blockedKeyPrefixes: string[];
};

export type AiPermissionDecision = {
  allowed: boolean;
  action: AiPermissionAction;
  reason: string;
  requiresConfirmation: boolean;
};

const POLICY_PATH = path.join(process.cwd(), "data", "ai-permissions.json");

const DEFAULT_POLICY: AiPermissionsPolicy = {
  version: "tbit-ai-permissions-v1",
  updatedAt: new Date(0).toISOString(),
  canRead: true,
  canWrite: true,
  canDelete: false,
  canSearch: true,
  canCompute: true,
  requireDeleteConfirmation: true,
  maxWriteBytes: 64 * 1024,
  allowedKeyPrefixes: [],
  blockedKeyPrefixes: ["Sistema::Secretos", "Security::Secrets", "TBIT::Secrets"],
};

function normalizePrefix(prefix: string): string {
  return prefix.normalize("NFC").trim();
}

function cleanPolicy(input: Partial<AiPermissionsPolicy>): AiPermissionsPolicy {
  return {
    ...DEFAULT_POLICY,
    ...input,
    version: "tbit-ai-permissions-v1",
    updatedAt: new Date().toISOString(),
    maxWriteBytes: Number.isFinite(input.maxWriteBytes) && Number(input.maxWriteBytes) > 0
      ? Math.min(Number(input.maxWriteBytes), 1024 * 1024)
      : DEFAULT_POLICY.maxWriteBytes,
    allowedKeyPrefixes: Array.isArray(input.allowedKeyPrefixes)
      ? input.allowedKeyPrefixes.filter((item): item is string => typeof item === "string").map(normalizePrefix).filter(Boolean)
      : [],
    blockedKeyPrefixes: Array.isArray(input.blockedKeyPrefixes)
      ? input.blockedKeyPrefixes.filter((item): item is string => typeof item === "string").map(normalizePrefix).filter(Boolean)
      : DEFAULT_POLICY.blockedKeyPrefixes,
  };
}

export async function getAiPermissionsPolicy(): Promise<AiPermissionsPolicy> {
  try {
    const parsed = JSON.parse(await readFile(POLICY_PATH, "utf8")) as Partial<AiPermissionsPolicy>;
    return cleanPolicy(parsed);
  } catch {
    return { ...DEFAULT_POLICY, updatedAt: new Date().toISOString() };
  }
}

export async function updateAiPermissionsPolicy(patch: Partial<AiPermissionsPolicy>): Promise<AiPermissionsPolicy> {
  const current = await getAiPermissionsPolicy();
  const next = cleanPolicy({ ...current, ...patch });
  await mkdir(path.dirname(POLICY_PATH), { recursive: true });
  await writeFile(POLICY_PATH, JSON.stringify(next, null, 2), "utf8");
  return next;
}

export async function assertAiPermission(
  action: AiPermissionAction,
  details: { key?: string; payloadBytes?: number; confirmed?: boolean } = {},
): Promise<AiPermissionDecision> {
  const policy = await getAiPermissionsPolicy();
  const key = details.key?.normalize("NFC").trim() ?? "";
  const allowedByAction = (
    (action === "read" && policy.canRead) ||
    (action === "write" && policy.canWrite) ||
    (action === "delete" && policy.canDelete) ||
    (action === "search" && policy.canSearch) ||
    (action === "compute" && policy.canCompute)
  );

  if (!allowedByAction) {
    throw new Error(`AI_PERMISSION_DENIED: la IA no tiene permiso para ${action}.`);
  }

  if (key && policy.blockedKeyPrefixes.some((prefix) => key === prefix || key.startsWith(`${prefix}::`))) {
    throw new Error(`AI_PERMISSION_DENIED: clave protegida por prefijo bloqueado (${key}).`);
  }

  if (key && policy.allowedKeyPrefixes.length > 0) {
    const allowedByPrefix = policy.allowedKeyPrefixes.some((prefix) => key === prefix || key.startsWith(`${prefix}::`));
    if (!allowedByPrefix) {
      throw new Error(`AI_PERMISSION_DENIED: clave fuera de prefijos permitidos (${key}).`);
    }
  }

  if (action === "write" && (details.payloadBytes ?? 0) > policy.maxWriteBytes) {
    throw new Error(`AI_PERMISSION_DENIED: escritura excede limite IA (${policy.maxWriteBytes} bytes).`);
  }

  if (action === "delete" && policy.requireDeleteConfirmation && !details.confirmed) {
    throw new Error("AI_PERMISSION_CONFIRMATION_REQUIRED: el borrado por IA requiere confirmacion humana explicita.");
  }

  return {
    allowed: true,
    action,
    reason: "Permiso concedido por politica local T-BIT.",
    requiresConfirmation: action === "delete" && policy.requireDeleteConfirmation,
  };
}
