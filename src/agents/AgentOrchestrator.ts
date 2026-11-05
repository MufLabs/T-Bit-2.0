import type { AiMessage, AiProviderRequest } from "../../AiProvider";
import type { AiProviderRuntime } from "../../AiProviderFactory";
import { AgentEventBus, getAgentEventBus, type AgentEvent } from "./AgentEventBus";
import {
  buildAgentSystemPrompt,
  deriveAgentPolicy,
  getAgentSpec,
  loadAgentSpecs,
  type AgentPolicyOverlay,
  type AgentSpec,
} from "./AgentSpecLoader";

/**
 * AgentOrchestrator — Fase 64 (Runtime Multi-Agente Paralelo).
 *
 * Ejecuta las 18 especificaciones de agentes de forma individual o en enjambre
 * paralelo, con:
 *  - pool de concurrencia propio (sin dependencias nuevas, ver D-002),
 *  - aislamiento de contexto por agente (historial local por agente/tarea),
 *  - malla de comunicacion inter-agente auditable via AgentEventBus,
 *  - validacion cruzada (consenso multi-IA) y respuesta consolidada.
 *
 * El orquestador nunca bloquea el event loop: todo es I/O async acotado.
 */

export type AgentRunStatus = "completed" | "failed";

export type AgentRunResult = {
  agent: string;
  agentFile: string;
  taskId: string;
  status: AgentRunStatus;
  output: string | null;
  toolCalls: number;
  providerLabel: string;
  model: string;
  latencyMs: number;
  error?: string;
};

export type AgentConsensusVerdict = {
  validator: string;
  targetAgent: string;
  verdict: "aprobado" | "observaciones" | "rechazado";
  notes: string;
};

export type AgentSwarmResult = {
  taskId: string;
  task: string;
  results: AgentRunResult[];
  verdicts: AgentConsensusVerdict[];
  consolidated: string | null;
  events: AgentEvent[];
};

export type AgentOrchestratorOptions = {
  /** Resuelve el proveedor IA para un agente. Default: runtime por env con fallback determinista. */
  providerFactory?: (spec: AgentSpec) => AiProviderRuntime;
  /** Ejecutor de herramientas T-BIT opcional (mismo contrato que TBitChatEngine). */
  toolExecutor?: (toolName: string, args: Record<string, unknown>) => Promise<unknown>;
  tools?: AiProviderRequest["tools"];
  maxConcurrency?: number;
  /** Maximo de iteraciones de tool-calling por agente. */
  maxToolIterations?: number;
  bus?: AgentEventBus;
  /** Hook de persistencia en Q-Vault (se conecta a memoryCore en la Fase 66). */
  onRunComplete?: (result: AgentRunResult, task: string) => Promise<void>;
};

export type AgentRunRequest = {
  task: string;
  userId?: string;
  context?: string;
};

const DEFAULT_MAX_CONCURRENCY = 4;
const DEFAULT_MAX_TOOL_ITERATIONS = 3;

function newTaskId(): string {
  return `task_${Date.now().toString(36)}_${Math.random().toString(16).slice(2, 8)}`;
}

/** Pool de concurrencia propio (D-002): semaforo async sin dependencias. */
class AsyncPool {
  private active = 0;
  private readonly queue: Array<() => void> = [];

  constructor(private readonly limit: number) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.limit) {
      await new Promise<void>((resolve) => this.queue.push(resolve));
    }
    this.active += 1;
    try {
      return await fn();
    } finally {
      this.active -= 1;
      const next = this.queue.shift();
      if (next) next();
    }
  }
}

function extractText(message: AiMessage | undefined): string | null {
  const content = message?.content;
  if (typeof content === "string" && content.trim()) return content.trim();
  return null;
}

function safeJsonParse(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch {
    // fall through
  }
  return {};
}

function classifyVerdict(text: string): AgentConsensusVerdict["verdict"] {
  const lower = text.toLowerCase();
  if (lower.includes("rechaz") || lower.includes("incorrecto") || lower.includes("falso")) return "rechazado";
  if (lower.includes("observacion") || lower.includes("riesgo") || lower.includes("sin embargo") || lower.includes("pendiente")) return "observaciones";
  return "aprobado";
}

export class AgentOrchestrator {
  private readonly bus: AgentEventBus;
  private readonly pool: AsyncPool;
  private readonly maxToolIterations: number;

  constructor(private readonly options: AgentOrchestratorOptions = {}) {
    this.bus = options.bus ?? getAgentEventBus();
    this.pool = new AsyncPool(Math.max(1, options.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY));
    this.maxToolIterations = Math.max(1, options.maxToolIterations ?? DEFAULT_MAX_TOOL_ITERATIONS);
  }

  listAgents(): Array<{ name: string; file: string; description: string; capabilities: string[]; tools: string[]; policy: AgentPolicyOverlay }> {
    return loadAgentSpecs().map((spec) => ({
      name: spec.name,
      file: spec.file,
      description: spec.description,
      capabilities: spec.capabilities,
      tools: spec.tools,
      policy: deriveAgentPolicy(spec),
    }));
  }

  hasAgent(name: string): boolean {
    return Boolean(getAgentSpec(name));
  }

  async runAgent(agentName: string, request: AgentRunRequest): Promise<AgentRunResult> {
    const spec = getAgentSpec(agentName);
    if (!spec) {
      throw new Error(`Agente no encontrado en .github/agents: ${agentName}`);
    }
    return this.runAgentWithTaskId(spec, request, newTaskId());
  }

  /**
   * Ejecuta un enjambre paralelo: todos los agentes trabajan la tarea en
   * paralelo (pool acotado), luego validadores cruzados revisan cada salida y
   * un agente de consenso consolida la respuesta final.
   */
  async runSwarm(request: AgentRunRequest, options: { agents?: string[]; validators?: string[] } = {}): Promise<AgentSwarmResult> {
    const taskId = newTaskId();
    const allSpecs = loadAgentSpecs();
    const selected = options.agents?.length
      ? options.agents.map((name) => {
          const spec = getAgentSpec(name);
          if (!spec) throw new Error(`Agente no encontrado en .github/agents: ${name}`);
          return spec;
        })
      : allSpecs;

    const results = await Promise.all(
      selected.map((spec) => this.runAgentWithTaskId(spec, request, taskId)),
    );

    // Validacion cruzada: por defecto los agentes de consenso/validacion revisan.
    const validatorNames = options.validators ?? ["Consensus Agent", "Validation Agent"];
    const validators = validatorNames
      .map((name) => getAgentSpec(name))
      .filter((spec): spec is AgentSpec => Boolean(spec))
      .filter((spec) => !results.some((result) => result.agent === spec.name && result.status === "failed"));

    const verdicts: AgentConsensusVerdict[] = [];
    for (const validator of validators) {
      this.bus.publish({ type: "validation.requested", from: validator.name, taskId });
      for (const result of results) {
        if (result.status !== "completed" || !result.output) continue;
        const review = await this.runAgent(validator.name, {
          task: [
            "Evalua criticamente la siguiente respuesta de otro agente T-BIT.",
            `Agente autor: ${result.agent}`,
            `Tarea original: ${request.task}`,
            `Respuesta a evaluar: ${result.output}`,
            "Responde con un veredicto (aprobado/observaciones/rechazado) y tus notas.",
          ].join("\n\n"),
          userId: request.userId,
        });
        const notes = review.output ?? review.error ?? "Sin salida del validador.";
        const verdict: AgentConsensusVerdict = {
          validator: validator.name,
          targetAgent: result.agent,
          verdict: classifyVerdict(notes),
          notes,
        };
        verdicts.push(verdict);
        this.bus.publish({
          type: "validation.completed",
          from: validator.name,
          to: result.agent,
          taskId,
          payload: { verdict: verdict.verdict },
        });
      }
    }

    // Consolidacion: un agente de consenso sintetiza la respuesta final.
    const consolidator = validators[0] ?? selected[0];
    let consolidated: string | null = null;
    if (results.some((result) => result.status === "completed")) {
      this.bus.publish({ type: "consensus.requested", from: consolidator.name, taskId });
      const synthesisInput = results
        .filter((result) => result.status === "completed" && result.output)
        .map((result) => `### ${result.agent}\n${result.output}`)
        .join("\n\n");
      const objectionInput = verdicts.length
        ? `\n\n### Observaciones de validacion cruzada\n${verdicts
            .filter((verdict) => verdict.verdict !== "aprobado")
            .map((verdict) => `- ${verdict.validator} sobre ${verdict.targetAgent}: ${verdict.notes}`)
            .join("\n")}`
        : "";
      const synthesis = await this.runAgent(consolidator.name, {
        task: [
          "Consolida las respuestas del enjambre multi-agente T-BIT en una sola respuesta final,",
          "coherente, sin contradicciones y marcando como no verificadas las afirmaciones sin respaldo.",
          `Tarea original: ${request.task}`,
          "",
          "### Respuestas del enjambre",
          synthesisInput,
          objectionInput,
        ].join("\n"),
        userId: request.userId,
      });
      consolidated = synthesis.output;
      this.bus.publish({ type: "consensus.completed", from: consolidator.name, taskId });
    }

    return {
      taskId,
      task: request.task,
      results,
      verdicts,
      consolidated,
      events: this.bus.getJournalForTask(taskId),
    };
  }

  /** Mensaje directo auditable entre agentes (malla de comunicacion). */
  sendMessage(from: string, to: string, payload: unknown, taskId?: string): AgentEvent {
    return this.bus.publish({ type: "message.sent", from, to, taskId, payload });
  }

  private resolveRuntime(spec: AgentSpec): AiProviderRuntime {
    if (this.options.providerFactory) {
      return this.options.providerFactory(spec);
    }
    // Import diferido para no acoplar el modulo a la factory en tests.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createAiProviderRuntime } = require("../../AiProviderFactory") as typeof import("../../AiProviderFactory");
    return createAiProviderRuntime();
  }

  private async runAgentWithTaskId(spec: AgentSpec, request: AgentRunRequest, taskId: string): Promise<AgentRunResult> {
    const runtime = this.resolveRuntime(spec);
    const startedAt = Date.now();
    this.bus.publish({ type: "task.started", from: spec.name, taskId, payload: { task: request.task } });
    try {
      const output = await this.pool.run(() => this.executeWithTools(spec, runtime, request, taskId));
      const result: AgentRunResult = {
        agent: spec.name,
        agentFile: spec.file,
        taskId,
        status: "completed",
        output,
        toolCalls: 0,
        providerLabel: runtime.label,
        model: runtime.model,
        latencyMs: Date.now() - startedAt,
      };
      this.bus.publish({ type: "task.completed", from: spec.name, taskId, payload: { latencyMs: result.latencyMs } });
      if (this.options.onRunComplete) {
        try {
          await this.options.onRunComplete(result, request.task);
        } catch {
          // La persistencia en memoria nunca debe romper la ejecucion del agente.
        }
      }
      return result;
    } catch (error) {
      const result: AgentRunResult = {
        agent: spec.name,
        agentFile: spec.file,
        taskId,
        status: "failed",
        output: null,
        toolCalls: 0,
        providerLabel: runtime.label,
        model: runtime.model,
        latencyMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : "Error desconocido",
      };
      this.bus.publish({ type: "task.failed", from: spec.name, taskId, payload: { error: result.error } });
      return result;
    }
  }

  /** Ejecucion con aislamiento de contexto: historial local por agente/tarea. */
  private async executeWithTools(
    spec: AgentSpec,
    runtime: AiProviderRuntime,
    request: AgentRunRequest,
    taskId: string,
  ): Promise<string | null> {
    const systemPrompt = buildAgentSystemPrompt(spec, { task: request.task, userId: request.userId });
    const history: AiMessage[] = [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: request.context
          ? `${request.task}\n\n=== CONTEXTO Q-VAULT ===\n${request.context}`
          : request.task,
      },
    ];

    for (let iteration = 0; iteration < this.maxToolIterations; iteration += 1) {
      const response = await runtime.provider.generateWithTools({
        messages: history,
        tools: this.options.tools,
        toolChoice: "auto",
      });
      const assistant = response.message;
      const toolCalls = assistant.tool_calls ?? [];

      if (toolCalls.length === 0) {
        return extractText(assistant);
      }

      history.push(assistant);
      for (const call of toolCalls) {
        const args = safeJsonParse(call.function.arguments);
        let toolResult: unknown;
        try {
          if (!this.options.toolExecutor) {
            toolResult = { ok: false, error: "El runtime de agentes no tiene ejecutor de herramientas configurado." };
          } else {
            toolResult = await this.options.toolExecutor(call.function.name, args);
          }
        } catch (error) {
          toolResult = { ok: false, error: error instanceof Error ? error.message : "Error de herramienta" };
        }
        this.bus.publish({
          type: "message.sent",
          from: spec.name,
          to: `tool:${call.function.name}`,
          taskId,
          payload: { args },
        });
        history.push({
          role: "tool",
          tool_call_id: call.id,
          name: call.function.name,
          content: JSON.stringify(toolResult),
        });
      }
    }

    // Ultima pasada sin herramientas para forzar respuesta textual.
    const finalResponse = await runtime.provider.generateWithTools({
      messages: history,
      toolChoice: "none",
    });
    return extractText(finalResponse.message);
  }
}

const globalOrchestrator = new AgentOrchestrator();

export function getAgentOrchestrator(): AgentOrchestrator {
  return globalOrchestrator;
}

