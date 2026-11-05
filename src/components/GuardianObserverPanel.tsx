import { useState } from "react";
import { guardianObserverClient, GuardianObserverReport } from "../guardianObserverClient";
import { useTBitStore } from "../store/useTBitStore";

type GuardianLog = {
  level: "OK" | "ERROR" | "INFO";
  text: string;
};

export function GuardianObserverPanel() {
  const setSelectedMemoryNodeKey = useTBitStore((state) => state.setSelectedMemoryNodeKey);
  const [userId, setUserId] = useState("Mauricio");
  const [minConfidence, setMinConfidence] = useState("0.58");
  const [maxDocuments, setMaxDocuments] = useState("40");
  const [report, setReport] = useState<GuardianObserverReport>();
  const [logs, setLogs] = useState<GuardianLog[]>([]);
  const [busy, setBusy] = useState(false);

  const pushLog = (level: GuardianLog["level"], text: string) => {
    setLogs((current) => [...current.slice(-3), { level, text }]);
  };

  const observe = async () => {
    try {
      setBusy(true);
      const response = await guardianObserverClient.observe({
        userId: userId.trim() || undefined,
        maxDocuments: Number(maxDocuments) || undefined,
        minConfidence: Number(minConfidence) || undefined,
      });
      setReport(response.report);
      pushLog("OK", `Observacion completada: ${response.report.totals.documents} documentos.`);
    } catch (error) {
      pushLog("ERROR", error instanceof Error ? error.message : "Fallo ejecutando Guardian Observer.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="border border-indigo-900/50 bg-gray-950/70 p-4 font-mono text-xs text-white backdrop-blur">
      <div className="mb-3 border-b border-indigo-950 pb-2">
        <div className="text-[10px] font-bold tracking-widest text-indigo-300">T-BIT GUARDIAN OBSERVER</div>
        <div className="mt-1 text-gray-500">Audita el mapa logico. No modifica links, payloads ni sectores fisicos.</div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500">Usuario</span>
          <input
            value={userId}
            onChange={(event) => setUserId(event.target.value)}
            className="w-full border border-gray-800 bg-gray-950 px-2 py-2 text-cyan-100 outline-none focus:border-cyan-500"
            placeholder="Mauricio"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500">Confianza min</span>
          <input
            value={minConfidence}
            onChange={(event) => setMinConfidence(event.target.value)}
            className="w-full border border-gray-800 bg-gray-950 px-2 py-2 text-yellow-100 outline-none focus:border-yellow-500"
            placeholder="0.58"
          />
        </label>
      </div>

      <label className="mt-2 block">
        <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500">Documentos maximos</span>
        <input
          value={maxDocuments}
          onChange={(event) => setMaxDocuments(event.target.value)}
          className="w-full border border-gray-800 bg-gray-950 px-2 py-2 text-purple-100 outline-none focus:border-purple-500"
          placeholder="40"
        />
      </label>

      <button
        onClick={observe}
        disabled={busy}
        className="mt-3 w-full border border-indigo-700/60 bg-indigo-950/30 py-2 font-bold text-indigo-300 hover:bg-indigo-500 hover:text-black disabled:opacity-50"
      >
        {busy ? "OBSERVANDO..." : "EJECUTAR OBSERVADOR"}
      </button>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <div className="border border-gray-900 bg-black/30 p-2">
          <div className="text-gray-500">Docs</div>
          <div className="mt-1 text-lg text-white">{report?.totals.documents ?? 0}</div>
        </div>
        <div className="border border-gray-900 bg-black/30 p-2">
          <div className="text-gray-500">Huerfanos</div>
          <div className="mt-1 text-lg text-yellow-300">{report?.totals.orphanDocuments ?? 0}</div>
        </div>
        <div className="border border-gray-900 bg-black/30 p-2">
          <div className="text-gray-500">Links</div>
          <div className="mt-1 text-lg text-indigo-300">{report?.totals.suggestedLinks ?? 0}</div>
        </div>
      </div>

      {report && (
        <div className="mt-3 space-y-3">
          <div>
            <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-yellow-300">Notas huerfanas</div>
            <div className="max-h-36 space-y-2 overflow-y-auto">
              {report.orphans.length === 0 ? (
                <div className="border border-gray-900 bg-black/30 p-2 text-gray-500">Sin huerfanos detectados.</div>
              ) : (
                report.orphans.slice(0, 6).map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setSelectedMemoryNodeKey(item.key)}
                    className="w-full border border-yellow-900/50 bg-yellow-950/20 p-2 text-left hover:border-yellow-400/60"
                  >
                    <div className="truncate text-yellow-100">{item.title}</div>
                    <div className="mt-1 truncate text-[10px] text-gray-500">{item.reasons.join(", ")}</div>
                  </button>
                ))
              )}
            </div>
          </div>

          <div>
            <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-indigo-300">Conexiones sugeridas</div>
            <div className="max-h-40 space-y-2 overflow-y-auto">
              {report.linkSuggestions.length === 0 ? (
                <div className="border border-gray-900 bg-black/30 p-2 text-gray-500">Sin sugerencias sobre el umbral.</div>
              ) : (
                report.linkSuggestions.slice(0, 6).map((item) => (
                  <button
                    key={`${item.sourceKey}-${item.targetKey}`}
                    type="button"
                    onClick={() => setSelectedMemoryNodeKey(item.sourceKey)}
                    className="w-full border border-indigo-900/50 bg-indigo-950/20 p-2 text-left hover:border-indigo-400/60"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-indigo-100">{item.sourceKey.split("::").slice(-1)[0]}</span>
                      <span className="text-[10px] text-yellow-200">{Math.round(item.confidence * 100)}%</span>
                    </div>
                    <div className="mt-1 truncate text-[10px] text-gray-500">→ {item.targetKey.split("::").slice(-1)[0]}</div>
                  </button>
                ))
              )}
            </div>
          </div>

          <div>
            <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-emerald-300">Clusters por tag</div>
            <div className="max-h-24 overflow-y-auto border border-gray-900 bg-black/30 p-2 text-gray-400">
              {report.topicClusters.length === 0
                ? "Sin clusters detectados."
                : report.topicClusters.slice(0, 8).map((cluster) => (
                  <div key={cluster.tag} className="flex justify-between gap-2">
                    <span className="truncate">#{cluster.tag}</span>
                    <span className="text-emerald-300">{cluster.count}</span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      <div className="mt-3 max-h-20 overflow-y-auto border border-gray-900 bg-black/30 p-2">
        {logs.length === 0 ? (
          <div className="text-gray-600">Observer listo.</div>
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

export default GuardianObserverPanel;
