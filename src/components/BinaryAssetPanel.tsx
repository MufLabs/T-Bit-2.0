import { useState } from "react";
import { Download, FileArchive, UploadCloud } from "lucide-react";
import { binaryAssetClient, BinaryAssetImportResult } from "../binaryAssetClient";

type BinaryLog = {
  level: "OK" | "ERROR" | "INFO";
  text: string;
};

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("No se pudo leer el archivo."));
    reader.onload = () => {
      const value = String(reader.result || "");
      const [, base64 = ""] = value.split(",");
      resolve(base64);
    };
    reader.readAsDataURL(file);
  });
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mimeType || "application/octet-stream" });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function BinaryAssetPanel() {
  const [userId, setUserId] = useState("Mauricio");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [assetKey, setAssetKey] = useState("");
  const [lastImport, setLastImport] = useState<BinaryAssetImportResult | null>(null);
  const [logs, setLogs] = useState<BinaryLog[]>([]);
  const [busy, setBusy] = useState(false);

  const pushLog = (level: BinaryLog["level"], text: string) => {
    setLogs((current) => [...current.slice(-4), { level, text }]);
  };

  const importFile = async () => {
    if (!selectedFile) {
      pushLog("ERROR", "Selecciona un archivo primero.");
      return;
    }

    try {
      setBusy(true);
      const contentBase64 = await fileToBase64(selectedFile);
      const response = await binaryAssetClient.importAsset({
        userId,
        filename: selectedFile.name,
        mimeType: selectedFile.type || "application/octet-stream",
        contentBase64,
      });
      setLastImport(response.result);
      setAssetKey(response.result.key);
      pushLog("OK", `Archivo importado: ${response.result.filename}`);
      pushLog("INFO", `Chunks: ${response.result.chunkCount} | Bytes: ${formatBytes(response.result.originalBytes)}`);
      pushLog("INFO", `SHA-256: ${response.result.sha256.slice(0, 16)}...${response.result.sha256.slice(-8)}`);
    } catch (error) {
      pushLog("ERROR", error instanceof Error ? error.message : "Fallo importando archivo.");
    } finally {
      setBusy(false);
    }
  };

  const reconstructAndDownload = async () => {
    const key = assetKey.trim();
    if (!key) {
      pushLog("ERROR", "Pega o importa una clave de asset primero.");
      return;
    }

    try {
      setBusy(true);
      const response = await binaryAssetClient.reconstruct(key);
      const { contentBase64, filename, mimeType, sha256, originalBytes } = response.result;
      const blob = base64ToBlob(contentBase64, mimeType);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      pushLog("OK", `Reconstruido y descargado: ${filename}`);
      pushLog("INFO", `Verificado: ${formatBytes(originalBytes)} | ${sha256.slice(0, 16)}...`);
    } catch (error) {
      pushLog("ERROR", error instanceof Error ? error.message : "Fallo reconstruyendo archivo.");
    } finally {
      setBusy(false);
    }
  };

  const isPassiveExecutable = /\.(exe|msi|bat|cmd|ps1)$/i.test(selectedFile?.name ?? lastImport?.filename ?? assetKey);

  return (
    <section className="border border-emerald-900/50 bg-gray-950/70 p-4 font-mono text-xs text-white backdrop-blur">
      <div className="mb-3 border-b border-emerald-950 pb-2">
        <div className="flex items-center gap-2 text-[10px] font-bold tracking-widest text-emerald-300">
          <FileArchive size={14} />
          T-BIT BINARY ASSET BRIDGE
        </div>
        <div className="mt-1 text-gray-500">Importa imagenes, audio, PDF, ZIP, ejecutables pasivos y archivos genericos.</div>
      </div>

      <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500">Usuario</label>
      <input
        value={userId}
        onChange={(event) => setUserId(event.target.value)}
        className="mb-3 w-full border border-gray-800 bg-gray-950 px-2 py-2 text-emerald-100 outline-none focus:border-emerald-500"
      />

      <label className="mb-2 flex cursor-pointer items-center justify-center gap-2 border border-dashed border-emerald-800/70 bg-black/30 p-4 text-center text-emerald-300 hover:border-emerald-400">
        <UploadCloud size={16} />
        Seleccionar cualquier archivo
        <input
          type="file"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0] ?? null;
            setSelectedFile(file);
            if (file) {
              pushLog("INFO", `Archivo cargado: ${file.name} | ${formatBytes(file.size)}`);
            }
          }}
        />
      </label>

      <div className="mb-3 border border-gray-900 bg-black/30 p-2 text-gray-400">
        {selectedFile ? `${selectedFile.name} | ${formatBytes(selectedFile.size)}` : "Ningun archivo seleccionado"}
      </div>

      {isPassiveExecutable && (
        <div className="mb-3 border border-amber-800/70 bg-amber-950/20 p-2 text-amber-200">
          Ejecutable detectado: T-BIT lo almacena y reconstruye como archivo pasivo. No se ejecuta dentro de la app.
        </div>
      )}

      <button
        onClick={importFile}
        disabled={busy || !selectedFile}
        className="w-full border border-emerald-700/60 bg-emerald-950/30 py-2 font-bold text-emerald-300 hover:bg-emerald-500 hover:text-black disabled:opacity-50"
      >
        {busy ? "PROCESANDO..." : "IMPORTAR ARCHIVO AL VACIO"}
      </button>

      <label className="mb-1 mt-3 block text-[10px] font-bold uppercase tracking-wider text-gray-500">Clave del asset</label>
      <input
        value={assetKey}
        onChange={(event) => setAssetKey(event.target.value)}
        className="mb-2 w-full border border-gray-800 bg-gray-950 px-2 py-2 text-emerald-100 outline-none focus:border-emerald-500"
        placeholder="Asset::Usuario::Archivo o clave importada"
      />

      <button
        onClick={reconstructAndDownload}
        disabled={busy || !assetKey.trim()}
        className="flex w-full items-center justify-center gap-2 border border-cyan-700/60 bg-cyan-950/30 py-2 font-bold text-cyan-300 hover:bg-cyan-500 hover:text-black disabled:opacity-50"
      >
        <Download size={14} />
        RECONSTRUIR Y DESCARGAR
      </button>

      <div className="mt-3 max-h-28 overflow-y-auto border border-gray-900 bg-black/30 p-2">
        {logs.length === 0 ? (
          <div className="text-gray-600">Esperando archivo binario.</div>
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

export default BinaryAssetPanel;
