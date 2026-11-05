import { useEffect, useMemo, useState } from "react";
import { networkSyncClient, NetworkState } from "../networkSyncClient";
import { useTBitStore, TBitVector3 } from "../store/useTBitStore";

type PanelLog = {
  level: "INFO" | "OK" | "WARN" | "ERROR";
  text: string;
};

function peerPosition(index: number, total: number): TBitVector3 {
  const radius = 12;
  const angle = (Math.PI * 2 * index) / Math.max(1, total);
  return [Math.cos(angle) * radius, 2.5 + Math.sin(index) * 1.8, Math.sin(angle) * radius];
}

function shortChecksum(value?: string): string {
  if (!value) return "0x0000000000000000";
  return `${value.slice(0, 14)}...${value.slice(-8)}`;
}

export function TBitNetworkPanel() {
  const [localState, setLocalState] = useState<NetworkState | null>(null);
  const [logs, setLogs] = useState<PanelLog[]>([]);
  const [syncKey, setSyncKey] = useState("Usuario::Preferencias::TemaVisual");
  const {
    networkNodes,
    isSyncingNetwork,
    setNetworkNodes,
    setSyncingNetwork,
    triggerSyncPulse,
    clearSyncPulse,
  } = useTBitStore();

  const configuredPeers = useMemo(() => networkSyncClient.getConfiguredPeers(), []);

  const pushLog = (level: PanelLog["level"], text: string) => {
    setLogs((prev) => [...prev.slice(-5), { level, text }]);
  };

  const refreshState = async () => {
    try {
      setSyncingNetwork(true);
      const state = await networkSyncClient.getNetworkState();
      setLocalState(state);

      const nodes = configuredPeers.map((url, index) => ({
        nodeId: `peer_${index + 1}`,
        url,
        position: peerPosition(index, configuredPeers.length),
        status: "OFFLINE" as const,
        ledgerChecksum: "",
      }));
      setNetworkNodes(nodes);
      pushLog("OK", `Nodo local activo: ${state.nodeId}`);
    } catch (error) {
      pushLog("ERROR", error instanceof Error ? error.message : "No se pudo leer el estado local.");
    } finally {
      setSyncingNetwork(false);
    }
  };

  const comparePeer = async (peerUrl: string, peerId: string) => {
    try {
      setSyncingNetwork(true);
      setNetworkNodes(
        networkNodes.map((node) => (node.nodeId === peerId ? { ...node, status: "SYNCING" } : node)),
      );
      triggerSyncPulse(peerId, "local", "COMPARE");

      const peerState = await networkSyncClient.getPeerState(peerUrl);
      const comparison = (await networkSyncClient.compareState(peerState)) as { status?: string };

      setNetworkNodes(
        networkNodes.map((node) =>
          node.nodeId === peerId
            ? {
                ...node,
                status: "ONLINE",
                ledgerChecksum: peerState.ledgerChecksum,
              }
            : node,
        ),
      );
      pushLog(comparison.status === "IN_SYNC" ? "OK" : "WARN", `${peerId}: ${comparison.status ?? "DIVERGED"}`);
    } catch (error) {
      setNetworkNodes(
        networkNodes.map((node) => (node.nodeId === peerId ? { ...node, status: "OFFLINE" } : node)),
      );
      pushLog("ERROR", `${peerId}: ${error instanceof Error ? error.message : "sin respuesta"}`);
    } finally {
      window.setTimeout(clearSyncPulse, 2200);
      setSyncingNetwork(false);
    }
  };

  const pushKeyToPeer = async (peerUrl: string, peerId: string) => {
    if (!syncKey.trim()) {
      pushLog("WARN", "Escribe una clave para exportar.");
      return;
    }
    try {
      setSyncingNetwork(true);
      triggerSyncPulse("local", peerId, "EXPORT");
      const record = await networkSyncClient.exportRecord(syncKey.trim());
      const result = await networkSyncClient.importToPeer(peerUrl, record);
      pushLog("OK", `EXPORT ${peerId}: ${syncKey.trim()} -> ${(result as { status?: string }).status ?? "OK"}`);
      window.setTimeout(() => void comparePeer(peerUrl, peerId), 600);
    } catch (error) {
      pushLog("ERROR", `EXPORT ${peerId}: ${error instanceof Error ? error.message : "fallo desconocido"}`);
    } finally {
      window.setTimeout(clearSyncPulse, 2200);
      setSyncingNetwork(false);
    }
  };

  const pullKeyFromPeer = async (peerUrl: string, peerId: string) => {
    if (!syncKey.trim()) {
      pushLog("WARN", "Escribe una clave para importar.");
      return;
    }
    try {
      setSyncingNetwork(true);
      triggerSyncPulse(peerId, "local", "IMPORT");
      const record = await networkSyncClient.exportFromPeer(peerUrl, syncKey.trim());
      const result = await networkSyncClient.importRecord(record);
      pushLog("OK", `IMPORT ${peerId}: ${syncKey.trim()} -> ${(result as { status?: string }).status ?? "OK"}`);
      window.setTimeout(() => void comparePeer(peerUrl, peerId), 600);
    } catch (error) {
      pushLog("ERROR", `IMPORT ${peerId}: ${error instanceof Error ? error.message : "fallo desconocido"}`);
    } finally {
      window.setTimeout(clearSyncPulse, 2200);
      setSyncingNetwork(false);
    }
  };

  useEffect(() => {
    refreshState();
  }, []);

  return (
    <section className="border border-purple-900/50 bg-gray-950/70 p-4 font-mono text-xs text-white backdrop-blur">
      <div className="mb-3 flex items-center justify-between border-b border-purple-950 pb-2">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${isSyncingNetwork ? "bg-amber-400 animate-pulse" : "bg-purple-500"}`} />
          <span className="text-[10px] font-bold tracking-widest text-purple-300">T-BIT ANTI-ENTROPY MESH</span>
        </div>
        <button
          onClick={refreshState}
          className="border border-purple-800/60 px-2 py-1 text-[10px] font-bold text-purple-300 hover:border-cyan-500 hover:text-cyan-300"
        >
          REFRESH
        </button>
      </div>

      <div className="mb-3 border border-gray-900 bg-black/30 p-3">
        <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-gray-500">Nodo Local</div>
        <div className="flex justify-between gap-3">
          <span className="text-gray-400">ID</span>
          <span className="text-right font-bold text-cyan-300">{localState?.nodeId ?? "Cargando"}</span>
        </div>
        <div className="mt-2">
          <span className="text-gray-400">Ledger</span>
          <div className="mt-1 overflow-x-auto border border-gray-900 bg-black p-2 text-emerald-300">
            {shortChecksum(localState?.ledgerChecksum)}
          </div>
        </div>
      </div>

      <div className="mb-3 space-y-2">
        <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Nodos Remotos</div>
        <div className="border border-gray-900 bg-black/30 p-2">
          <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500">
            Clave a sincronizar
          </label>
          <input
            value={syncKey}
            onChange={(event) => setSyncKey(event.target.value)}
            className="w-full border border-gray-800 bg-gray-950 px-2 py-2 text-cyan-200 outline-none focus:border-cyan-500"
            placeholder="Dominio::Coleccion::ID"
          />
        </div>
        {networkNodes.length === 0 && (
          <div className="border border-gray-900 bg-black/30 p-2 text-gray-500">
            No hay peers configurados. Usa localStorage tbit_remote_peers o VITE_TBIT_REMOTE_PEERS.
          </div>
        )}
        {networkNodes.map((peer) => (
          <div key={peer.nodeId} className="border border-gray-900 bg-black/30 p-2">
            <div className="flex items-center justify-between">
            <div className="min-w-0">
              <div className="font-bold text-gray-200">{peer.nodeId}</div>
              <div className="truncate text-[10px] text-gray-600">{peer.url}</div>
              <div className="text-[10px] text-purple-300">{peer.status}</div>
            </div>
            <button
              onClick={() => comparePeer(peer.url, peer.nodeId)}
              className="border border-purple-800/70 px-3 py-1 text-[10px] font-bold text-purple-300 hover:bg-purple-500 hover:text-black"
            >
              COMPARE
            </button>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                onClick={() => pushKeyToPeer(peer.url, peer.nodeId)}
                className="border border-cyan-800/70 px-2 py-1 text-[10px] font-bold text-cyan-300 hover:bg-cyan-500 hover:text-black"
              >
                EXPORTAR
              </button>
              <button
                onClick={() => pullKeyFromPeer(peer.url, peer.nodeId)}
                className="border border-emerald-800/70 px-2 py-1 text-[10px] font-bold text-emerald-300 hover:bg-emerald-500 hover:text-black"
              >
                IMPORTAR
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-gray-900 pt-3">
        <button
          onClick={() => {
            pushLog("INFO", "Barrido anti-entropia manual iniciado.");
            networkNodes.forEach((peer) => void comparePeer(peer.url, peer.nodeId));
          }}
          className="w-full border border-cyan-700/50 bg-cyan-950/40 py-2 font-bold text-cyan-300 hover:bg-cyan-500 hover:text-black"
        >
          RECONCILIAR MALLA VECTORIAL
        </button>
      </div>

      <div className="mt-3 max-h-28 overflow-y-auto border border-gray-900 bg-black/30 p-2">
        {logs.length === 0 ? (
          <div className="text-gray-600">Esperando telemetria de red.</div>
        ) : (
          logs.map((log, index) => (
            <div key={`${log.level}-${index}`} className="text-gray-400">
              <span className={log.level === "ERROR" ? "text-red-400" : log.level === "WARN" ? "text-amber-300" : "text-emerald-300"}>
                [{log.level}]
              </span>{" "}
              {log.text}
            </div>
          ))
        )}
      </div>
    </section>
  );
}

export default TBitNetworkPanel;
