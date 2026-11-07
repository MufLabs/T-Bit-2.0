import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";

/**
 * StateViews — Tanda 3 (Fase 76).
 *
 * Estados de carga, vacío y error reutilizables y accesibles para todos los
 * paneles y flujos de Q-Vault OS / Quantum Engine. Complementan el sistema de
 * diseño de `index.css` sin reemplazar ninguna clase existente.
 */

export function LoadingState({ label = "Cargando..." }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="flex items-center gap-2 px-1 py-2 text-[11px] text-cyan-100/70">
      <Loader2 size={13} className="animate-spin text-tbit-cyan" aria-hidden />
      <span>{label}</span>
    </div>
  );
}

export function SkeletonLines({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-2" aria-hidden>
      {Array.from({ length: lines }, (_, index) => (
        <div
          key={index}
          className="tbit-skeleton h-3"
          style={{ width: `${88 - index * 14}%` }}
        />
      ))}
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-dashed border-white/12 bg-white/[0.03] px-3 py-3 text-center">
      <p className="text-[11px] font-semibold text-blue-50/75">{title}</p>
      {hint && <p className="mt-1 text-[10px] leading-relaxed text-blue-100/45">{hint}</p>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="rounded-lg border border-red-400/30 bg-red-950/25 px-3 py-3">
      <div className="flex items-start gap-2">
        <AlertTriangle size={14} className="mt-0.5 shrink-0 text-red-300" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold leading-relaxed text-red-200">{message}</p>
          {onRetry && (
            <button type="button" onClick={onRetry} className="tbit-btn tbit-btn-ghost mt-2 !px-3 !py-1.5 !text-[10px]">
              <RefreshCw size={11} aria-hidden />
              Reintentar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function StateSection({ children }: { children: ReactNode }) {
  return <div className="tbit-animate-in">{children}</div>;
}
