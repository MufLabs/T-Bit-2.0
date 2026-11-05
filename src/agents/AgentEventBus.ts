/**
 * AgentEventBus — Fase 64 (Runtime Multi-Agente).
 *
 * Bus de eventos fuertemente tipado y auditable para la malla de comunicacion
 * inter-agente. Todo mensaje entre agentes, delegacion, validacion cruzada y
 * resultado de tarea pasa por aqui y queda registrado en un journal en memoria
 * (acotado) consultable via `GET /api/agents/events`.
 *
 * Sin dependencias nuevas: implementacion propia sobre Map/Set.
 */

export type AgentEventType =
  | "task.started"
  | "task.completed"
  | "task.failed"
  | "message.sent"
  | "delegation.requested"
  | "validation.requested"
  | "validation.completed"
  | "consensus.requested"
  | "consensus.completed"
  | "memory.persisted";

export type AgentEvent = {
  id: string;
  ts: string;
  type: AgentEventType;
  from: string;
  to?: string;
  taskId?: string;
  payload?: unknown;
};

export type AgentEventHandler = (event: AgentEvent) => void;

const JOURNAL_LIMIT = 2000;

function nextEventId(): string {
  return `evt_${Date.now().toString(36)}_${Math.random().toString(16).slice(2, 10)}`;
}

export class AgentEventBus {
  private readonly handlers = new Map<AgentEventType | "*", Set<AgentEventHandler>>();
  private journal: AgentEvent[] = [];

  subscribe(type: AgentEventType | "*", handler: AgentEventHandler): () => void {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type)!.add(handler);
    return () => {
      this.handlers.get(type)?.delete(handler);
    };
  }

  publish(input: Omit<AgentEvent, "id" | "ts"> & { id?: string; ts?: string }): AgentEvent {
    const event: AgentEvent = {
      id: input.id ?? nextEventId(),
      ts: input.ts ?? new Date().toISOString(),
      type: input.type,
      from: input.from,
      to: input.to,
      taskId: input.taskId,
      payload: input.payload,
    };
    this.journal.push(event);
    if (this.journal.length > JOURNAL_LIMIT) {
      this.journal = this.journal.slice(this.journal.length - JOURNAL_LIMIT);
    }
    for (const handler of this.handlers.get(event.type) ?? []) {
      try {
        handler(event);
      } catch {
        // Un handler defectuoso nunca debe romper el flujo del bus.
      }
    }
    for (const handler of this.handlers.get("*") ?? []) {
      try {
        handler(event);
      } catch {
        // idem
      }
    }
    return event;
  }

  getJournal(limit?: number): AgentEvent[] {
    const events = [...this.journal];
    return typeof limit === "number" && limit > 0 ? events.slice(-limit) : events;
  }

  getJournalForTask(taskId: string): AgentEvent[] {
    return this.journal.filter((event) => event.taskId === taskId);
  }

  get size(): number {
    return this.journal.length;
  }

  clearJournal(): void {
    this.journal = [];
  }
}

const globalBus = new AgentEventBus();

export function getAgentEventBus(): AgentEventBus {
  return globalBus;
}
