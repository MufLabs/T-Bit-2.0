import { useState } from "react";
import { assetManagerClient, TBitAssetRecord } from "../assetManagerClient";
import { useTBitStore } from "../store/useTBitStore";

type AssetLog = {
  level: "OK" | "ERROR" | "INFO";
  text: string;
};

export function AssetManagerPanel() {
  const { memoryGraph, setMemoryGraph, setSelectedMemoryNodeKey } = useTBitStore();
  const [userId, setUserId] = useState("Mauricio");
  const [assets, setAssets] = useState<TBitAssetRecord[]>([]);
  const [selectedAssetKey, setSelectedAssetKey] = useState("");
  const [summary, setSummary] = useState("Assets no cargados");
  const [logs, setLogs] = useState<AssetLog[]>([]);
  const [busy, setBusy] = useState(false);

  const pushLog = (level: AssetLog["level"], text: string) => {
    setLogs((current) => [...current.slice(-3), { level, text }]);
  };

  function removeKeysFromGraph(keys: string[]) {
    if (!memoryGraph || keys.length === 0) return;
    const deleted = new Set(keys);
    setMemoryGraph({
      ...memoryGraph,
      nodes: memoryGraph.nodes.filter((node) => !deleted.has(node.key)),
      links: memoryGraph.links.filter((link) => !deleted.has(link.sourceKey) && !deleted.has(link.targetKey)),
      tags: Object.fromEntries(
        Object.entries(memoryGraph.tags)
          .map(([tag, tagKeys]) => [tag, tagKeys.filter((key) => !deleted.has(key))])
          .filter(([, tagKeys]) => tagKeys.length > 0),
      ),
    });
  }

  const loadAssets = async () => {
    try {
      setBusy(true);
      const [listResponse, statsResponse] = await Promise.all([
        assetManagerClient.list(userId),
        assetManagerClient.stats(userId),
      ]) as [
        { assets?: TBitAssetRecord[] },
        { stats?: { totalAssets: number; totalDependencies: number; totalBytes: number } },
      ];
      const nextAssets = listResponse.assets ?? [];
      setAssets(nextAssets);
      setSelectedAssetKey(nextAssets[0]?.assetKey ?? "");
      setSummary(
        `Assets: ${statsResponse.stats?.totalAssets ?? 0} | Dependencias: ${statsResponse.stats?.totalDependencies ?? 0} | Bytes: ${statsResponse.stats?.totalBytes ?? 0}`,
      );
      pushLog("OK", "Asset Manager sincronizado.");
    } catch (error) {
      pushLog("ERROR", error instanceof Error ? error.message : "Fallo cargando assets.");
    } finally {
      setBusy(false);
    }
  };

  const deleteSelectedAsset = async () => {
    const asset = assets.find((item) => item.assetKey === selectedAssetKey);
    if (!asset) {
      pushLog("ERROR", "Selecciona un asset primero.");
      return;
    }

    const label = asset.filename || asset.title;
    const first = window.confirm(`Eliminar este asset y todas sus dependencias?\n\n${label}`);
    if (!first) return;
    const second = window.confirm(`Confirmacion final: borrar definitivamente "${label}" del vacio?`);
    if (!second) return;

    try {
      setBusy(true);
      const response = await assetManagerClient.delete(asset.assetKey) as {
        result?: { deletedKeys?: string[]; collapsedCount?: number; indexRemovedCount?: number };
      };
      const deletedKeys = response.result?.deletedKeys ?? [];
      removeKeysFromGraph(deletedKeys);
      setSelectedMemoryNodeKey(null);
      setAssets((current) => current.filter((item) => item.assetKey !== asset.assetKey));
      setSelectedAssetKey("");
      pushLog("OK", `Asset eliminado: ${deletedKeys.length} claves.`);
      pushLog("INFO", `Colapsadas: ${response.result?.collapsedCount ?? 0} | Indice: ${response.result?.indexRemovedCount ?? 0}`);
    } catch (error) {
      pushLog("ERROR", error instanceof Error ? error.message : "Fallo eliminando asset.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="border border-sky-900/50 bg-gray-950/70 p-4 font-mono text-xs text-white backdrop-blur">
      <div className="mb-3 border-b border-sky-950 pb-2">
        <div className="text-[10px] font-bold tracking-widest text-sky-300">T-BIT ASSET MANAGER</div>
        <div className="mt-1 text-gray-500">Unidades completas: archivo, documento, dataset y dependencias.</div>
      </div>

      <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500">Usuario</label>
      <input
        value={userId}
        onChange={(event) => setUserId(event.target.value)}
        className="mb-2 w-full border border-gray-800 bg-gray-950 px-2 py-2 text-sky-100 outline-none focus:border-sky-500"
      />

      <button
        onClick={loadAssets}
        disabled={busy}
        className="w-full border border-sky-700/60 bg-sky-950/30 py-2 font-bold text-sky-300 hover:bg-sky-500 hover:text-black disabled:opacity-50"
      >
        CARGAR ASSETS
      </button>

      <div className="mt-3 border border-gray-900 bg-black/30 p-2 text-gray-400">{summary}</div>

      <label className="mb-1 mt-3 block text-[10px] font-bold uppercase tracking-wider text-gray-500">Asset</label>
      <select
        value={selectedAssetKey}
        onChange={(event) => setSelectedAssetKey(event.target.value)}
        className="w-full border border-gray-800 bg-gray-950 px-2 py-2 text-sky-100 outline-none focus:border-sky-500"
      >
        <option value="">Selecciona un asset...</option>
        {assets.map((asset) => (
          <option key={asset.assetKey} value={asset.assetKey}>
            {asset.filename || asset.title} ({asset.dependencies.length} deps)
          </option>
        ))}
      </select>

      <button
        onClick={deleteSelectedAsset}
        disabled={busy || !selectedAssetKey}
        className="mt-2 w-full border border-red-800/70 bg-red-950/30 py-2 font-bold text-red-300 hover:bg-red-600 hover:text-white disabled:opacity-50"
      >
        ELIMINAR ASSET COMPLETO
      </button>

      <div className="mt-3 max-h-20 overflow-y-auto border border-gray-900 bg-black/30 p-2">
        {logs.length === 0 ? (
          <div className="text-gray-600">Asset Manager listo.</div>
        ) : (
          logs.map((log, index) => (
            <div key={`${log.level}-${index}`} className="text-gray-400">
              <span className={log.level === "ERROR" ? "text-red-400" : log.level === "OK" ? "text-emerald-300" : "text-cyan-300"}>
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

export default AssetManagerPanel;
