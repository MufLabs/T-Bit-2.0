import { useState } from "react";
import { queryIndexClient, QueryIndexSearchResult } from "../queryIndexClient";
import { useTBitStore } from "../store/useTBitStore";

type QueryLog = {
  level: "OK" | "ERROR" | "INFO";
  text: string;
};

export function QueryIndexPanel() {
  const setSelectedMemoryNodeKey = useTBitStore((state) => state.setSelectedMemoryNodeKey);
  const [userId, setUserId] = useState("Mauricio");
  const [query, setQuery] = useState("");
  const [source, setSource] = useState("");
  const [tag, setTag] = useState("");
  const [attribute, setAttribute] = useState("");
  const [value, setValue] = useState("");
  const [results, setResults] = useState<QueryIndexSearchResult[]>([]);
  const [stats, setStats] = useState<string>("Indice no consultado");
  const [logs, setLogs] = useState<QueryLog[]>([]);
  const [busy, setBusy] = useState(false);

  const pushLog = (level: QueryLog["level"], text: string) => {
    setLogs((current) => [...current.slice(-3), { level, text }]);
  };

  const rebuild = async () => {
    try {
      setBusy(true);
      const response = (await queryIndexClient.rebuild()) as {
        index?: { totalRecords: number; tokens: number; documents: number; attributes: number };
      };
      const index = response.index;
      setStats(`Registros: ${index?.totalRecords ?? 0} | Tokens: ${index?.tokens ?? 0} | Docs: ${index?.documents ?? 0}`);
      pushLog("OK", "Query Index reconstruido.");
    } catch (error) {
      pushLog("ERROR", error instanceof Error ? error.message : "Fallo reconstruyendo indice.");
    } finally {
      setBusy(false);
    }
  };

  const search = async () => {
    try {
      setBusy(true);
      const tags = tag
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      const response = (await queryIndexClient.search({
        userId: userId.trim() || undefined,
        query: query.trim() || undefined,
        source: source.trim() || undefined,
        tags: tags.length ? tags : undefined,
        attribute: attribute.trim() || undefined,
        value: value.trim() || undefined,
        limit: 12,
      })) as { index?: { totalRecords: number; builtAt: string }; results?: QueryIndexSearchResult[] };

      setResults(response.results ?? []);
      setStats(`Resultados: ${response.results?.length ?? 0} | Registros indexados: ${response.index?.totalRecords ?? 0}`);
      pushLog("OK", "Busqueda completada.");
    } catch (error) {
      pushLog("ERROR", error instanceof Error ? error.message : "Fallo buscando en indice.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="border border-emerald-900/50 bg-gray-950/70 p-4 font-mono text-xs text-white backdrop-blur">
      <div className="mb-3 border-b border-emerald-950 pb-2">
        <div className="text-[10px] font-bold tracking-widest text-emerald-300">T-BIT QUERY INDEX</div>
        <div className="mt-1 text-gray-500">Busqueda rapida por texto, tags, tipo, usuario y atributos.</div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500">Usuario</span>
          <input
            value={userId}
            onChange={(event) => setUserId(event.target.value)}
            className="w-full border border-gray-800 bg-gray-950 px-2 py-2 text-emerald-100 outline-none focus:border-emerald-500"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500">Tipo</span>
          <select
            value={source}
            onChange={(event) => setSource(event.target.value)}
            className="w-full border border-gray-800 bg-gray-950 px-2 py-2 text-emerald-100 outline-none focus:border-emerald-500"
          >
            <option value="">Todos</option>
            <option value="markdown">Markdown</option>
            <option value="markdown-chunk">Chunk</option>
            <option value="ai">IA</option>
            <option value="demo">Demo</option>
          </select>
        </label>
      </div>

      <label className="mt-2 block">
        <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500">Buscar</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void search();
          }}
          className="w-full border border-gray-800 bg-gray-950 px-2 py-2 text-cyan-100 outline-none focus:border-cyan-500"
          placeholder="Petius, cumpleaños, tema visual..."
        />
      </label>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <input
          value={tag}
          onChange={(event) => setTag(event.target.value)}
          className="border border-gray-800 bg-gray-950 px-2 py-2 text-purple-100 outline-none focus:border-purple-500"
          placeholder="tag"
        />
        <input
          value={attribute}
          onChange={(event) => setAttribute(event.target.value)}
          className="border border-gray-800 bg-gray-950 px-2 py-2 text-purple-100 outline-none focus:border-purple-500"
          placeholder="atributo JSON"
        />
      </div>

      <input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        className="mt-2 w-full border border-gray-800 bg-gray-950 px-2 py-2 text-purple-100 outline-none focus:border-purple-500"
        placeholder="valor opcional del atributo/texto"
      />

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          onClick={search}
          disabled={busy}
          className="border border-emerald-700/60 bg-emerald-950/30 py-2 font-bold text-emerald-300 hover:bg-emerald-500 hover:text-black disabled:opacity-50"
        >
          BUSCAR
        </button>
        <button
          onClick={rebuild}
          disabled={busy}
          className="border border-cyan-700/60 bg-cyan-950/30 py-2 font-bold text-cyan-300 hover:bg-cyan-500 hover:text-black disabled:opacity-50"
        >
          REINDEXAR
        </button>
      </div>

      <div className="mt-3 border border-gray-900 bg-black/30 p-2 text-gray-400">{stats}</div>

      <div className="mt-2 max-h-52 space-y-2 overflow-y-auto">
        {results.map((result) => (
          <button
            key={result.key}
            onClick={() => setSelectedMemoryNodeKey(result.key)}
            className="w-full border border-gray-900 bg-black/30 p-2 text-left hover:border-emerald-500"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate font-bold text-emerald-200">{result.filename || result.title}</span>
              <span className="text-[10px] uppercase text-gray-500">{result.source}</span>
            </div>
            <div className="mt-1 truncate text-[10px] text-gray-500">{result.key}</div>
            <div className="mt-1 line-clamp-2 text-gray-400">{result.textPreview || "Sin preview"}</div>
          </button>
        ))}
      </div>

      <div className="mt-3 max-h-20 overflow-y-auto border border-gray-900 bg-black/30 p-2">
        {logs.length === 0 ? (
          <div className="text-gray-600">Query Index listo.</div>
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

export default QueryIndexPanel;
