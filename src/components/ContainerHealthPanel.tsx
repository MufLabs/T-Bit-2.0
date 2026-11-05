import { useEffect, useState } from "react";
import { Activity, RefreshCw, Wrench } from "lucide-react";
import { containerHealthClient, ContainerHealthReport } from "../containerHealthClient";

type HealthLog = {
  level: "OK" | "WARN" | "ERROR";
  text: string;
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function statusClass(status?: string): string {
  if (status === "CRITICAL") return "text-red-300";
  if (status === "WARN") return "text-amber-300";
  return "text-emerald-300";
}

export function ContainerHealthPanel() {
  const [report, setReport] = useState<ContainerHealthReport | null>(null);
  const [logs, setLogs] = useState<HealthLog[]>([]);
  const [busy, setBusy] = useState(false);

  const pushLog = (level: HealthLog["level"], text: string) => {
    setLogs((current) => [...current.slice(-3), { level, text }]);
  };

  const refresh = async () => {
    try {
      setBusy(true);
      const next = await containerHealthClient.read();
      setReport(next);
      pushLog(next.status === "HEALTHY" ? "OK" : "WARN", `Estado: ${next.status}`);
    } catch (error) {
      pushLog("ERROR", error instanceof Error ? error.message : "Fallo leyendo salud.");
    } finally {
      setBusy(false);
    }
  };

  const reconcile = async () => {
    try {
      setBusy(true);
      const result = await containerHealthClient.reconcile(false);
      pushLog(
        "OK",
        `Reconciliado: ${result.actions.length} acciones | stale ${result.drift.staleMemoryRecords.length} | query ${result.drift.staleQueryRecords.length}/${result.drift.missingQueryRecords.length}`,
      );
      if (result.drift.physicalRecordsWithoutMemoryIndex.length > 0) {
        pushLog("WARN", `${result.drift.physicalRecordsWithoutMemoryIndex.length} registros fisicos siguen sin indice logico.`);
      }
      await refresh();
    } catch (error) {
      pushLog("ERROR", error instanceof Error ? error.message : "Fallo reconciliando indices.");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  return (
    <section className="border border-lime-900/50 bg-gray-950/70 p-4 font-mono text-xs text-white backdrop-blur">
      <div className="mb-3 flex items-center justify-between border-b border-lime-950 pb-2">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-bold tracking-widest text-lime-300">
            <Activity size={14} />
            T-BIT CONTAINER HEALTH
          </div>
          <div className="mt-1 text-gray-500">Estado fisico, WAL, chunks, colisiones evitadas e indice logico.</div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={reconcile}
            disabled={busy}
            className="border border-amber-800/60 bg-amber-950/30 p-2 text-amber-300 hover:bg-amber-500 hover:text-black disabled:opacity-50"
            title="Reconciliar indice fisico/logico"
          >
            <Wrench size={14} />
          </button>
          <button
            onClick={refresh}
            disabled={busy}
            className="border border-lime-800/60 bg-lime-950/30 p-2 text-lime-300 hover:bg-lime-500 hover:text-black disabled:opacity-50"
            title="Refrescar salud"
          >
            <RefreshCw size={14} className={busy ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      <div className="mb-3 grid grid-cols-3 gap-2">
        <div className="border border-gray-900 bg-black/30 p-2">
          <div className="text-gray-500">Estado</div>
          <div className={`mt-1 font-bold ${statusClass(report?.status)}`}>{report?.status ?? "..."}</div>
        </div>
        <div className="border border-gray-900 bg-black/30 p-2">
          <div className="text-gray-500">Registros</div>
          <div className="mt-1 text-cyan-200">{report?.summary.totalMetadataRecords ?? 0}</div>
        </div>
        <div className="border border-gray-900 bg-black/30 p-2">
          <div className="text-gray-500">Chunks</div>
          <div className="mt-1 text-amber-300">{report?.summary.totalChunks ?? 0}</div>
        </div>
      </div>

      <div className="space-y-2">
        {(report?.containers ?? []).map((container) => (
          <div key={container.name} className="border border-gray-900 bg-black/30 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-bold text-lime-200">{container.name}</span>
              <span className={container.exists ? "text-emerald-300" : "text-red-300"}>
                {container.exists ? "ONLINE" : "NO EXISTE"}
              </span>
            </div>
            <div className="h-2 overflow-hidden bg-gray-900">
              <div
                className="h-full bg-lime-400"
                style={{ width: `${Math.min(container.usedPercentEstimate, 100)}%` }}
              />
            </div>
            <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-gray-400">
              <span>Usado</span>
              <span className="text-right text-lime-200">{formatBytes(container.usedBytesEstimate)} / {formatBytes(container.sizeBytes)}</span>
              <span>Metadata</span>
              <span className="text-right text-cyan-200">{container.metadataRecords}</span>
              <span>Chunks</span>
              <span className="text-right text-amber-300">{container.chunks}</span>
              <span>Colisiones evitadas</span>
              <span className="text-right text-purple-300">{container.collisionAvoidedRecords}</span>
              <span>WAL pending/errors</span>
              <span className={container.wal.pending || container.wal.errors ? "text-right text-red-300" : "text-right text-emerald-300"}>
                {container.wal.pending}/{container.wal.errors}
              </span>
              {container.logicalIndex && (
                <>
                  <span>Indice fisico/logico</span>
                  <span className={container.logicalIndex.physicalLogicalDrift ? "text-right text-amber-300" : "text-right text-emerald-300"}>
                    {container.metadataRecords}/{container.logicalIndex.memoryRecords}
                  </span>
                  <span>Assets activos</span>
                  <span className="text-right text-sky-300">{container.logicalIndex.activeAssets}</span>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 max-h-20 overflow-y-auto border border-gray-900 bg-black/30 p-2">
        {logs.length === 0 ? (
          <div className="text-gray-600">Health monitor listo.</div>
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

export default ContainerHealthPanel;
