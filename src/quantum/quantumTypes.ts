/**
 * quantumTypes — Tanda 4 (Fase 79): correccion de la regresion del frontend.
 *
 * Tipos, constantes de color y helpers compartidos entre la interfaz de
 * Q-Vault OS (App.tsx) y las escenas 3D de Quantum Engine
 * (quantum/QuantumScenes.tsx). Vive en un modulo propio SIN dependencias de
 * three para que App.tsx pueda importarlo sin arrastrar la pila 3D al bundle
 * inicial: la escena 3D se carga con importacion dinamica (React.lazy).
 *
 * Los tipos y helpers se trasladan VERBATIM desde App.tsx (sin cambios de
 * comportamiento) para que ambas vistas compartan una unica fuente de verdad.
 */

export type Vit = {
  id: string;
  key: string;
  data: string;
  position: [number, number, number];
  antiPosition: [number, number, number];
  offsetV: number;
  offsetAntiV: number;
  createdAt: string;
};

export type FocusTarget = {
  id: string;
  position: [number, number, number];
  startedAt: number;
};

export type QueryLine = {
  from: [number, number, number];
  to: [number, number, number];
  startedAt: number;
};

export type SecondBrainPreviewNode = {
  id: string;
  key: string;
  label: string;
  position: [number, number, number];
  antiPosition: [number, number, number];
  kind: "live" | "memory" | "chat";
  source?: string;
  tags?: string[];
  chunkCount: number;
};

export type SecondBrainPreviewLink = {
  id: string;
  source: SecondBrainPreviewNode;
  target: SecondBrainPreviewNode;
  type: string;
};

/** Paleta compartida de la escena cuantica (trasladada verbatim desde App.tsx). */
export const DATA_COLOR = "#7e1bfd";
export const DATA_HALO_COLOR = "#8b2cff";
export const ANTI_COLOR = "#ff0000";
export const ANTI_HALO_COLOR = "#ff2020";

export function isChunkKey(key: unknown): boolean {
  return /(^|::)chunk_\d+$/i.test(String(key ?? ""));
}

export function isFiniteVector3(value: unknown): value is [number, number, number] {
  return Array.isArray(value)
    && value.length === 3
    && value.every((entry) => typeof entry === "number" && Number.isFinite(entry));
}

export function invertVector3(value: [number, number, number]): [number, number, number] {
  return [-value[0], -value[1], -value[2]];
}

export function getParentKey(key: string): string | undefined {
  const segments = key.split("::").filter(Boolean);

  if (segments.length <= 1) {
    return undefined;
  }

  return segments.slice(0, -1).join("::");
}
