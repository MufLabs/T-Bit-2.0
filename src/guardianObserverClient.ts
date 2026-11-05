import { buildTBitApiHeaders } from "./tbitApiHeaders";

const API_BASE_URL = import.meta.env.VITE_TBIT_API_BASE_URL?.trim() || "http://localhost:3000";

export type GuardianObserverRequest = {
  userId?: string;
  maxDocuments?: number;
  minConfidence?: number;
};

export type GuardianDocumentSummary = {
  key: string;
  userId: string;
  title: string;
  source: string;
  tags: string[];
  linkCount: number;
  backlinkCount: number;
  chunkCount: number;
  updatedAt: string;
  textPreview: string;
};

export type GuardianOrphanFinding = {
  key: string;
  title: string;
  source: string;
  reasons: string[];
};

export type GuardianLinkSuggestion = {
  sourceKey: string;
  targetKey: string;
  confidence: number;
  reason: string;
  status: "suggested";
  createdBy: "guardian:observer";
};

export type GuardianDuplicateCandidate = {
  sourceKey: string;
  targetKey: string;
  confidence: number;
  reason: string;
};

export type GuardianTopicCluster = {
  tag: string;
  keys: string[];
  count: number;
};

export type GuardianObserverReport = {
  mode: "observer";
  generatedAt: string;
  userId?: string;
  totals: {
    documents: number;
    chunks: number;
    orphanDocuments: number;
    suggestedLinks: number;
    duplicateCandidates: number;
    topicClusters: number;
  };
  documents: GuardianDocumentSummary[];
  orphans: GuardianOrphanFinding[];
  linkSuggestions: GuardianLinkSuggestion[];
  duplicateCandidates: GuardianDuplicateCandidate[];
  topicClusters: GuardianTopicCluster[];
  notes: string[];
};

async function parseJsonResponse<T>(response: Response): Promise<T & { error?: string }> {
  const text = await response.text();
  try {
    return JSON.parse(text) as T & { error?: string };
  } catch {
    throw new Error(`La API Guardian no devolvio JSON. URL: ${response.url}`);
  }
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: buildTBitApiHeaders(true),
    body: JSON.stringify(body),
  });
  const payload = await parseJsonResponse<T>(response);
  if (!response.ok) throw new Error(payload.error ?? "Fallo en Guardian Observer.");
  return payload;
}

export const guardianObserverClient = {
  observe(body: GuardianObserverRequest) {
    return postJson<{ ok: boolean; report: GuardianObserverReport }>("/api/guardian/observe", body);
  },
};
