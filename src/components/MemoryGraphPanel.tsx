import { useState } from "react";
import { markdownBridgeClient } from "../markdownBridgeClient";
import { memoryCoreClient } from "../memoryCoreClient";
import { useTBitStore } from "../store/useTBitStore";

function readActiveUserId(): string {
  try {
    const profile = JSON.parse(localStorage.getItem("tbit_user_profile") ?? "null") as { userId?: string; displayName?: string } | null;
    return profile?.userId?.trim() || profile?.displayName?.trim() || "";
  } catch {
    return "";
  }
}

export function MemoryGraphPanel() {
  const [userId, setUserId] = useState(readActiveUserId);
  const [documentFilter, setDocumentFilter] = useState("");
  const [status, setStatus] = useState("Grafo no cargado");
  const {
    memoryGraph,
    selectedMemoryNodeKey,
    showMemoryAntiVits,
    showMemoryLinks,
    setMemoryGraph,
    setSelectedMemoryNodeKey,
    setShowMemoryAntiVits,
    setShowMemoryLinks,
  } = useTBitStore();

  function getDocumentRootKey(key: string): string {
    return key.replace(/::chunk_\d+$/i, "");
  }

  function removeKeysFromGraph(keys: string[]) {
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
  }

  function normalizeSearch(value: string) {
    return value
      .normalize("NFC")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
  }

  function filterGraphByDocument(graph: NonNullable<typeof memoryGraph>, query: string) {
    const normalizedQuery = normalizeSearch(query);

    if (!normalizedQuery) {
      return graph;
    }

    const rootKeys = graph.nodes
      .filter((node) => {
        const normalizedKey = normalizeSearch(node.key);
        return normalizedKey.includes(normalizedQuery);
      })
      .map((node) => node.key);

    if (rootKeys.length === 0) {
      return { ...graph, nodes: [], links: [], tags: {} };
    }

    const visibleKeys = new Set(rootKeys);
    let changed = true;

    while (changed) {
      changed = false;
      for (const link of graph.links) {
        if (visibleKeys.has(link.sourceKey) && !visibleKeys.has(link.targetKey)) {
          visibleKeys.add(link.targetKey);
          changed = true;
        }
      }
    }

    const nodes = graph.nodes.filter((node) => visibleKeys.has(node.key));
    const links = graph.links.filter((link) => visibleKeys.has(link.sourceKey) && visibleKeys.has(link.targetKey));
    const tags = Object.fromEntries(
      Object.entries(graph.tags)
        .map(([tag, keys]) => [tag, keys.filter((key) => visibleKeys.has(key))])
        .filter(([, keys]) => keys.length > 0),
    );

    return { ...graph, nodes, links, tags };
  }

  const loadGraph = async () => {
    try {
      setStatus("Cargando grafo...");
      const response = (await memoryCoreClient.graph(userId.trim() || undefined)) as {
        graph?: typeof memoryGraph;
      };
      const graph = response.graph ? filterGraphByDocument(response.graph, documentFilter) : null;
      setMemoryGraph(graph);
      setStatus(
        `Nodos: ${graph?.nodes.length ?? 0} | Enlaces: ${graph?.links.length ?? 0}`,
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Error cargando grafo");
    }
  };

  const deleteSelectedDocument = async () => {
    if (!selectedMemoryNodeKey) {
      setStatus("Selecciona primero un documento o chunk en el mapa.");
      return;
    }

    const rootKey = getDocumentRootKey(selectedMemoryNodeKey);
    const selectedNode = memoryGraph?.nodes.find((node) => node.key === selectedMemoryNodeKey);
    const rootNode = memoryGraph?.nodes.find((node) => node.key === rootKey);

    if (!selectedNode || !rootNode || rootNode.source !== "markdown") {
      setStatus("El nodo seleccionado no pertenece a un documento Markdown eliminable.");
      return;
    }

    const label = rootKey.split("::").slice(-1)[0] || rootKey;
    const firstConfirmation = window.confirm(
      `Eliminar del vacio el documento seleccionado?\n\n${label}\n\nSe eliminaran tambien sus chunks y enlaces.`,
    );
    if (!firstConfirmation) return;

    const secondConfirmation = window.confirm(`Confirmacion final: eliminar definitivamente "${label}"?`);
    if (!secondConfirmation) return;

    try {
      setStatus("Eliminando documento seleccionado...");
      const response = (await markdownBridgeClient.delete(rootKey)) as {
        result?: { deletedKeys?: string[]; collapsedCount?: number; indexRemovedCount?: number };
      };
      const deletedKeys = response.result?.deletedKeys ?? [];
      removeKeysFromGraph(deletedKeys);
      setSelectedMemoryNodeKey(null);
      setStatus(
        `Eliminado desde mapa: ${deletedKeys.length} claves | Colapsadas: ${response.result?.collapsedCount ?? 0}`,
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Error eliminando seleccion del mapa.");
    }
  };

  return (
    <section className="border border-purple-900/50 bg-gray-950/70 p-4 font-mono text-xs text-white backdrop-blur">
      <div className="mb-3 flex items-center justify-between border-b border-purple-950 pb-2">
        <div>
          <div className="text-[10px] font-bold tracking-widest text-purple-300">T-BIT MEMORY GRAPH</div>
          <div className="mt-1 text-gray-500">Enlaces cuanticos y backlinks.</div>
        </div>
        <button
          onClick={() => setShowMemoryLinks(!showMemoryLinks)}
          className="border border-purple-800/60 px-2 py-1 text-[10px] font-bold text-purple-300 hover:border-cyan-500 hover:text-cyan-300"
        >
          {showMemoryLinks ? "ON" : "OFF"}
        </button>
      </div>

      <button
        onClick={() => setShowMemoryAntiVits(!showMemoryAntiVits)}
        className="mb-3 w-full border border-red-800/60 bg-red-950/20 px-2 py-1.5 text-[10px] font-bold text-red-300 hover:bg-red-600 hover:text-white"
      >
        {showMemoryAntiVits ? "OCULTAR ANTI-VITS MARKDOWN" : "MOSTRAR ANTI-VITS MARKDOWN"}
      </button>

      <div className="mb-3 border border-gray-900 bg-black/30 p-2">
        <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-gray-500">Seleccion en mapa</div>
        <div className="truncate text-cyan-200">{selectedMemoryNodeKey || "Haz click sobre un nodo Markdown/chunk."}</div>
        <button
          onClick={deleteSelectedDocument}
          disabled={!selectedMemoryNodeKey}
          className="mt-2 w-full border border-red-800/70 bg-red-950/30 px-2 py-1.5 text-[10px] font-bold text-red-300 hover:bg-red-600 hover:text-white disabled:opacity-50"
        >
          ELIMINAR SELECCION DEL MAPA
        </button>
      </div>

      <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500">Filtro usuario</label>
      <input
        value={userId}
        onChange={(event) => setUserId(event.target.value)}
        className="mb-2 w-full border border-gray-800 bg-gray-950 px-2 py-2 text-purple-200 outline-none focus:border-purple-500"
        placeholder="andres / usuario_local / vacio"
      />
      <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500">
        Filtro documento / clave
      </label>
      <input
        value={documentFilter}
        onChange={(event) => setDocumentFilter(event.target.value)}
        className="mb-2 w-full border border-gray-800 bg-gray-950 px-2 py-2 text-cyan-100 outline-none focus:border-cyan-500"
        placeholder="Petius Pet Matching System / Directorio / chunk"
      />
      <button
        onClick={loadGraph}
        className="w-full border border-purple-800/70 bg-purple-950/40 py-2 font-bold text-purple-300 hover:bg-purple-500 hover:text-black"
      >
        CARGAR GRAFO
      </button>
      <div className="mt-3 border border-gray-900 bg-black/30 p-2 text-gray-400">{status}</div>
      {memoryGraph && (
        <div className="mt-2 text-[10px] text-gray-500">
          Tags: {Object.keys(memoryGraph.tags).slice(0, 6).join(", ") || "sin tags"}
        </div>
      )}
    </section>
  );
}

export default MemoryGraphPanel;
