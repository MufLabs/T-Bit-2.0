import { AiProvider, AiProviderRequest, AiProviderResponse } from "./AiProvider";
import type { AiProviderRuntime } from "./AiProviderFactory";

/**
 * FallbackProviderChain — Fase 65 (Motor de conectores IA con failover continuo).
 *
 * Decorador de `AiProvider` que envuelve una cadena de runtimes y conmuta en
 * caliente ante errores de cuota (429), servidor (500/502/503/504), timeout o
 * fallos de red/autenticacion, sin interrumpir la respuesta al usuario.
 *
 * - Cooldown por proveedor: un proveedor que falla queda en enfriamiento y se
 *   reintenta automaticamente al expirar (recuperacion automatica).
 * - Monitoreo: latencia por request, contadores de exito/fallo y estado de
 *   salud consultable via `getHealth()`.
 * - Sin dependencias nuevas (D-005).
 */

export type ProviderHealth = {
  id: string;
  label: string;
  model: string;
  mode: AiProviderRuntime["mode"];
  available: boolean;
  inCooldown: boolean;
  cooldownUntil: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
  totalRequests: number;
  totalFailures: number;
  lastLatencyMs: number | null;
  avgLatencyMs: number | null;
};

export type FallbackProviderChainOptions = {
  /** Enfriamiento estandar tras un fallo recuperable. Default 30 s. */
  cooldownMs?: number;
  /** Enfriamiento largo para cuota agotada o clave invalida. Default 5 min. */
  quotaCooldownMs?: number;
  /** Timeout por intento de generacion. Default 60 s. */
  requestTimeoutMs?: number;
  /** Callback de auditoria ante cada conmutacion (failover). */
  onFailover?: (info: { from: string; to: string | null; reason: string }) => void;
};

type EntryState = {
  runtime: AiProviderRuntime;
  cooldownUntil: number;
  lastError: string | null;
  lastErrorAt: string | null;
  totalRequests: number;
  totalFailures: number;
  latencies: number[];
};

const MAX_LATENCY_SAMPLES = 50;

export function classifyProviderFailure(error: unknown): {
  kind: "quota" | "server" | "timeout" | "auth" | "network" | "unknown";
  retryable: boolean;
  cooldownMs: number;
} {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();

  if (lower.includes("timeout") || lower.includes("etimedout")) {
    return { kind: "timeout", retryable: true, cooldownMs: 30_000 };
  }
  if (/(^|\D)(429)(\D|$)/.test(message) || lower.includes("rate limit") || lower.includes("resource_exhausted") || lower.includes("cuota") || lower.includes("quota")) {
    return { kind: "quota", retryable: true, cooldownMs: 300_000 };
  }
  if (/(^|\D)(500|502|503|504)(\D|$)/.test(message) || lower.includes("bad gateway") || lower.includes("service unavailable") || lower.includes("overloaded")) {
    return { kind: "server", retryable: true, cooldownMs: 30_000 };
  }
  if (/(^|\D)(401|403)(\D|$)/.test(message) || lower.includes("unauthorized") || lower.includes("invalid api key")) {
    return { kind: "auth", retryable: true, cooldownMs: 300_000 };
  }
  if (lower.includes("fetch failed") || lower.includes("econnrefused") || lower.includes("enotfound") || lower.includes("econnreset") || lower.includes("network")) {
    return { kind: "network", retryable: true, cooldownMs: 60_000 };
  }
  return { kind: "unknown", retryable: true, cooldownMs: 30_000 };
}

export class FallbackProviderChain implements AiProvider {
  readonly label = "T-BIT Fallback Chain";
  private readonly entries: EntryState[];
  private readonly options: Required<Omit<FallbackProviderChainOptions, "onFailover">> & Pick<FallbackProviderChainOptions, "onFailover">;

  constructor(runtimes: AiProviderRuntime[], options: FallbackProviderChainOptions = {}) {
    this.entries = runtimes.map((runtime) => ({
      runtime,
      cooldownUntil: 0,
      lastError: null,
      lastErrorAt: null,
      totalRequests: 0,
      totalFailures: 0,
      latencies: [],
    }));
    this.options = {
      cooldownMs: options.cooldownMs ?? 30_000,
      quotaCooldownMs: options.quotaCooldownMs ?? 300_000,
      requestTimeoutMs: options.requestTimeoutMs ?? 60_000,
      onFailover: options.onFailover,
    };
  }

  get size(): number {
    return this.entries.length;
  }

  getHealth(): ProviderHealth[] {
    const now = Date.now();
    return this.entries.map((entry) => ({
      id: entry.runtime.id,
      label: entry.runtime.label,
      model: entry.runtime.model,
      mode: entry.runtime.mode,
      available: entry.runtime.mode === "deterministic" || entry.runtime.mode === "local" || entry.cooldownUntil <= now,
      inCooldown: entry.cooldownUntil > now,
      cooldownUntil: entry.cooldownUntil > now ? new Date(entry.cooldownUntil).toISOString() : null,
      lastError: entry.lastError,
      lastErrorAt: entry.lastErrorAt,
      totalRequests: entry.totalRequests,
      totalFailures: entry.totalFailures,
      lastLatencyMs: entry.latencies.length ? entry.latencies[entry.latencies.length - 1] : null,
      avgLatencyMs: entry.latencies.length
        ? Math.round(entry.latencies.reduce((sum, value) => sum + value, 0) / entry.latencies.length)
        : null,
    }));
  }

  async generateWithTools(request: AiProviderRequest): Promise<AiProviderResponse> {
    if (this.entries.length === 0) {
      throw new Error("FallbackProviderChain sin proveedores configurados.");
    }

    let lastError: unknown = null;

    for (let index = 0; index < this.entries.length; index += 1) {
      const entry = this.entries[index];
      if (entry.cooldownUntil > Date.now()) continue;

      const startedAt = Date.now();
      entry.totalRequests += 1;
      try {
        const response = await this.withTimeout(entry.runtime.provider.generateWithTools(request), entry.runtime.label);
        entry.latencies.push(Date.now() - startedAt);
        if (entry.latencies.length > MAX_LATENCY_SAMPLES) entry.latencies.shift();
        return response;
      } catch (error) {
        entry.totalFailures += 1;
        entry.lastError = error instanceof Error ? error.message : String(error);
        entry.lastErrorAt = new Date().toISOString();
        const classification = classifyProviderFailure(error);
        const cooldown = classification.kind === "quota" || classification.kind === "auth"
          ? this.options.quotaCooldownMs
          : this.options.cooldownMs;
        entry.cooldownUntil = Date.now() + cooldown;
        lastError = error;
        if (this.options.onFailover) {
          this.options.onFailover({
            from: entry.runtime.id,
            to: this.entries[index + 1]?.runtime.id ?? null,
            reason: `${classification.kind}: ${entry.lastError.slice(0, 200)}`,
          });
        }
      }
    }

    if (lastError instanceof Error) throw lastError;
    throw new Error("Todos los proveedores IA de la cadena fallaron o estan en enfriamiento.");
  }

  private withTimeout(promise: Promise<AiProviderResponse>, label: string): Promise<AiProviderResponse> {
    const timeoutMs = this.options.requestTimeoutMs;
    return new Promise<AiProviderResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`${label}: timeout de proveedor IA tras ${timeoutMs} ms.`));
      }, timeoutMs);
      promise.then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        (error) => {
          clearTimeout(timer);
          reject(error instanceof Error ? error : new Error(String(error)));
        },
      );
    });
  }
}

