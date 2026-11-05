import { useEffect, useState } from "react";
import { KeyRound, RefreshCw } from "lucide-react";
import { encryptionKeyClient, EncryptionStatus } from "../encryptionKeyClient";

type KeyLog = {
  level: "OK" | "WARN" | "ERROR";
  text: string;
};

export function EncryptionKeyPanel() {
  const [status, setStatus] = useState<EncryptionStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [logs, setLogs] = useState<KeyLog[]>([]);

  const pushLog = (level: KeyLog["level"], text: string) => {
    setLogs((current) => [...current.slice(-3), { level, text }]);
  };

  const refresh = async () => {
    try {
      setBusy(true);
      const next = await encryptionKeyClient.status();
      setStatus(next);
      pushLog("OK", `Llave activa: ${next.activeKeyId}`);
    } catch (error) {
      pushLog("ERROR", error instanceof Error ? error.message : "Fallo leyendo llaves.");
    } finally {
      setBusy(false);
    }
  };

  const migrate = async () => {
    try {
      setBusy(true);
      const report = await encryptionKeyClient.migrate(25, false);
      pushLog(report.errors.length ? "WARN" : "OK", `Migrados: ${report.migrated.length} | errores: ${report.errors.length}`);
      if (report.pendingAfterLimit > 0) pushLog("WARN", `Pendientes despues del lote: ${report.pendingAfterLimit}`);
      await refresh();
    } catch (error) {
      pushLog("ERROR", error instanceof Error ? error.message : "Fallo migrando llaves.");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  return (
    <section className="border border-sky-900/50 bg-gray-950/70 p-4 font-mono text-xs text-white backdrop-blur">
      <div className="mb-3 flex items-center justify-between border-b border-sky-950 pb-2">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-bold tracking-widest text-sky-300">
            <KeyRound size={14} />
            T-BIT AES-GCM KEYS
          </div>
          <div className="mt-1 text-gray-500">Rotacion, key id y migracion de memoria IA.</div>
        </div>
        <button
          onClick={refresh}
          disabled={busy}
          className="border border-sky-800/60 bg-sky-950/30 p-2 text-sky-300 hover:bg-sky-500 hover:text-black disabled:opacity-50"
          title="Refrescar llaves"
        >
          <RefreshCw size={14} className={busy ? "animate-spin" : ""} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="border border-gray-900 bg-black/30 p-2">
          <div className="text-gray-500">Activa</div>
          <div className="mt-1 text-sky-200">{status?.activeKeyId ?? "..."}</div>
        </div>
        <div className="border border-gray-900 bg-black/30 p-2">
          <div className="text-gray-500">Keyring</div>
          <div className="mt-1 text-emerald-300">{status?.keyCount ?? 0}</div>
        </div>
      </div>

      <div className="mt-3 border border-gray-900 bg-black/30 p-2 text-gray-400">
        Previas: {status?.previousKeyIds.length ? status.previousKeyIds.join(", ") : "ninguna"}
      </div>

      <button
        type="button"
        onClick={migrate}
        disabled={busy}
        className="mt-3 w-full border border-sky-700/60 bg-sky-950/30 py-2 font-bold uppercase tracking-[0.12em] text-sky-300 hover:bg-sky-500 hover:text-black disabled:opacity-50"
      >
        Migrar lote IA a llave activa
      </button>

      <div className="mt-3 max-h-20 overflow-y-auto border border-gray-900 bg-black/30 p-2">
        {logs.length === 0 ? (
          <div className="text-gray-600">Key manager listo.</div>
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

export default EncryptionKeyPanel;
