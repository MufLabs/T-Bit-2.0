const API_BASE_URL = import.meta.env.VITE_TBIT_API_BASE_URL?.trim() || "http://localhost:3000";

export type AgentPolicyView = {
  canWrite: boolean;
  canDelete: boolean;
  requiresConfirmationForDelete: boolean;
  tools: string[];
};

export type AgentCatalogEntry = {
  name: string;
  file: string;
  description: string;
  capabilities: string[];
  tools: string[];
  policy: AgentPolicyView;
};

export type AgentEventView = {
  id: string;
  ts: string;
  type: string;
  from: string;
  to?: string;
  taskId?: string;
  payload?: unknown;
};

export type ProviderHealthView = {
  id: string;
  label: string;
  model: string;
  mode: string;
  available: boolean;
  inCooldown: boolean;
  cooldownUntil: string | null;
  lastError: string | null;
  totalRequests: number;
  totalFailures: number;
  lastLatencyMs: number | null;
  avgLatencyMs: number | null;
};

export type AgentRunView = {
  agent: string;
  taskId: string;
  status: string;
  output: string;
  error?: string;
  providerLabel: string;
  model: string;
  latencyMs: number;
  toolCalls: number;
};

export type AgentSwarmView = {
  taskId: string;
  task: string;
  results: AgentRunView[];
  verdicts: Array<{ validator: string; targetAgent: string; verdict: string; notes: string }>;
  consolidated: string | null;
  events: AgentEventView[];
};

export type VaultCitationView = { key: string; title: string; source: string; score: number; preview: string };

export type VaultVerificationView = {
  checkedTerms: string[];
  verifiedTerms: string[];
  unverifiedTerms: string[];
  citations: VaultCitationView[];
};

type TBitUserProfileStorage = { userId?: string; displayName?: string };

function buildHeaders(includeJson = false): HeadersInit {
  const headers: Record<string, string> = {
    "x-tbit-api-key": import.meta.env.VITE_TBIT_API_KEY ?? localStorage.getItem("tbit_api_key") ?? "",
  };
  if (includeJson) headers["Content-Type"] = "application/json";
  return headers;
}

function activeUserId(): string {
  try {
    const profile = JSON.parse(localStorage.getItem("tbit_user_profile") ?? "null") as TBitUserProfileStorage | null;
    return profile?.userId?.trim() || profile?.displayName?.trim() || "";
  } catch {
    return "";
  }
}

async function parseJson<T>(response: Response): Promise<T & { error?: string }> {
  return (await response.json()) as T & { error?: string };
}

export const agentRuntimeClient = {
  async listAgents(): Promise<{ total: number; agents: AgentCatalogEntry[] }> {
    const response = await fetch(`${API_BASE_URL}/api/agents`, { headers: buildHeaders() });
    const payload = await parseJson<{ ok: boolean; total: number; agents: AgentCatalogEntry[] }>(response);
    if (!response.ok) throw new Error(payload.error ?? "Fallo listando agentes.");
    return { total: payload.total, agents: payload.agents };
  },

  async listEvents(limit = 60): Promise<AgentEventView[]> {
    const response = await fetch(`${API_BASE_URL}/api/agents/events?limit=${limit}`, { headers: buildHeaders() });
    const payload = await parseJson<{ ok: boolean; events: AgentEventView[] }>(response);
    if (!response.ok) throw new Error(payload.error ?? "Fallo leyendo eventos de agentes.");
    return payload.events;
  },

  async providerHealth(): Promise<{ chainSize: number; providers: ProviderHealthView[] }> {
    const response = await fetch(`${API_BASE_URL}/api/ai/providers/health`, { headers: buildHeaders() });
    const payload = await parseJson<{ ok: boolean; chainSize: number; providers: ProviderHealthView[] }>(response);
    if (!response.ok) throw new Error(payload.error ?? "Fallo leyendo salud de proveedores.");
    return { chainSize: payload.chainSize, providers: payload.providers };
  },

  async runAgent(agent: string, task: string): Promise<{ result: AgentRunView; vaultCitations: VaultCitationView[]; verification: VaultVerificationView | null }> {
    const response = await fetch(`${API_BASE_URL}/api/agents/run`, {
      method: "POST",
      headers: buildHeaders(true),
      body: JSON.stringify({ agent, task, userId: activeUserId() || undefined }),
    });
    const payload = await parseJson<{ ok: boolean; result: AgentRunView; vaultCitations: VaultCitationView[]; verification: VaultVerificationView | null }>(response);
    if (!response.ok) throw new Error(payload.error ?? "Fallo ejecutando agente.");
    return payload;
  },

  async runSwarm(task: string, agents?: string[], validators?: string[]): Promise<{ swarm: AgentSwarmView; consensusMemory: { key: string } | null; vaultCitations: VaultCitationView[]; verification: VaultVerificationView | null }> {
    const response = await fetch(`${API_BASE_URL}/api/agents/swarm`, {
      method: "POST",
      headers: buildHeaders(true),
      body: JSON.stringify({ task, agents, validators, userId: activeUserId() || undefined }),
    });
    const payload = await parseJson<{ ok: boolean; swarm: AgentSwarmView; consensusMemory: { key: string } | null; vaultCitations: VaultCitationView[]; verification: VaultVerificationView | null }>(response);
    if (!response.ok) throw new Error(payload.error ?? "Fallo ejecutando el enjambre.");
    return payload;
  },
};
