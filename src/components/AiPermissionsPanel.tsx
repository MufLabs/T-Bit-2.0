import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { aiPermissionsClient, AiPermissionsPolicy } from "../aiPermissionsClient";

type PermissionLog = {
  level: "OK" | "ERROR" | "INFO";
  text: string;
};

const DEFAULT_POLICY: AiPermissionsPolicy = {
  version: "tbit-ai-permissions-v1",
  updatedAt: "",
  canRead: true,
  canWrite: true,
  canDelete: false,
  canSearch: true,
  canCompute: true,
  requireDeleteConfirmation: true,
  maxWriteBytes: 65536,
  allowedKeyPrefixes: [],
  blockedKeyPrefixes: ["Sistema::Secretos", "Security::Secrets", "TBIT::Secrets"],
};

function splitPrefixes(value: string): string[] {
  return value
    .split(/\r?\n|,/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function joinPrefixes(value: string[]): string {
  return value.join("\n");
}

export function AiPermissionsPanel() {
  const [policy, setPolicy] = useState<AiPermissionsPolicy>(DEFAULT_POLICY);
  const [allowedPrefixes, setAllowedPrefixes] = useState("");
  const [blockedPrefixes, setBlockedPrefixes] = useState(joinPrefixes(DEFAULT_POLICY.blockedKeyPrefixes));
  const [logs, setLogs] = useState<PermissionLog[]>([]);
  const [busy, setBusy] = useState(false);

  const pushLog = (level: PermissionLog["level"], text: string) => {
    setLogs((current) => [...current.slice(-3), { level, text }]);
  };

  const loadPolicy = async () => {
    try {
      setBusy(true);
      const response = await aiPermissionsClient.read();
      setPolicy(response.policy);
      setAllowedPrefixes(joinPrefixes(response.policy.allowedKeyPrefixes));
      setBlockedPrefixes(joinPrefixes(response.policy.blockedKeyPrefixes));
      pushLog("OK", "Politica IA cargada.");
    } catch (error) {
      pushLog("ERROR", error instanceof Error ? error.message : "Fallo leyendo permisos.");
    } finally {
      setBusy(false);
    }
  };

  const savePolicy = async () => {
    try {
      setBusy(true);
      const response = await aiPermissionsClient.update({
        ...policy,
        allowedKeyPrefixes: splitPrefixes(allowedPrefixes),
        blockedKeyPrefixes: splitPrefixes(blockedPrefixes),
      });
      setPolicy(response.policy);
      setAllowedPrefixes(joinPrefixes(response.policy.allowedKeyPrefixes));
      setBlockedPrefixes(joinPrefixes(response.policy.blockedKeyPrefixes));
      pushLog("OK", "Permisos IA actualizados.");
    } catch (error) {
      pushLog("ERROR", error instanceof Error ? error.message : "Fallo guardando permisos.");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void loadPolicy();
  }, []);

  const toggle = (key: keyof Pick<AiPermissionsPolicy, "canRead" | "canWrite" | "canDelete" | "canSearch" | "canCompute" | "requireDeleteConfirmation">) => (
    <button
      type="button"
      onClick={() => setPolicy((current) => ({ ...current, [key]: !current[key] }))}
      className={policy[key]
        ? "border border-emerald-700 bg-emerald-950/40 px-2 py-1 text-emerald-300"
        : "border border-red-800 bg-red-950/30 px-2 py-1 text-red-300"}
    >
      {policy[key] ? "ON" : "OFF"}
    </button>
  );

  return (
    <section className="border border-amber-900/50 bg-gray-950/70 p-4 font-mono text-xs text-white backdrop-blur">
      <div className="mb-3 border-b border-amber-950 pb-2">
        <div className="flex items-center gap-2 text-[10px] font-bold tracking-widest text-amber-300">
          <ShieldCheck size={14} />
          T-BIT AI PERMISSIONS
        </div>
        <div className="mt-1 text-gray-500">Controla que puede hacer la IA con tu vacio.</div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="flex items-center justify-between border border-gray-900 bg-black/30 p-2">
          <span>Leer</span>
          {toggle("canRead")}
        </div>
        <div className="flex items-center justify-between border border-gray-900 bg-black/30 p-2">
          <span>Buscar</span>
          {toggle("canSearch")}
        </div>
        <div className="flex items-center justify-between border border-gray-900 bg-black/30 p-2">
          <span>Escribir</span>
          {toggle("canWrite")}
        </div>
        <div className="flex items-center justify-between border border-gray-900 bg-black/30 p-2">
          <span>Computar</span>
          {toggle("canCompute")}
        </div>
        <div className="flex items-center justify-between border border-gray-900 bg-black/30 p-2">
          <span>Borrar</span>
          {toggle("canDelete")}
        </div>
        <div className="flex items-center justify-between border border-gray-900 bg-black/30 p-2">
          <span>Confirmar borrado</span>
          {toggle("requireDeleteConfirmation")}
        </div>
      </div>

      <label className="mt-3 block">
        <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500">Max escritura IA bytes</span>
        <input
          type="number"
          min={1024}
          max={1048576}
          value={policy.maxWriteBytes}
          onChange={(event) => setPolicy((current) => ({ ...current, maxWriteBytes: Number(event.target.value) }))}
          className="w-full border border-gray-800 bg-gray-950 px-2 py-2 text-amber-100 outline-none focus:border-amber-500"
        />
      </label>

      <label className="mt-3 block">
        <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500">Prefijos permitidos opcionales</span>
        <textarea
          value={allowedPrefixes}
          onChange={(event) => setAllowedPrefixes(event.target.value)}
          className="h-16 w-full resize-none border border-gray-800 bg-gray-950 px-2 py-2 text-amber-100 outline-none focus:border-amber-500"
          placeholder="Vacio = todos los prefijos no bloqueados"
        />
      </label>

      <label className="mt-2 block">
        <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500">Prefijos bloqueados</span>
        <textarea
          value={blockedPrefixes}
          onChange={(event) => setBlockedPrefixes(event.target.value)}
          className="h-16 w-full resize-none border border-gray-800 bg-gray-950 px-2 py-2 text-red-100 outline-none focus:border-red-500"
        />
      </label>

      <button
        onClick={savePolicy}
        disabled={busy}
        className="mt-3 w-full border border-amber-700/60 bg-amber-950/30 py-2 font-bold text-amber-300 hover:bg-amber-500 hover:text-black disabled:opacity-50"
      >
        GUARDAR POLITICA IA
      </button>

      <div className="mt-3 max-h-20 overflow-y-auto border border-gray-900 bg-black/30 p-2">
        {logs.length === 0 ? (
          <div className="text-gray-600">Permisos IA listos.</div>
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

export default AiPermissionsPanel;
