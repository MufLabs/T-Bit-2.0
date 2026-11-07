import { useEffect, useState } from "react";
import { Bot, Cpu, Loader2, Play, RefreshCw, ShieldCheck, Users } from "lucide-react";
import { EmptyState, ErrorState, SkeletonLines } from "./ui/StateViews";
import {
  agentRuntimeClient,
  type AgentCatalogEntry,
  type AgentEventView,
  type AgentSwarmView,
  type ProviderHealthView,
  type VaultVerificationView,
} from "../agentRuntimeClient";

/**
 * AgentRuntimePanel — Fase 68 (UX del runtime multi-agente en Q-Vault OS).
 *
 * Panel del modo desarrollador que expone, en lenguaje claro:
 *  - el catalogo de los 18 agentes con su politica de seguridad derivada;
 *  - la salud de la cadena de proveedores IA (failover continuo visible);
 *  - el journal auditable de eventos del enjambre;
 *  - un ejecutor de enjambre con indicador de razonamiento por fases
 *    (ejecucion paralela -> validacion cruzada -> consenso).
 */

type Phase = "idle" | "running" | "done" | "error";

const PHASE_LABELS: Record<Exclude<Phase, "idle">, string> = {
  running: "Razonando: agentes en paralelo -> validacion cruzada -> consenso...",
  done: "Razonamiento completado y verificado contra Q-Vault.",
  error: "El razonamiento no pudo completarse.",
};

function verdictClass(verdict: string): string {
  if (verdict === "rechazado") return "text-red-300";
  if (verdict === "observaciones") return "text-amber-300";
  return "text-emerald-300";
}

export function AgentRuntimePanel() {
  const [agents, setAgents] = useState<AgentCatalogEntry[]>([]);
  const [providers, setProviders] = useState<ProviderHealthView[]>([]);
  const [events, setEvents] = useState<AgentEventView[]>([]);
  const [task, setTask] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [swarm, setSwarm] = useState<AgentSwarmView | null>(null);
  const [verification, setVerification] = useState<VaultVerificationView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    try {
      setBusy(true);
      const [catalog, health, journal] = await Promise.all([
        agentRuntimeClient.listAgents(),
        agentRuntimeClient.providerHealth(),
        agentRuntimeClient.listEvents(40),
      ]);
      setAgents(catalog.agents);
      setProviders(health.providers);
      setEvents(journal);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Fallo cargando el runtime de agentes.");
    } finally {
      setBusy(false);
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const runSwarm = async () => {
    if (!task.trim()) return;
    setPhase("running");
    setError(null);
    setSwarm(null);
    setVerification(null);
    try {
      const result = await agentRuntimeClient.runSwarm(task.trim());
      setSwarm(result.swarm);
      setVerification(result.verification);
      setPhase("done");
      const journal = await agentRuntimeClient.listEvents(40);
      setEvents(journal);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Fallo ejecutando el enjambre.");
      setPhase("error");
    }
  };

  return (
    <section className="tbit-panel p-4 font-mono text-xs text-white" aria-label="Runtime de agentes T-BIT">
      <div className="mb-3 flex items-center justify-between border-b border-cyan-950 pb-2">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-bold tracking-widest text-cyan-300">
            <Bot size={14} aria-hidden />
            T-BIT AGENT RUNTIME
          </div>
          <div className="mt-1 text-gray-500">Enjambre multi-agente, failover de IA y memoria evolutiva en Q-Vault.</div>
        </div>
        <button
          onClick={refresh}
          disabled={busy}
          className="tbit-btn tbit-btn-ghost !p-2"
          title="Refrescar runtime"
          aria-label="Refrescar runtime de agentes"
        >
          <RefreshCw size={14} className={busy ? "animate-spin" : ""} aria-hidden />
        </button>
      </div>

      {loading && agents.length === 0 ? (
        <div className="space-y-3">
          <SkeletonLines lines={3} />
          <p className="sr-only">Cargando catalogo de agentes y salud de proveedores.</p>
        </div>
      ) : (
        <>
          {error && (
            <div className="mb-3">
              <ErrorState message={error} onRetry={refresh} />
            </div>
          )}

      <div className="mb-3 grid grid-cols-3 gap-2">
        <div className="border border-gray-900 bg-black/30 p-2">
          <div className="flex items-center gap-1 text-gray-500"><Users size={11} aria-hidden /> Agentes</div>
          <div className="mt-1 font-bold text-cyan-200">{agents.length}</div>
        </div>
        <div className="border border-gray-900 bg-black/30 p-2">
          <div className="flex items-center gap-1 text-gray-500"><Cpu size={11} aria-hidden /> Cadena IA</div>
          <div className="mt-1 font-bold text-purple-300">{providers.length} eslabones</div>
        </div>
        <div className="border border-gray-900 bg-black/30 p-2">
          <div className="flex items-center gap-1 text-gray-500"><ShieldCheck size={11} aria-hidden /> Enfriamiento</div>
          <div className={`mt-1 font-bold ${providers.some((provider) => provider.inCooldown) ? "text-amber-300" : "text-emerald-300"}`}>
            {providers.filter((provider) => provider.inCooldown).length} en cooldown
          </div>
        </div>
      </div>

      <div className="mb-3 space-y-1">
        {providers.length === 0 ? (
          <EmptyState title="Sin eslabones IA reportados" hint="La cadena de failover se muestra al conectar con el servidor." />
        ) : (
          providers.map((provider) => (
            <div key={provider.id} className="flex items-center justify-between border border-gray-900 bg-black/30 px-2 py-1">
              <span className="text-gray-300">{provider.label}</span>
              <span className="flex items-center gap-2">
                {provider.lastLatencyMs !== null && <span className="text-gray-500">{provider.lastLatencyMs} ms</span>}
                <span className={provider.inCooldown ? "text-amber-300" : provider.available ? "text-emerald-300" : "text-red-300"}>
                  {provider.inCooldown ? "ENFRIAMIENTO" : provider.available ? "DISPONIBLE" : "CAIDO"}
                </span>
              </span>
            </div>
          ))
        )}
      </div>


      <div className="mb-3">
        <div className="mb-1 text-[10px] font-bold tracking-widest text-cyan-300">ENJAMBRE MULTI-AGENTE</div>
        <div className="flex gap-2">
          <input
            value={task}
            onChange={(event) => setTask(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && phase !== "running") void runSwarm();
            }}
            placeholder="Tarea para el enjambre (ej: revisa la seguridad del modulo de pagos)"
            aria-label="Tarea para el enjambre multi-agente"
            className="tbit-input flex-1 font-mono"
          />
          <button
            onClick={runSwarm}
            disabled={phase === "running" || !task.trim()}
            className="tbit-btn"
          >
            {phase === "running" ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <Play size={13} aria-hidden />}
            Ejecutar
          </button>
        </div>
        {phase !== "idle" && (
          <div className={`mt-2 border px-2 py-1 ${phase === "running" ? "border-cyan-900 bg-cyan-950/20 text-cyan-200" : phase === "done" ? "border-emerald-900 bg-emerald-950/20 text-emerald-200" : "border-red-900 bg-red-950/20 text-red-200"}`}>
            {phase === "running" && <Loader2 size={11} className="mr-1 inline animate-spin" />}
            {PHASE_LABELS[phase]}
            {error ? ` ${error}` : ""}
          </div>
        )}
      </div>

      {swarm && (
        <div className="mb-3 border border-gray-900 bg-black/30 p-2">
          <div className="mb-1 flex items-center justify-between">
            <span className="font-bold text-cyan-200">Consenso del enjambre {swarm.taskId}</span>
            <span className="text-gray-500">{swarm.results.length} agentes</span>
          </div>
          {swarm.consolidated && (
            <p className="mt-1 max-h-32 overflow-y-auto whitespace-pre-wrap text-gray-300">{swarm.consolidated}</p>
          )}
          {verification && verification.unverifiedTerms.length > 0 && (
            <p className="mt-2 text-amber-300">
              Sin respaldo en Q-Vault: {verification.unverifiedTerms.join(", ")} (marcados como no verificados).
            </p>
          )}
          {swarm.verdicts.length > 0 && (
            <div className="mt-2 space-y-0.5">
              {swarm.verdicts.map((verdict, index) => (
                <div key={`${verdict.validator}-${index}`} className="text-gray-400">
                  {verdict.validator} sobre {verdict.targetAgent}:{" "}
                  <span className={verdictClass(verdict.verdict)}>{verdict.verdict}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}


      <div className="mb-3 max-h-36 overflow-y-auto border border-gray-900 bg-black/30 p-2">
        <div className="mb-1 text-[10px] font-bold tracking-widest text-gray-500">JOURNAL DE EVENTOS (auditable)</div>
        {events.length === 0 ? (
          <div className="text-gray-600">Sin eventos todavia. Ejecuta un agente o un enjambre.</div>
        ) : (
          events.map((event) => (
            <div key={event.id} className="text-gray-400">
              <span className="text-gray-600">{event.ts.slice(11, 19)}</span>{" "}
              <span className="text-cyan-300">{event.type}</span> <span className="text-gray-500">from={event.from}</span>
            </div>
          ))
        )}
      </div>

      <div className="max-h-48 overflow-y-auto">
        <div className="mb-1 text-[10px] font-bold tracking-widest text-gray-500">CATALOGO DE AGENTES</div>
        {agents.length === 0 ? (
          <EmptyState title="Catalogo de agentes vacio" hint="Verifica que el servidor T-BIT API este activo y reintenta." />
        ) : (
          <div className="grid grid-cols-2 gap-1">
            {agents.map((agent) => (
              <div key={agent.file} className="border border-gray-900 bg-black/30 px-2 py-1" title={agent.description}>
                <div className="truncate text-gray-200">{agent.name}</div>
                <div className="text-[10px] text-gray-600">
                  {agent.policy.canDelete ? "escritura+borrado" : agent.policy.canWrite ? "escritura" : "lectura"} · {agent.tools.length} tools
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
        </>
      )}
    </section>
  );
}

export default AgentRuntimePanel;

