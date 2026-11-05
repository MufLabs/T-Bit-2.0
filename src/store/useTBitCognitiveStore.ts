import { useSyncExternalStore } from "react";

import { enrichPayloadWithFractalProjection } from "../fractalProjection";

export type TBitCognitiveActionType = "INJECT" | "ORACLE" | "EQUATION" | "SYMBOLIC" | "TIME_RESOLVE";
export type TBitNetworkNodeStatus = "ONLINE" | "OFFLINE" | "SYNCING";
export type TBitMemoryGraph = {
  nodes: Array<{
    key: string;
    userId: string;
    tags: string[];
    links: string[];
    backlinks: string[];
    source: string;
    checksum: string;
    updatedAt: string;
  }>;
  links: Array<{ sourceKey: string; targetKey: string; type: "quantum-link" | "backlink" }>;
  tags: Record<string, string[]>;
};

export type TBitVector3 = [number, number, number];

export type TBitActionMeta = {
  type: TBitCognitiveActionType;
  key: string;
  coordinates?: TBitVector3;
  antiCoordinates?: TBitVector3;
  provider?: string;
  timestamp: number;
};

export type TBitCognitiveState = {
  isLlmThinking: boolean;
  isGravityCompressing: boolean;
  activeProvider: string;
  activeProviderName: string;
  lastActionMeta: TBitActionMeta | null;
  activeQueryLine: { from: TBitVector3; to: TBitVector3; type: TBitCognitiveActionType } | null;
  quantumPulseLine: { from: TBitVector3; to: TBitVector3; color: string } | null;
  networkNodes: Array<{
    nodeId: string;
    url: string;
    position: TBitVector3;
    status: TBitNetworkNodeStatus;
    ledgerChecksum: string;
  }>;
  isSyncingNetwork: boolean;
  activeDataBridgeLine: { from: TBitVector3; to: TBitVector3; type: "EXPORT" | "IMPORT" | "COMPARE" } | null;
  memoryGraph: TBitMemoryGraph | null;
  selectedMemoryNodeKey: string | null;
  showMemoryLinks: boolean;
  showMemoryAntiVits: boolean;
};

const ORIGIN: TBitVector3 = [0, 0, 0];

let state: TBitCognitiveState = {
  isLlmThinking: false,
  isGravityCompressing: false,
  activeProvider: "Deterministic",
  activeProviderName: "Deterministic",
  lastActionMeta: null,
  activeQueryLine: null,
  quantumPulseLine: null,
  networkNodes: [],
  isSyncingNetwork: false,
  activeDataBridgeLine: null,
  memoryGraph: null,
  selectedMemoryNodeKey: null,
  showMemoryLinks: true,
  showMemoryAntiVits: false,
};

const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return state;
}

function setState(next: Partial<TBitCognitiveState>) {
  state = { ...state, ...next };
  emit();
}

export const tbitCognitiveStore = {
  getState: getSnapshot,
  subscribe,
  setIsLlmThinking(thinking: boolean, provider?: string) {
    setState({
      isLlmThinking: thinking,
      activeProvider: provider ?? state.activeProvider,
      activeProviderName: provider ?? state.activeProviderName,
    });
  },
  setLastActionMeta(meta: Omit<TBitActionMeta, "timestamp"> & { timestamp?: number }) {
    const fullMeta: TBitActionMeta = {
      ...meta,
      timestamp: meta.timestamp ?? Date.now(),
    };
    const targetLine = fullMeta.coordinates
      ? {
          from: fullMeta.type === "ORACLE" ? fullMeta.coordinates : ORIGIN,
          to: fullMeta.type === "ORACLE" ? ORIGIN : fullMeta.coordinates,
          type: fullMeta.type,
        }
      : null;
    const color =
      fullMeta.type === "INJECT"
        ? "#00ffcc"
        : fullMeta.type === "ORACLE"
          ? "#ffaa00"
          : fullMeta.type === "EQUATION"
            ? "#f8e16c"
            : fullMeta.type === "TIME_RESOLVE"
              ? "#66e8ff"
              : "#b78cff";

    setState({
      lastActionMeta: fullMeta,
      activeProvider: fullMeta.provider ?? state.activeProvider,
      activeProviderName: fullMeta.provider ?? state.activeProviderName,
      activeQueryLine: targetLine,
      quantumPulseLine: targetLine ? { from: targetLine.from, to: targetLine.to, color } : null,
    });
  },
  clearActionMeta() {
    setState({ lastActionMeta: null, activeQueryLine: null, quantumPulseLine: null });
  },
  setLlmThinking(thinking: boolean, provider?: string) {
    tbitCognitiveStore.setIsLlmThinking(thinking, provider);
  },
  setGravityCompressing(compressing: boolean) {
    setState({ isGravityCompressing: compressing });
  },
  triggerQuantumVisualEvent(meta: {
    actionType: TBitCognitiveActionType;
    key: string;
    coordenadas?: TBitVector3;
    coordinates?: TBitVector3;
    timestamp?: number;
    provider?: string;
  }) {
    tbitCognitiveStore.setLastActionMeta({
      type: meta.actionType,
      key: meta.key,
      coordinates: meta.coordinates ?? meta.coordenadas,
      timestamp: meta.timestamp,
      provider: meta.provider,
    });
  },
  clearQuantumPulse() {
    setState({ activeQueryLine: null, quantumPulseLine: null });
  },
  setNetworkNodes(nodes: TBitCognitiveState["networkNodes"]) {
    setState({ networkNodes: nodes });
  },
  setSyncingNetwork(syncing: boolean) {
    setState({ isSyncingNetwork: syncing });
  },
  triggerSyncPulse(fromNodeId: string, toNodeId: string, type: "EXPORT" | "IMPORT" | "COMPARE") {
    const nodes = state.networkNodes;
    const from =
      fromNodeId === "local"
        ? [0, 0, 0]
        : nodes.find((node) => node.nodeId === fromNodeId)?.position ?? [0, 0, 0];
    const to =
      toNodeId === "local"
        ? [0, 0, 0]
        : nodes.find((node) => node.nodeId === toNodeId)?.position ?? [0, 0, 0];
    setState({ activeDataBridgeLine: { from: from as TBitVector3, to: to as TBitVector3, type } });
  },
  clearSyncPulse() {
    setState({ activeDataBridgeLine: null });
  },
  setMemoryGraph(graph: TBitMemoryGraph | null) {
    setState({ memoryGraph: graph });
  },
  setSelectedMemoryNodeKey(key: string | null) {
    setState({ selectedMemoryNodeKey: key });
  },
  setShowMemoryLinks(show: boolean) {
    setState({ showMemoryLinks: show });
  },
  setShowMemoryAntiVits(show: boolean) {
    setState({ showMemoryAntiVits: show });
  },
};

export function useTBitCognitiveStore() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return {
    ...snapshot,
    setIsLlmThinking: tbitCognitiveStore.setIsLlmThinking,
    setLlmThinking: tbitCognitiveStore.setLlmThinking,
    setLastActionMeta: tbitCognitiveStore.setLastActionMeta,
    triggerQuantumVisualEvent: tbitCognitiveStore.triggerQuantumVisualEvent,
    clearActionMeta: tbitCognitiveStore.clearActionMeta,
    clearQuantumPulse: tbitCognitiveStore.clearQuantumPulse,
    setGravityCompressing: tbitCognitiveStore.setGravityCompressing,
    setNetworkNodes: tbitCognitiveStore.setNetworkNodes,
    setSyncingNetwork: tbitCognitiveStore.setSyncingNetwork,
    triggerSyncPulse: tbitCognitiveStore.triggerSyncPulse,
    clearSyncPulse: tbitCognitiveStore.clearSyncPulse,
    setMemoryGraph: tbitCognitiveStore.setMemoryGraph,
    setSelectedMemoryNodeKey: tbitCognitiveStore.setSelectedMemoryNodeKey,
    setShowMemoryLinks: tbitCognitiveStore.setShowMemoryLinks,
    setShowMemoryAntiVits: tbitCognitiveStore.setShowMemoryAntiVits,
  };
}

export function dispatchTBitCognitiveAction(meta: Omit<TBitActionMeta, "timestamp"> & { timestamp?: number }) {
  tbitCognitiveStore.setLastActionMeta(meta);
  window.dispatchEvent(new CustomEvent("tbit:cognitive-action", { detail: tbitCognitiveStore.getState().lastActionMeta }));
}

if (typeof window !== "undefined") {
  window.addEventListener("tbit:cognitive-action", (event) => {
    const detail = (event as CustomEvent<TBitActionMeta>).detail;
    if (!detail) return;
    tbitCognitiveStore.setLastActionMeta(detail);
  });

  const telemetryWindow = window as Window & { __tbitTelemetryFetchPatched?: boolean };
  if (!telemetryWindow.__tbitTelemetryFetchPatched) {
    telemetryWindow.__tbitTelemetryFetchPatched = true;
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      try {
        const input = args[0];
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        const isTBitAction =
          url.includes("/api/inyectar") ||
          url.includes("/api/recuperar") ||
          url.includes("/api/ai/inject") ||
          url.includes("/api/ai/oracle") ||
          url.includes("/api/ai/symbolic");

        if (isTBitAction && response.ok) {
          const projectedPayloadPromise = response
            .clone()
            .json()
            .then((payload: Record<string, unknown>) => enrichPayloadWithFractalProjection(payload));

          Object.defineProperty(response, "json", {
            configurable: true,
            value: () => projectedPayloadPromise,
          });

          projectedPayloadPromise
            .then((projectedPayload: Record<string, unknown>) => {
              const coordinates = projectedPayload.coordinates ?? projectedPayload.coordenadas;
              const antiCoordinates = projectedPayload.antiCoordinates ?? projectedPayload.antiCoordenadas;
              const key = projectedPayload.key ?? projectedPayload.clave ?? projectedPayload.dataKey;
              if (
                Array.isArray(coordinates) &&
                coordinates.length === 3 &&
                coordinates.every((item) => typeof item === "number")
              ) {
                tbitCognitiveStore.setLastActionMeta({
                  type: url.includes("recuperar") || url.includes("oracle") ? "ORACLE" : url.includes("symbolic") ? "SYMBOLIC" : "INJECT",
                  key: typeof key === "string" ? key : "TBIT::UI::ACTION",
                  coordinates: coordinates as TBitVector3,
                  antiCoordinates:
                    Array.isArray(antiCoordinates) &&
                    antiCoordinates.length === 3 &&
                    antiCoordinates.every((item) => typeof item === "number")
                      ? (antiCoordinates as TBitVector3)
                      : undefined,
                  timestamp: Date.now(),
                });
              }
            })
            .catch(() => undefined);
        }
      } catch {
        // Telemetry must never interfere with application requests.
      }
      return response;
    };
  }
}
