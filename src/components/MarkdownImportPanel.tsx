import { useState } from "react";
import { markdownBridgeClient } from "../markdownBridgeClient";
import { useTBitStore } from "../store/useTBitStore";

type ImportLog = {
  level: "OK" | "ERROR" | "INFO";
  text: string;
};

type MarkdownDocumentItem = {
  key: string;
  userId: string;
  title: string;
  filename?: string;
  chunked: boolean;
  chunkCount: number;
  originalBytes?: number;
  updatedAt: string;
};

function readActiveUserId(): string {
  try {
    const profile = JSON.parse(localStorage.getItem("tbit_user_profile") ?? "null") as { userId?: string; displayName?: string } | null;
    return profile?.userId?.trim() || profile?.displayName?.trim() || "usuario_local";
  } catch {
    return "usuario_local";
  }
}

export function MarkdownImportPanel() {
  const { memoryGraph, setMemoryGraph } = useTBitStore();
  const [userId, setUserId] = useState(readActiveUserId);
  const [fileName, setFileName] = useState("");
  const [content, setContent] = useState("");
  const [documentKey, setDocumentKey] = useState("");
  const [documents, setDocuments] = useState<MarkdownDocumentItem[]>([]);
  const [selectedDocumentKey, setSelectedDocumentKey] = useState("");
  const [logs, setLogs] = useState<ImportLog[]>([]);
  const [busy, setBusy] = useState(false);

  const pushLog = (level: ImportLog["level"], text: string) => {
    setLogs((prev) => [...prev.slice(-4), { level, text }]);
  };

  const loadFile = async (file: File) => {
    setFileName(file.name);
    setContent(await file.text());
    pushLog("INFO", `Archivo cargado: ${file.name}`);
  };

  const importMarkdown = async () => {
    if (!fileName || !content.trim()) {
      pushLog("ERROR", "Selecciona un archivo Markdown primero.");
      return;
    }
    try {
      setBusy(true);
      const response = (await markdownBridgeClient.import({
        userId,
        filename: fileName,
        content,
      })) as { result?: { key?: string; links?: string[]; tags?: string[]; chunked?: boolean; chunkCount?: number; originalBytes?: number } };
      if (response.result?.key) {
        setDocumentKey(response.result.key);
        setSelectedDocumentKey(response.result.key);
      }
      pushLog("OK", `Importado: ${response.result?.key ?? fileName}`);
      pushLog("INFO", `Links: ${response.result?.links?.length ?? 0} | Tags: ${response.result?.tags?.length ?? 0}`);
      if (response.result?.chunked) {
        pushLog("INFO", `Documento grande: ${response.result.chunkCount} chunks | ${response.result.originalBytes} bytes`);
      }
    } catch (error) {
      pushLog("ERROR", error instanceof Error ? error.message : "Fallo importando Markdown.");
    } finally {
      setBusy(false);
    }
  };

  const loadDocuments = async () => {
    try {
      setBusy(true);
      const response = (await markdownBridgeClient.list(userId)) as { documents?: MarkdownDocumentItem[] };
      const nextDocuments = response.documents ?? [];
      setDocuments(nextDocuments);
      if (!selectedDocumentKey && nextDocuments[0]) {
        setSelectedDocumentKey(nextDocuments[0].key);
        setDocumentKey(nextDocuments[0].key);
      }
      pushLog("OK", `Documentos encontrados: ${nextDocuments.length}`);
    } catch (error) {
      pushLog("ERROR", error instanceof Error ? error.message : "Fallo listando documentos.");
    } finally {
      setBusy(false);
    }
  };

  const removeKeysFromGraph = (keys: string[]) => {
    if (!memoryGraph || keys.length === 0) return;
    const deleted = new Set(keys);
    setMemoryGraph({
      ...memoryGraph,
      nodes: memoryGraph.nodes.filter((node) => !deleted.has(node.key)),
      links: memoryGraph.links.filter((link) => !deleted.has(link.sourceKey) && !deleted.has(link.targetKey)),
      tags: Object.fromEntries(
        Object.entries(memoryGraph.tags)
          .map(([tag, tagKeys]) => [tag, tagKeys.filter((key) => !deleted.has(key))])
          .filter(([, tagKeys]) => tagKeys.length > 0),
      ),
    });
  };

  const deleteMarkdown = async () => {
    const key = (selectedDocumentKey || documentKey).trim();
    if (!key) {
      pushLog("ERROR", "Selecciona un documento a eliminar.");
      return;
    }

    const selected = documents.find((document) => document.key === key);
    const label = selected?.filename || selected?.title || key;

    const firstConfirmation = window.confirm(
      `Vas a eliminar definitivamente este documento del vacio:\n\n${label}\n\nEsta accion colapsa el manifiesto, sus chunks y sus enlaces logicos.`,
    );
    if (!firstConfirmation) return;

    const secondConfirmation = window.confirm(
      `Confirmacion final:\n\nEliminar "${label}" de forma permanente?`,
    );
    if (!secondConfirmation) return;

    try {
      setBusy(true);
      const response = (await markdownBridgeClient.delete(key)) as {
        result?: { deletedKeys?: string[]; collapsedCount?: number; indexRemovedCount?: number; warnings?: string[] };
      };
      pushLog("OK", `Documento eliminado: ${response.result?.deletedKeys?.length ?? 0} claves`);
      pushLog("INFO", `Colapsadas: ${response.result?.collapsedCount ?? 0} | Indice: ${response.result?.indexRemovedCount ?? 0}`);
      if (response.result?.warnings?.length) {
        pushLog("INFO", `Avisos: ${response.result.warnings.length}`);
      }
      removeKeysFromGraph(response.result?.deletedKeys ?? []);
      setDocuments((current) => current.filter((document) => document.key !== key));
      setSelectedDocumentKey("");
      setDocumentKey("");
    } catch (error) {
      pushLog("ERROR", error instanceof Error ? error.message : "Fallo eliminando Markdown.");
    } finally {
      setBusy(false);
    }
  };

  const purgeOrphans = async () => {
    const confirmed = window.confirm(
      "Limpiar chunks huerfanos del usuario actual?\n\nEsto elimina fragmentos Markdown que ya no tienen documento padre.",
    );
    if (!confirmed) return;

    try {
      setBusy(true);
      const response = (await markdownBridgeClient.purgeOrphans(userId)) as {
        result?: { purgedKeys?: string[]; collapsedCount?: number; indexRemovedCount?: number; warnings?: string[] };
      };
      const purgedKeys = response.result?.purgedKeys ?? [];
      removeKeysFromGraph(purgedKeys);
      pushLog("OK", `Chunks huerfanos limpiados: ${purgedKeys.length}`);
      pushLog("INFO", `Colapsados: ${response.result?.collapsedCount ?? 0} | Indice: ${response.result?.indexRemovedCount ?? 0}`);
    } catch (error) {
      pushLog("ERROR", error instanceof Error ? error.message : "Fallo limpiando chunks huerfanos.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="border border-cyan-900/50 bg-gray-950/70 p-4 font-mono text-xs text-white backdrop-blur">
      <div className="mb-3 border-b border-cyan-950 pb-2">
        <div className="text-[10px] font-bold tracking-widest text-cyan-300">T-BIT MARKDOWN BRIDGE</div>
        <div className="mt-1 text-gray-500">Importa notas .md como memorias enlazadas.</div>
      </div>

      <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500">Usuario</label>
      <input
        value={userId}
        onChange={(event) => setUserId(event.target.value)}
        className="mb-3 w-full border border-gray-800 bg-gray-950 px-2 py-2 text-cyan-200 outline-none focus:border-cyan-500"
      />

      <label className="mb-2 block cursor-pointer border border-dashed border-cyan-800/70 bg-black/30 p-4 text-center text-cyan-300 hover:border-cyan-400">
        Seleccionar archivo Markdown
        <input
          type="file"
          accept=".md,.markdown,text/markdown,text/plain"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void loadFile(file);
          }}
        />
      </label>

      <div className="mb-3 border border-gray-900 bg-black/30 p-2 text-gray-400">
        {fileName || "Ningun archivo seleccionado"}
      </div>

      <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500">
        Clave del documento
      </label>
      <input
        value={documentKey}
        onChange={(event) => setDocumentKey(event.target.value)}
        className="mb-3 w-full border border-gray-800 bg-gray-950 px-2 py-2 text-cyan-100 outline-none focus:border-cyan-500"
        placeholder="Se completa al importar, o pega una clave Markdown::..."
      />

      <button
        onClick={importMarkdown}
        disabled={busy}
        className="w-full border border-cyan-700/50 bg-cyan-950/40 py-2 font-bold text-cyan-300 hover:bg-cyan-500 hover:text-black disabled:opacity-50"
      >
        {busy ? "IMPORTANDO..." : "IMPORTAR AL VACIO"}
      </button>

      <div className="my-3 border-t border-cyan-950" />

      <button
        onClick={loadDocuments}
        disabled={busy}
        className="w-full border border-purple-800/60 bg-purple-950/30 py-2 font-bold text-purple-300 hover:bg-purple-500 hover:text-black disabled:opacity-50"
      >
        CARGAR DOCUMENTOS EXISTENTES
      </button>

      <label className="mb-1 mt-3 block text-[10px] font-bold uppercase tracking-wider text-gray-500">
        Documento a eliminar
      </label>
      <select
        value={selectedDocumentKey}
        onChange={(event) => {
          setSelectedDocumentKey(event.target.value);
          setDocumentKey(event.target.value);
        }}
        className="mb-2 w-full border border-gray-800 bg-gray-950 px-2 py-2 text-cyan-100 outline-none focus:border-purple-500"
      >
        <option value="">Selecciona un documento...</option>
        {documents.map((document) => (
          <option key={document.key} value={document.key}>
            {document.filename || document.title} {document.chunked ? `(${document.chunkCount} chunks)` : ""}
          </option>
        ))}
      </select>

      <button
        onClick={deleteMarkdown}
        disabled={busy || !(selectedDocumentKey || documentKey).trim()}
        className="mt-2 w-full border border-red-700/70 bg-red-950/30 py-2 font-bold text-red-300 hover:bg-red-600 hover:text-white disabled:opacity-50"
      >
        ELIMINAR DOCUMENTO DEL VACIO
      </button>

      <button
        onClick={purgeOrphans}
        disabled={busy}
        className="mt-2 w-full border border-amber-700/70 bg-amber-950/20 py-2 font-bold text-amber-300 hover:bg-amber-500 hover:text-black disabled:opacity-50"
      >
        LIMPIAR CHUNKS HUERFANOS
      </button>

      <div className="mt-3 max-h-28 overflow-y-auto border border-gray-900 bg-black/30 p-2">
        {logs.length === 0 ? (
          <div className="text-gray-600">Esperando archivo Markdown.</div>
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

export default MarkdownImportPanel;
