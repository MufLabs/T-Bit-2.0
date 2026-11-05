import { describe, expect, it, vi } from "vitest";
import { AgentEventBus } from "../src/agents/AgentEventBus";
import {
  buildAgentSystemPrompt,
  deriveAgentPolicy,
  getAgentSpec,
  loadAgentSpecs,
} from "../src/agents/AgentSpecLoader";
import { AgentOrchestrator } from "../src/agents/AgentOrchestrator";
import type { AiProvider, AiProviderRequest, AiProviderResponse } from "../AiProvider";
import type { AiProviderRuntime } from "../AiProviderFactory";

function fakeRuntime(output: string, label = "FakeProvider"): AiProviderRuntime {
  const provider: AiProvider = {
    async generateWithTools(request: AiProviderRequest): Promise<AiProviderResponse> {
      const last = request.messages[request.messages.length - 1];
      return { message: { role: "assistant", content: `${output}:${last?.content?.slice(0, 24) ?? ""}` } };
    },
  };
  return { provider, id: "fake", label, model: "fake-model", mode: "deterministic" };
}

describe("AgentSpecLoader — Fase 64", () => {
  it("carga exactamente las 18 especificaciones del baseline", () => {
    expect(loadAgentSpecs().length).toBe(18);
  });

  it("resuelve agentes por nombre y por archivo", () => {
    expect(getAgentSpec("Consensus Agent")?.file).toBe("ConsensusAgent.agent.md");
    expect(getAgentSpec("GraphEngineeringAgent.agent.md")?.name).toBe("Graph Engineering Agent");
    expect(getAgentSpec("agente-inexistente")).toBeUndefined();
  });

  it("deriva un PolicyOverlay seguro: ningun agente obtiene borrado", () => {
    for (const spec of loadAgentSpecs()) {
      const policy = deriveAgentPolicy(spec);
      expect(policy.canDelete).toBe(false);
      expect(policy.requireDeleteConfirmation).toBe(true);
      expect(policy.allowedTools).toEqual(spec.tools);
    }
  });

  it("construye el system prompt con rol, reglas y cuerpo del spec", () => {
    const spec = getAgentSpec("Security Auditor")!;
    const prompt = buildAgentSystemPrompt(spec, { task: "Auditar modulo X", userId: "tester" });
    expect(prompt).toContain("[T-BIT AGENT RUNTIME]");
    expect(prompt).toContain("Security Auditor");
    expect(prompt).toContain("Auditar modulo X");
    expect(prompt).toContain("=== REGLAS DEL RUNTIME ===");
  });
});

describe("AgentEventBus — Fase 64", () => {
  it("publica, registra en journal y notifica a suscriptores tipados", () => {
    const bus = new AgentEventBus();
    const seen: string[] = [];
    bus.subscribe("task.completed", (event) => seen.push(event.type));
    bus.subscribe("*", (event) => seen.push(`*:${event.from}`));

    bus.publish({ type: "task.started", from: "Agente A" });
    bus.publish({ type: "task.completed", from: "Agente A" });

    // task.started solo notifica al suscriptor "*"; task.completed notifica a ambos.
    expect(seen).toEqual(["*:Agente A", "task.completed", "*:Agente A"]);
    expect(bus.getJournal().length).toBe(2);
    expect(bus.getJournal()[0].id).toMatch(/^evt_/);
  });

  it("un handler defectuoso no rompe el bus ni a otros suscriptores", () => {
    const bus = new AgentEventBus();
    bus.subscribe("task.started", () => {
      throw new Error("handler roto");
    });
    const seen: string[] = [];
    bus.subscribe("task.started", (event) => seen.push(event.from));
    bus.publish({ type: "task.started", from: "Agente B" });
    expect(seen).toEqual(["Agente B"]);

describe("AgentOrchestrator — Fase 64", () => {
  it("ejecuta un agente individual con aislamiento de contexto", async () => {
    const orchestrator = new AgentOrchestrator({
      providerFactory: () => fakeRuntime("OK"),
    });
    const result = await orchestrator.runAgent("Code Reviewer", { task: "Revisa el modulo Y" });
    expect(result.status).toBe("completed");
    expect(result.agent).toBe("Code Reviewer");
    expect(result.output).toContain("OK");
    expect(result.error).toBeUndefined();
  });

  it("falla de forma controlada con agente inexistente", async () => {
    const orchestrator = new AgentOrchestrator({ providerFactory: () => fakeRuntime("OK") });
    await expect(orchestrator.runAgent("NoExiste", { task: "x" })).rejects.toThrow(/Agente no encontrado/);
  });

  it("ejecuta el enjambre completo de 18 agentes en paralelo y consolida", async () => {
    const orchestrator = new AgentOrchestrator({
      providerFactory: () => fakeRuntime("Aporte"),
      maxConcurrency: 6,
    });
    const swarm = await orchestrator.runSwarm({ task: "Disena una API de pagos" });
    expect(swarm.results.length).toBe(18);
    expect(swarm.results.every((result) => result.status === "completed")).toBe(true);
    expect(swarm.consolidated).toContain("Aporte");
    expect(swarm.events.length).toBeGreaterThan(0);
    expect(swarm.events.every((event) => event.taskId === swarm.taskId)).toBe(true);
  });

  it("respeta el limite de concurrencia del pool", async () => {
    let active = 0;
    let peak = 0;
    const orchestrator = new AgentOrchestrator({
      maxConcurrency: 2,
      providerFactory: () => {
        const provider: AiProvider = {
          async generateWithTools(): Promise<AiProviderResponse> {
            active += 1;
            peak = Math.max(peak, active);
            await new Promise((resolve) => setTimeout(resolve, 10));
            active -= 1;
            return { message: { role: "assistant", content: "listo" } };
          },
        };
        return { provider, id: "fake", label: "Fake", model: "m", mode: "deterministic" };
      },
    });
    const swarm = await orchestrator.runSwarm(
      { task: "tarea" },
      { agents: ["Code Reviewer", "Developer Agent", "Security Auditor", "Chief Architect", "Prompt Engineer", "Validation Agent"] },
    );
    expect(swarm.results.length).toBe(6);
    expect(peak).toBeLessThanOrEqual(2);
  });

  it("registra fallos por agente sin romper el enjambre", async () => {
    const orchestrator = new AgentOrchestrator({
      providerFactory: (spec) =>
        spec.name === "Security Auditor"
          ? ({
              provider: {
                async generateWithTools(): Promise<AiProviderResponse> {
                  throw new Error("proveedor caido");
                },
              },
              id: "fake",
              label: "Fake",
              model: "m",
              mode: "deterministic",
            } satisfies AiProviderRuntime)
          : fakeRuntime("Aporte"),
    });
    const swarm = await orchestrator.runSwarm(
      { task: "tarea" },
      { agents: ["Code Reviewer", "Security Auditor"] },
    );
    const failed = swarm.results.find((result) => result.agent === "Security Auditor");
    const ok = swarm.results.find((result) => result.agent === "Code Reviewer");
    expect(failed?.status).toBe("failed");
    expect(failed?.error).toContain("proveedor caido");
    expect(ok?.status).toBe("completed");
    expect(swarm.consolidated).toBeTruthy();
  });

  it("invoca el hook de persistencia por cada agente completado", async () => {
    const onRunComplete = vi.fn(async () => undefined);
    const orchestrator = new AgentOrchestrator({
      providerFactory: () => fakeRuntime("Aporte"),
      onRunComplete,
    });
    await orchestrator.runSwarm({ task: "tarea" }, { agents: ["Code Reviewer", "Developer Agent"] });
    expect(onRunComplete).toHaveBeenCalledTimes(2);
  });

  it("ejecuta herramientas declaradas via toolExecutor y entrega el resultado al proveedor", async () => {
    const provider: AiProvider = {
      async generateWithTools(request: AiProviderRequest): Promise<AiProviderResponse> {
        const last = request.messages[request.messages.length - 1];
        if (last?.role === "tool") {
          return { message: { role: "assistant", content: `resultado: ${last.content}` } };
        }
        return {
          message: {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id: "call_1",
                type: "function",
                function: { name: "buscar_indice_tbit", arguments: JSON.stringify({ query: "pagos" }) },
              },
            ],
          },
        };
      },
    };
    const toolExecutor = vi.fn(async (name: string) => ({ ok: true, tool: name }));
    const orchestrator = new AgentOrchestrator({
      providerFactory: () => ({ provider, id: "fake", label: "Fake", model: "m", mode: "deterministic" }),
      toolExecutor,
    });
    const result = await orchestrator.runAgent("Code Reviewer", { task: "busca pagos" });
    expect(toolExecutor).toHaveBeenCalledWith("buscar_indice_tbit", { query: "pagos" });
    expect(result.output).toContain("resultado:");
  });
});

  });

  it("el journal esta acotado", () => {
    const bus = new AgentEventBus();
    for (let i = 0; i < 2100; i += 1) {
      bus.publish({ type: "message.sent", from: "A", to: "B", payload: i });
    }
    expect(bus.size).toBeLessThanOrEqual(2000);
  });
});
