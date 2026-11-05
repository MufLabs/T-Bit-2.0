import { getQueryIndex, QueryIndexEntry } from "./queryIndex";
import { searchSemanticIndex } from "./semanticIndex";

export type GuardianObservationRequest = {
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

type DocumentAccumulator = {
  key: string;
  userId: string;
  title: string;
  source: string;
  tags: Set<string>;
  links: Set<string>;
  backlinks: Set<string>;
  chunkCount: number;
  updatedAt: string;
  textPreview: string;
};

function rootKeyOf(entry: QueryIndexEntry): string {
  return entry.documentRoot ?? entry.key;
}

function normalizeText(value: string): string {
  return value.normalize("NFC").toLowerCase();
}

function normalizeTitle(value: string): string {
  return normalizeText(value)
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function tokenize(value: string): Set<string> {
  return new Set(
    normalizeText(value)
      .split(/[^\p{L}\p{N}]+/u)
      .map((token) => token.trim())
      .filter((token) => token.length > 3),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection += 1;
  }
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : intersection / union;
}

function pairId(a: string, b: string): string {
  return [a, b].sort().join("::PAIR::");
}

function summarizeEntryText(entry: QueryIndexEntry): string {
  return `${entry.title} ${entry.filename ?? ""} ${entry.tags.join(" ")} ${entry.textPreview}`;
}

export async function observeGuardian(request: GuardianObservationRequest = {}): Promise<GuardianObserverReport> {
  const queryIndex = await getQueryIndex();
  const maxDocuments = Math.max(1, Math.min(Number(request.maxDocuments ?? 40), 120));
  const minConfidence = Math.max(0.1, Math.min(Number(request.minConfidence ?? 0.58), 0.98));
  const entries = Object.values(queryIndex.entries).filter((entry) => !request.userId || entry.userId === request.userId);
  const rootByEntryKey = new Map(entries.map((entry) => [entry.key, rootKeyOf(entry)]));
  const documents = new Map<string, DocumentAccumulator>();

  for (const entry of entries) {
    const rootKey = rootKeyOf(entry);
    const existing = documents.get(rootKey);
    if (existing) {
      for (const tag of entry.tags) existing.tags.add(tag);
      for (const link of entry.links) existing.links.add(rootByEntryKey.get(link) ?? link);
      for (const backlink of entry.backlinks) existing.backlinks.add(rootByEntryKey.get(backlink) ?? backlink);
      if (entry.documentRoot) existing.chunkCount += 1;
      if (entry.updatedAt > existing.updatedAt) existing.updatedAt = entry.updatedAt;
      if (!existing.textPreview && entry.textPreview) existing.textPreview = entry.textPreview;
      continue;
    }

    documents.set(rootKey, {
      key: rootKey,
      userId: entry.userId,
      title: entry.documentRoot ? rootKey.split("::").slice(-1)[0] ?? entry.title : entry.title,
      source: entry.source,
      tags: new Set(entry.tags),
      links: new Set(entry.links.map((link) => rootByEntryKey.get(link) ?? link)),
      backlinks: new Set(entry.backlinks.map((backlink) => rootByEntryKey.get(backlink) ?? backlink)),
      chunkCount: entry.documentRoot ? 1 : 0,
      updatedAt: entry.updatedAt,
      textPreview: entry.textPreview,
    });
  }

  const documentList: GuardianDocumentSummary[] = Array.from(documents.values())
    .map((document) => ({
      key: document.key,
      userId: document.userId,
      title: document.title,
      source: document.source,
      tags: Array.from(document.tags),
      linkCount: Array.from(document.links).filter((key) => key !== document.key).length,
      backlinkCount: Array.from(document.backlinks).filter((key) => key !== document.key).length,
      chunkCount: document.chunkCount,
      updatedAt: document.updatedAt,
      textPreview: document.textPreview,
    }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  const orphans: GuardianOrphanFinding[] = documentList
    .map((document) => {
      const reasons: string[] = [];
      if (document.linkCount === 0 && document.backlinkCount === 0) reasons.push("sin links ni backlinks");
      if (document.tags.length === 0) reasons.push("sin tags");
      if (!document.textPreview.trim()) reasons.push("sin preview textual");
      return reasons.length ? { key: document.key, title: document.title, source: document.source, reasons } : null;
    })
    .filter((item): item is GuardianOrphanFinding => Boolean(item))
    .slice(0, 24);

  const tagMap = new Map<string, string[]>();
  for (const document of documentList) {
    for (const tag of document.tags) {
      const normalizedTag = tag.trim();
      if (!normalizedTag) continue;
      if (!tagMap.has(normalizedTag)) tagMap.set(normalizedTag, []);
      tagMap.get(normalizedTag)?.push(document.key);
    }
  }

  const topicClusters = Array.from(tagMap.entries())
    .filter(([, keys]) => keys.length > 1)
    .map(([tag, keys]) => ({ tag, keys, count: keys.length }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
    .slice(0, 16);

  const duplicateCandidates: GuardianDuplicateCandidate[] = [];
  const seenDuplicates = new Set<string>();
  const sampledDocuments = documentList.slice(0, maxDocuments);
  for (let i = 0; i < sampledDocuments.length; i += 1) {
    for (let j = i + 1; j < sampledDocuments.length; j += 1) {
      const a = sampledDocuments[i];
      const b = sampledDocuments[j];
      const id = pairId(a.key, b.key);
      if (seenDuplicates.has(id)) continue;
      const titleA = normalizeTitle(a.title);
      const titleB = normalizeTitle(b.title);
      const similarity = jaccard(tokenize(`${a.title} ${a.textPreview}`), tokenize(`${b.title} ${b.textPreview}`));
      if (titleA && titleA === titleB) {
        duplicateCandidates.push({
          sourceKey: a.key,
          targetKey: b.key,
          confidence: 1,
          reason: "titulo normalizado identico",
        });
        seenDuplicates.add(id);
      } else if (similarity >= 0.78) {
        duplicateCandidates.push({
          sourceKey: a.key,
          targetKey: b.key,
          confidence: Number(similarity.toFixed(2)),
          reason: "alta similitud textual entre titulo y preview",
        });
        seenDuplicates.add(id);
      }
    }
  }

  const linkSuggestions: GuardianLinkSuggestion[] = [];
  const seenSuggestions = new Set<string>();
  for (const source of sampledDocuments) {
    const sourceAccumulator = documents.get(source.key);
    if (!sourceAccumulator) continue;
    const semanticQuery = summarizeEntryText({
      key: source.key,
      userId: source.userId,
      source: source.source,
      title: source.title,
      checksum: "",
      summary: source.textPreview,
      chunkCount: source.chunkCount,
      searchable: true,
      internalKeys: [],
      tags: source.tags,
      links: [],
      backlinks: [],
      attributes: {},
      createdAt: source.updatedAt,
      updatedAt: source.updatedAt,
      textPreview: source.textPreview,
    });
    if (!semanticQuery.trim()) continue;

    const semantic = await searchSemanticIndex({
      query: semanticQuery,
      userId: source.userId,
      limit: 8,
    });

    for (const result of semantic.results) {
      if (result.rootKey === source.key) continue;
      if (!documents.has(result.rootKey)) continue;
      if (sourceAccumulator.links.has(result.rootKey) || sourceAccumulator.backlinks.has(result.rootKey)) continue;
      const id = pairId(source.key, result.rootKey);
      if (seenSuggestions.has(id)) continue;
      if (result.score < minConfidence) continue;

      linkSuggestions.push({
        sourceKey: source.key,
        targetKey: result.rootKey,
        confidence: Number(result.score.toFixed(2)),
        reason: `similitud semantica entre "${source.title}" y "${result.title}"`,
        status: "suggested",
        createdBy: "guardian:observer",
      });
      seenSuggestions.add(id);
    }
  }

  linkSuggestions.sort((a, b) => b.confidence - a.confidence).splice(20);
  duplicateCandidates.sort((a, b) => b.confidence - a.confidence).splice(16);

  return {
    mode: "observer",
    generatedAt: new Date().toISOString(),
    userId: request.userId,
    totals: {
      documents: documentList.length,
      chunks: documentList.reduce((sum, document) => sum + document.chunkCount, 0),
      orphanDocuments: orphans.length,
      suggestedLinks: linkSuggestions.length,
      duplicateCandidates: duplicateCandidates.length,
      topicClusters: topicClusters.length,
    },
    documents: documentList.slice(0, 40),
    orphans,
    linkSuggestions,
    duplicateCandidates,
    topicClusters,
    notes: [
      "Guardian Observer no modifica payloads, links ni archivos .tbit.",
      "Las conexiones se reportan como suggested para revision humana.",
      "El analisis se ejecuta sobre Query Index y Semantic Index, no sobre bytes crudos.",
    ],
  };
}
