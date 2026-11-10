import { FormEvent, lazy, type PointerEvent as ReactPointerEvent, Suspense, type WheelEvent as ReactWheelEvent, useEffect, useMemo, useRef, useState } from "react";
import { TBitNetworkPanel } from "./components/TBitNetworkPanel";
import { AssetManagerPanel } from "./components/AssetManagerPanel";
import { BinaryAssetPanel } from "./components/BinaryAssetPanel";
import { ContainerHealthPanel } from "./components/ContainerHealthPanel";
import { AgentRuntimePanel } from "./components/AgentRuntimePanel";
import { EncryptionKeyPanel } from "./components/EncryptionKeyPanel";
import { AiPermissionsPanel } from "./components/AiPermissionsPanel";
import { MarkdownImportPanel } from "./components/MarkdownImportPanel";
import { MemoryGraphPanel } from "./components/MemoryGraphPanel";
import { QueryIndexPanel } from "./components/QueryIndexPanel";
import { GuardianObserverPanel } from "./components/GuardianObserverPanel";
import {
  Activity,
  Bot,
  Brain,
  ChevronLeft,
  ChevronRight,
  Code2,
  Database,
  FileText,
  Folder,
  Goal,
  HardDrive,
  KanbanSquare,
  KeyRound,
  Languages,
  Link2,
  Map as MapIcon,
  Notebook,
  Palette,
  Plug,
  Search,
  Settings,
  Shield,
  SlidersHorizontal,
  Sparkles,
  UploadCloud,
  Wand2,
  X,
} from "lucide-react";
import { normalizeTBitKey, normalizeUnicodeText } from "./textEncoding";
import {
  DATA_COLOR,
  type FocusTarget,
  invertVector3,
  isChunkKey,
  isFiniteVector3,
  type QueryLine,
  type SecondBrainPreviewLink,
  type SecondBrainPreviewNode,
  type Vit,
} from "./quantum/quantumTypes";
import { construirMemoriaSemantica, inferirClaveConsulta } from "./temporalSemantics";
import {
  buildEinsteinEnergyMassEquation,
  evaluateEquation,
  extractNumericVariable,
  inferEquationKey
} from "./computableMemory";
import { queryIndexClient } from "./queryIndexClient";
import { documentQaClient } from "./documentQaClient";
import { containerHealthClient, TBitSpaceInventoryItem } from "./containerHealthClient";
import { memoryCoreClient } from "./memoryCoreClient";
import { markdownBridgeClient } from "./markdownBridgeClient";
import { assetManagerClient } from "./assetManagerClient";
import { semanticIndexClient, SemanticSearchResult } from "./semanticIndexClient";
import { universalDocumentClient } from "./universalDocumentClient";
import { TBitAiProviderConfig, TBitAiProviderDescriptor, TBitAiProviderInfo, TBitChatClientResponse, tbitChatClient } from "./tbitChatClient";
import { useTBitStore } from "./store/useTBitStore";

type LogEntry = {
  id: string;
  message: string;
};

type RecoveredData = {
  clave: string;
  dato: string;
  integridadValida: boolean;
};

type AttributeQueryResult = {
  attribute: string;
  value?: string;
  error?: string;
};

type InterfaceMode = "raw" | "database" | "wizard";

type AiMessage = {
  id: string;
  sender: "T-User" | "Oraculo";
  text: string;
  /** Tanda 3 — marca los avisos del eslabon determinista para renderizarlos como banner distintivo, no como respuesta de IA. */
  kind?: "deterministic-notice";
};
type UniverseMode = "user" | "ai";

type QVaultLayerFilters = {
  documents: boolean;
  memories: boolean;
  chats: boolean;
  live: boolean;
  links: boolean;
  anti: boolean;
  labels: boolean;
};

type QVaultMapMode = "scene3d" | "map2d";

type ZenSection = "chat" | "documents" | "assets" | "map" | "ai" | "security" | "health" | "settings";
type SettingsModalTab = "general" | "editor" | "files" | "appearance" | "ai" | "storage" | "notebooks" | "permissions" | "security" | "keys" | "advanced";

type TBitUserProfile = {
  displayName: string;
  userId: string;
  email?: string;
  passwordHash?: string;
  passwordSalt?: string;
  authVersion?: "local-pbkdf2-sha256-v1";
  vaultRoot?: string;
  containerSizeMb: number;
  createdAt: string;
  updatedAt?: string;
};

type SpacePrepareMode = "keep" | "overwrite";

type AiProviderConfigDraft = {
  apiKey: string;
  model: string;
  baseUrl: string;
};

type AiProviderConfigMap = Record<string, AiProviderConfigDraft>;

type CustomAiProviderDraft = {
  label: string;
  model: string;
  baseUrl: string;
  apiKey: string;
  requiresApiKey: boolean;
};

type AiAgentInstance = {
  id: string;
  name: string;
  providerId: string;
  role: string;
  notebook: string;
  enabled: boolean;
};

type AiAgentRuntime = {
  id: string;
  name: string;
  provider: TBitAiProviderDescriptor;
  draft: AiProviderConfigDraft;
  role?: string;
  notebook?: string;
  isInstance: boolean;
  configured: boolean;
};

type MultiAiResult = {
  providerId: string;
  providerLabel: string;
  model: string;
  ok: boolean;
  text: string;
  error?: string;
  response?: TBitChatClientResponse;
};

type MultiAiMode = "fast" | "deliberative" | "critical";

type WizardAttribute = {
  id: string;
  clave: string;
  valor: string;
};

const INITIAL_LOGS: LogEntry[] = [
  { id: "boot-1", message: "BOOT :: T-BIT CORE v1.1" },
  { id: "boot-2", message: "SINGULARIDAD :: Algoritmo Maestro fijado en [0, 0, 0]" },
  { id: "boot-3", message: "CANAL :: Esperando direccion matematica" }
];

const API_URL = "http://localhost:3000/api";
const AI_PROVIDER_CONFIGS_STORAGE_KEY = "tbit_ai_provider_configs";
const AI_PROVIDER_SELECTED_STORAGE_KEY = "tbit_ai_provider_selected";
const AI_CUSTOM_PROVIDERS_STORAGE_KEY = "tbit_ai_custom_providers";
const AI_AGENT_INSTANCES_STORAGE_KEY = "tbit_ai_agent_instances";
const ACTIVE_NOTEBOOK_STORAGE_KEY = "tbit_active_notebook";
const MULTI_AI_MODE_STORAGE_KEY = "tbit_multi_ai_mode";
const USER_PROFILE_STORAGE_KEY = "tbit_user_profile";
const USER_SETTINGS_STORAGE_KEY = "tbit_user_settings";
const MIN_VAULT_SIZE_MB = 256;
const MAX_VAULT_SIZE_MB = 51200;

function formatUserFacingAiError(error: unknown, agentName = "la IA seleccionada"): string {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const cleaned = raw
    .replace(/key=[^&\s"]+/gi, "key=***")
    .replace(/Bearer\s+[^\s"]+/gi, "Bearer ***")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 420);
  const lower = cleaned.toLowerCase();
  const detail = cleaned ? ` Detalle: ${cleaned}` : "";

  if (lower.includes("503") || lower.includes("unavailable") || lower.includes("high demand")) {
    return `${agentName} esta saturada temporalmente. Intenta de nuevo en unos minutos o cambia a otra IA disponible. No se perdió tu conversación.${detail}`;
  }

  if (lower.includes("429") || lower.includes("rate limit") || lower.includes("quota")) {
    return `${agentName} limito la solicitud por cuota o demasiadas peticiones. Espera un momento o usa otro proveedor configurado.${detail}`;
  }

  if (lower.includes("401") || lower.includes("403") || lower.includes("api key") || lower.includes("unauthorized")) {
    return `La llave API de ${agentName} no fue aceptada. Revisa la configuracion del proveedor en Ajustes > Proveedores IA.${detail}`;
  }

  if (lower.includes("404") || lower.includes("not found") || lower.includes("not_found")) {
    return `${agentName} no reconoce el modelo o la URL configurada. Para Gemini usa modelo gemini-2.5-flash y base URL https://generativelanguage.googleapis.com/v1beta. Para Ollama usa el nombre exacto de ollama list y base URL http://localhost:11434/v1.${detail}`;
  }

  if (lower.includes("400") || lower.includes("invalid_argument") || lower.includes("invalid argument")) {
    return `${agentName} rechazo la solicitud por configuracion o formato. Verifica modelo, base URL y proveedor seleccionado.${detail}`;
  }

  if (lower.includes("timeout")) {
    return `${agentName} no respondio a tiempo. Si es Ollama, el modelo puede estar cargando; prueba de nuevo o usa un modelo mas pequeno.${detail}`;
  }

  if (lower.includes("fetch failed") || lower.includes("failed to fetch") || lower.includes("network")) {
    return `No pude conectar con ${agentName}. Verifica que la URL/base local este activa o cambia a otra IA disponible.${detail}`;
  }

  return `No pude completar la solicitud con ${agentName}. Revisa la configuracion o intenta con otro modelo.${detail}`;
}

function isChatMemoryKey(key: string, source?: string, tags?: string[]): boolean {
  const normalizedKey = key.toLowerCase();
  const normalizedTags = (tags ?? []).map((tag) => tag.toLowerCase());
  return source === "chat-autosave" || normalizedTags.includes("chat") || normalizedKey.includes("::bitacora::");
}

const DEFAULT_USER_SETTINGS = {
  language: "es",
  autoSaveMemory: true,
  focusNewTabs: true,
  livePreview: true,
  showGraphHints: true,
  compactSidebar: false,
  spellcheck: true,
  autoPairMarkdown: true,
  confirmDeletes: true,
  multiAiConsensus: false,
  autoAnalyzeCode: true,
  showCodeGraphRelations: false,
};

function readStoredUserSettings(): typeof DEFAULT_USER_SETTINGS {
  try {
    const raw = window.localStorage.getItem(USER_SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_USER_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<typeof DEFAULT_USER_SETTINGS>;
    return { ...DEFAULT_USER_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_USER_SETTINGS;
  }
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function createLocalSalt(bytes = 16): string {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return bytesToHex(buffer);
}

async function hashLocalPassword(password: string, salt: string): Promise<string> {
  if (!crypto.subtle) {
    throw new Error("Hash local no disponible en este navegador.");
  }
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: encoder.encode(salt),
      iterations: 120000,
      hash: "SHA-256",
    },
    keyMaterial,
    256,
  );
  return bytesToHex(new Uint8Array(derivedBits));
}

const FALLBACK_AI_PROVIDER_CATALOG: TBitAiProviderDescriptor[] = [
  { id: "deterministic", label: "T-BIT Local", mode: "deterministic", defaultModel: "local-rules", requiresApiKey: false, requiresBaseUrl: false, protocol: "deterministic" },
  { id: "openai", label: "OpenAI", mode: "remote", defaultModel: "gpt-4o-mini", defaultBaseUrl: "https://api.openai.com/v1", requiresApiKey: true, requiresBaseUrl: false, protocol: "openai-compatible" },
  { id: "gemini", label: "Gemini", mode: "remote", defaultModel: "gemini-2.5-flash", defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta", requiresApiKey: true, requiresBaseUrl: false, protocol: "native" },
  { id: "claude", label: "Claude", mode: "remote", defaultModel: "claude-3-5-haiku-latest", requiresApiKey: true, requiresBaseUrl: false, protocol: "native" },
  { id: "grok", label: "Grok / xAI", mode: "remote", defaultModel: "grok", requiresApiKey: true, requiresBaseUrl: true, protocol: "openai-compatible" },
  { id: "qwen", label: "Qwen", mode: "remote", defaultModel: "qwen", requiresApiKey: true, requiresBaseUrl: true, protocol: "openai-compatible" },
  { id: "hermes", label: "Hermes", mode: "local", defaultModel: "nous-hermes", defaultBaseUrl: "http://localhost:11434/v1", requiresApiKey: false, requiresBaseUrl: false, protocol: "openai-compatible" },
  { id: "ollama", label: "Ollama", mode: "local", defaultModel: "llama3.1", defaultBaseUrl: "http://localhost:11434/v1", requiresApiKey: false, requiresBaseUrl: false, protocol: "openai-compatible" },
  { id: "lmstudio", label: "LM Studio", mode: "local", defaultModel: "local-model", defaultBaseUrl: "http://localhost:1234/v1", requiresApiKey: false, requiresBaseUrl: false, protocol: "openai-compatible" },
  { id: "openai-compatible", label: "OpenAI-Compatible", mode: "remote", defaultModel: "model", requiresApiKey: true, requiresBaseUrl: true, protocol: "openai-compatible" },
];

function readStoredAiProviderConfigs(): AiProviderConfigMap {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(AI_PROVIDER_CONFIGS_STORAGE_KEY) ?? "{}") as AiProviderConfigMap;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function readStoredCustomAiProviders(): TBitAiProviderDescriptor[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(AI_CUSTOM_PROVIDERS_STORAGE_KEY) ?? "[]") as TBitAiProviderDescriptor[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((provider) => (
      typeof provider?.id === "string"
      && provider.id.startsWith("custom:")
      && typeof provider.label === "string"
      && provider.protocol === "openai-compatible"
    )).map((provider) => ({
      ...provider,
      runtimeId: "openai-compatible",
      custom: true,
      mode: provider.mode === "local" ? "local" : "remote",
      requiresBaseUrl: true,
    }));
  } catch {
    return [];
  }
}

function mergeAiProviderCatalog(base: TBitAiProviderDescriptor[], custom: TBitAiProviderDescriptor[]): TBitAiProviderDescriptor[] {
  const seen = new Set<string>();
  return [...custom, ...base].filter((provider) => {
    if (seen.has(provider.id)) return false;
    seen.add(provider.id);
    return true;
  });
}

function readStoredAiAgentInstances(): AiAgentInstance[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(AI_AGENT_INSTANCES_STORAGE_KEY) ?? "[]") as AiAgentInstance[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((agent) => (
      typeof agent?.id === "string" &&
      typeof agent?.name === "string" &&
      typeof agent?.providerId === "string" &&
      typeof agent?.role === "string"
    )).map((agent) => ({
      id: agent.id,
      name: agent.name,
      providerId: agent.providerId,
      role: agent.role,
      notebook: agent.notebook || "General",
      enabled: agent.enabled !== false,
    }));
  } catch {
    return [];
  }
}

function readStoredUserProfile(): TBitUserProfile | null {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(USER_PROFILE_STORAGE_KEY) ?? "null") as TBitUserProfile | null;
    if (!parsed || typeof parsed !== "object") return null;
    if (!parsed.displayName?.trim() || !parsed.userId?.trim()) return null;
    return {
      ...parsed,
      email: parsed.email ?? "",
    };
  } catch {
    return null;
  }
}

function buildDefaultUserProfile(): TBitUserProfile {
  return {
    displayName: "",
    userId: "",
    email: "",
    vaultRoot: "",
    containerSizeMb: 1024,
    createdAt: new Date().toISOString(),
  };
}

function hasCompleteLocalRegistration(profile: TBitUserProfile | null): boolean {
  return Boolean(
    profile?.displayName?.trim()
    && profile.userId?.trim()
    && profile.email?.trim()
    && profile.passwordHash
    && profile.passwordSalt,
  );
}

function normalizeUserScope(value: string): string {
  return normalizeTBitKey(value.trim() || "usuario_local") || "usuario_local";
}

function getDocumentRootKey(key: unknown): string {
  return String(key ?? "").replace(/::chunk_\d+$/i, "");
}

function humanizeTBitLabel(key: unknown): string {
  const rootKey = getDocumentRootKey(key);
  const lastSegment = rootKey.split("::").filter(Boolean).slice(-1)[0] || rootKey || "Documento";
  return lastSegment
    .replace(/\.(md|markdown|txt|json)$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim() || "Documento";
}

function isReadableDisplayLabel(value: unknown): value is string {
  const text = String(value ?? "").trim();
  if (!text) return false;
  const replacementCount = (text.match(/\uFFFD/g) ?? []).length;
  const controlCount = (text.match(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g) ?? []).length;
  return replacementCount === 0 && controlCount === 0;
}

function fileToBase64Payload(file: File, onProgress?: (percent: number) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("No se pudo leer el archivo seleccionado."));
    reader.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress?.(Math.min(35, Math.round((event.loaded / event.total) * 35)));
      }
    };
    reader.onload = () => {
      const value = String(reader.result ?? "");
      onProgress?.(40);
      resolve(value.includes(",") ? value.split(",").slice(1).join(",") : value);
    };
    reader.readAsDataURL(file);
  });
}

const LARGE_OMNI_FILE_WARNING_BYTES = 8 * 1024 * 1024;
const INLINE_SEMANTIC_FILE_LIMIT_BYTES = 2 * 1024 * 1024;

function hashPreviewKey(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function previewCoordinatesForKey(key: string): [number, number, number] {
  const a = hashPreviewKey(`${key}:x`);
  const b = hashPreviewKey(`${key}:y`);
  const c = hashPreviewKey(`${key}:z`);
  const radius = 7 + (a % 600) / 100;
  const theta = ((b % 6283) / 1000) % (Math.PI * 2);
  const phi = ((c % 3141) / 1000) % Math.PI;
  return [
    Number((Math.sin(phi) * Math.cos(theta) * radius).toFixed(3)),
    Number((Math.cos(phi) * radius * 0.72).toFixed(3)),
    Number((Math.sin(phi) * Math.sin(theta) * radius).toFixed(3)),
  ];
}

function isFileDiscoveryQuery(command: string): boolean {
  return /^(busca|buscar|consulta|consultar|encuentra|encontrar|lista|listar|muestra|mostrar|muéstrame|muestrame)\b/i.test(command)
    && /\b(archivo|archivos|documento|documentos|nota|notas|markdown|file|files|vault)\b/i.test(command);
}

function formatVector(vector: [number, number, number]): string {
  return `[${vector.map((value) => value.toFixed(3)).join(", ")}]`;
}

function SecondBrainPreviewScene({
  nodes,
  links,
  activeKeys,
  showAnti,
  showLabels,
  onSelectNode,
}: {
  nodes: SecondBrainPreviewNode[];
  links: SecondBrainPreviewLink[];
  activeKeys: Set<string>;
  showAnti: boolean;
  showLabels: boolean;
  onSelectNode: (node: SecondBrainPreviewNode) => void;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 });

  const projected = useMemo(() => {
    const safeNodes = nodes.filter((node) => isFiniteVector3(node.position) && isFiniteVector3(node.antiPosition));
    const points = safeNodes.flatMap((node) => [node.position, node.antiPosition]);
    const xs = points.map((point) => point[0]);
    const zs = points.map((point) => point[2]);
    const minX = Math.min(...xs, -1);
    const maxX = Math.max(...xs, 1);
    const minZ = Math.min(...zs, -1);
    const maxZ = Math.max(...zs, 1);
    const spanX = Math.max(maxX - minX, 1);
    const spanZ = Math.max(maxZ - minZ, 1);

    const project = (position: [number, number, number]) => ({
      x: 60 + ((position[0] - minX) / spanX) * 880,
      y: 54 + ((position[2] - minZ) / spanZ) * 392,
    });

    return { project, safeNodes };
  }, [nodes]);

  const setZoom = (nextScale: number, anchor = { x: 500, y: 250 }) => {
    setView((current) => {
      const scale = Math.min(Math.max(nextScale, 0.65), 4);
      const ratio = scale / current.scale;
      return {
        scale,
        x: anchor.x - (anchor.x - current.x) * ratio,
        y: anchor.y - (anchor.y - current.y) * ratio,
      };
    });
  };

  const handleWheel = (event: ReactWheelEvent<SVGSVGElement>) => {
    event.preventDefault();
    const bounds = svgRef.current?.getBoundingClientRect();
    if (!bounds) return;

    const anchor = {
      x: ((event.clientX - bounds.left) / bounds.width) * 1000,
      y: ((event.clientY - bounds.top) / bounds.height) * 500,
    };
    setView((current) => {
      const scale = Math.min(Math.max(current.scale * (event.deltaY < 0 ? 1.12 : 0.88), 0.65), 4);
      const ratio = scale / current.scale;
      return {
        scale,
        x: anchor.x - (anchor.x - current.x) * ratio,
        y: anchor.y - (anchor.y - current.y) * ratio,
      };
    });
  };

  const handleDragStart = (event: ReactPointerEvent<SVGRectElement>) => {
    dragRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      originX: view.x,
      originY: view.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleDragMove = (event: ReactPointerEvent<SVGRectElement>) => {
    const drag = dragRef.current;
    const bounds = svgRef.current?.getBoundingClientRect();
    if (!drag || !bounds || drag.pointerId !== event.pointerId) return;

    setView((current) => ({
      ...current,
      x: drag.originX + ((event.clientX - drag.startClientX) / bounds.width) * 1000,
      y: drag.originY + ((event.clientY - drag.startClientY) / bounds.height) * 500,
    }));
  };

  const handleDragEnd = (event: ReactPointerEvent<SVGRectElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
    }
  };

  return (
    <div className="absolute inset-0 z-10">
      <div className="absolute right-3 top-3 z-20 flex items-center gap-2 rounded-2xl border border-cyan-100/15 bg-[#101741]/72 p-1 text-[10px] font-bold uppercase tracking-[0.12em] text-blue-50/78 shadow-[0_12px_40px_rgba(0,0,0,0.28)] backdrop-blur">
        <button
          type="button"
          onClick={() => setZoom(view.scale * 1.18)}
          className="rounded-xl border border-white/10 px-2 py-1 transition hover:border-cyan-200/60 hover:text-cyan-100"
          aria-label="Acercar mapa Q-Vault"
        >
          +
        </button>
        <button
          type="button"
          onClick={() => setZoom(view.scale * 0.84)}
          className="rounded-xl border border-white/10 px-2 py-1 transition hover:border-cyan-200/60 hover:text-cyan-100"
          aria-label="Alejar mapa Q-Vault"
        >
          -
        </button>
        <button
          type="button"
          onClick={() => setView({ scale: 1, x: 0, y: 0 })}
          className="rounded-xl border border-white/10 px-2 py-1 transition hover:border-cyan-200/60 hover:text-cyan-100"
        >
          Reset
        </button>
      </div>
      <svg
        ref={svgRef}
        className="h-full w-full touch-none"
        viewBox="0 0 1000 500"
        role="img"
        aria-label="Mapa Q-Vault de memoria visible"
        onWheel={handleWheel}
      >
        <style>
          {`
            @keyframes qvault-flow {
              to { stroke-dashoffset: -80; }
            }
            @keyframes qvault-pulse {
              0%, 100% { opacity: 0.34; }
              50% { opacity: 0.78; }
            }
            .qvault-flow {
              stroke-dasharray: 10 12;
              animation: qvault-flow 7s linear infinite;
            }
            .qvault-pulse {
              animation: qvault-pulse 2.8s ease-in-out infinite;
            }
          `}
        </style>
        <defs>
          <radialGradient id="qvault-node-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#a5f3fc" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="qvault-anti-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ff3b3b" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#ff0000" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect
          width="1000"
          height="500"
          fill="transparent"
          className={dragRef.current ? "cursor-grabbing" : "cursor-grab"}
          onPointerDown={handleDragStart}
          onPointerMove={handleDragMove}
          onPointerUp={handleDragEnd}
          onPointerCancel={handleDragEnd}
          onPointerLeave={handleDragEnd}
        />

        <g transform={`translate(${view.x} ${view.y}) scale(${view.scale})`}>
          {links.map((link) => {
            const source = projected.project(link.source.position);
            const target = projected.project(link.target.position);
            return (
              <line
                key={link.id}
                className="qvault-flow"
                x1={source.x}
                y1={source.y}
                x2={target.x}
                y2={target.y}
                stroke={link.type === "backlink" ? "#d946ef" : "#8b5cf6"}
                strokeWidth={link.type === "backlink" ? 1.8 : 1.4}
                strokeOpacity={link.type === "backlink" ? 0.72 : 0.52}
              />
            );
          })}

          {projected.safeNodes.map((node) => {
            const dataPoint = projected.project(node.position);
            const antiPoint = projected.project(node.antiPosition);
            const isDocument = node.kind === "memory" && node.chunkCount > 0;
            const isChat = node.kind === "chat";
            const isActive = activeKeys.has(node.key);
            const radius = isDocument ? 12 : isChat ? 10 : node.kind === "memory" ? 9 : 8;
            const coreColor = isDocument ? "#00b8ff" : isChat ? "#7e1bfd" : node.kind === "memory" ? "#7e1bfd" : DATA_COLOR;
            const shouldRenderLabel = showLabels && (projected.safeNodes.length <= 90 || isActive);
            const label = node.label.length > 28 ? `${node.label.slice(0, 25)}...` : node.label;

            return (
              <g key={node.id}>
                {showAnti && (
                  <>
                    <line
                      className="qvault-flow"
                      x1={dataPoint.x}
                      y1={dataPoint.y}
                      x2={antiPoint.x}
                      y2={antiPoint.y}
                      stroke="#ff0000"
                      strokeWidth="1.4"
                      strokeOpacity="0.62"
                    />
                    <circle className="qvault-pulse" cx={antiPoint.x} cy={antiPoint.y} r={radius * 2.1} fill="url(#qvault-anti-glow)" opacity="0.42" />
                    <circle cx={antiPoint.x} cy={antiPoint.y} r={radius * 0.82} fill="#ff0000" opacity="0.95" />
                  </>
                )}
                <circle className="qvault-pulse" cx={dataPoint.x} cy={dataPoint.y} r={radius * (isActive ? 2.7 : 2.15)} fill="url(#qvault-node-glow)" opacity={isActive ? 0.7 : 0.42} />
                <g
                  role="button"
                  tabIndex={0}
                  className="cursor-pointer"
                  onClick={() => onSelectNode(node)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") onSelectNode(node);
                  }}
                  aria-label={`Seleccionar ${node.label}`}
                >
                  <circle cx={dataPoint.x} cy={dataPoint.y} r={radius} fill={coreColor} stroke={isActive ? "#ffe66d" : "#a5f3fc"} strokeWidth={isActive ? 3 : 1.4} />
                  <circle cx={dataPoint.x} cy={dataPoint.y} r={radius * 1.55} fill="none" stroke={isActive ? "#ffe66d" : "#22d3ee"} strokeWidth="1.2" strokeOpacity="0.75" />
                </g>
                {shouldRenderLabel && (
                  <text
                    x={dataPoint.x + radius + 7}
                    y={dataPoint.y - radius - 5}
                    fill="#e8fbff"
                    fontSize="12"
                    fontWeight="700"
                    paintOrder="stroke"
                    stroke="#111a4b"
                    strokeWidth="4"
                  >
                    {label}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}

// Tanda 4 (Fase 79): las escenas 3D de Quantum Engine se cargan con
// importacion dinamica (React.lazy). three-core, fiber y drei quedan fuera del
// bundle inicial y del modulepreload de index.html: solo se descargan cuando
// se monta una vista 3D, con un estado de carga accesible (role="status").
const VoidScene = lazy(async () => ({ default: (await import("./quantum/QuantumScenes")).VoidScene }));
const QVaultScene3D = lazy(async () => ({ default: (await import("./quantum/QuantumScenes")).QVaultScene3D }));

function SceneSuspenseFallback() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="absolute inset-0 flex items-center justify-center bg-[#02040a]/70"
    >
      <span className="text-[11px] uppercase tracking-[0.14em] text-cyan-100/70">
        Cargando escena cuantica...
      </span>
    </div>
  );
}

export default function App() {
  const [keyInput, setKeyInput] = useState("vector-maestro-001");
  const [dataInput, setDataInput] = useState("Prueba T-Bit 1:1 Exitosa");
  const [interfaceMode, setInterfaceMode] = useState<InterfaceMode>("raw");
  const [dbDomain, setDbDomain] = useState("PetiusDB");
  const [dbCollection, setDbCollection] = useState("Usuarios");
  const [dbIdentifier, setDbIdentifier] = useState("Erika");
  const [dbDocument, setDbDocument] = useState('{\n  "nombre": "Erika",\n  "rol": "arquitecta T-Bit",\n  "estado": "activo"\n}');
  const [apiKey, setApiKey] = useState(() => (
    window.localStorage.getItem("tbitApiKey") ?? import.meta.env.VITE_TBIT_API_KEY ?? ""
  ));
  const [wizardAttributes, setWizardAttributes] = useState<WizardAttribute[]>([
    { id: crypto.randomUUID(), clave: "nombre", valor: "Erika" },
    { id: crypto.randomUUID(), clave: "rol", valor: "Arquitecta" },
    { id: crypto.randomUUID(), clave: "estado", valor: "activo" }
  ]);
  const [vits, setVits] = useState<Vit[]>([]);
  const [aiVits, setAiVits] = useState<Vit[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>(INITIAL_LOGS);
  const [isInjecting, setIsInjecting] = useState(false);
  const [isRecovering, setIsRecovering] = useState(false);
  const [isCollapsing, setIsCollapsing] = useState(false);
  const [currentUniverse, setCurrentUniverse] = useState<UniverseMode>("user");
  const [aiIsThinking, setAiIsThinking] = useState(false);
  const [activeQueryLine, setActiveQueryLine] = useState<QueryLine | null>(null);
  const [aiInput, setAiInput] = useState("");
  const [aiProviderInfo, setAiProviderInfo] = useState<TBitAiProviderInfo | null>(null);
  const [baseAiProviderCatalog, setBaseAiProviderCatalog] = useState<TBitAiProviderDescriptor[]>(FALLBACK_AI_PROVIDER_CATALOG);
  const [customAiProviders, setCustomAiProviders] = useState<TBitAiProviderDescriptor[]>(readStoredCustomAiProviders);
  const [selectedAiProviderId, setSelectedAiProviderId] = useState(() => (
    window.localStorage.getItem(AI_PROVIDER_SELECTED_STORAGE_KEY) ?? "deterministic"
  ));
  const [aiProviderConfigs, setAiProviderConfigs] = useState<AiProviderConfigMap>(readStoredAiProviderConfigs);
  const [customProviderDraft, setCustomProviderDraft] = useState<CustomAiProviderDraft>({
    label: "Ollama Local",
    model: "llama3.1",
    baseUrl: "http://localhost:11434/v1",
    apiKey: "",
    requiresApiKey: false,
  });
  const [aiAgentInstances, setAiAgentInstances] = useState<AiAgentInstance[]>(readStoredAiAgentInstances);
  const aiProviderCatalog = useMemo(
    () => mergeAiProviderCatalog(baseAiProviderCatalog, customAiProviders),
    [baseAiProviderCatalog, customAiProviders],
  );
  const [agentInstanceDraft, setAgentInstanceDraft] = useState({
    name: "OpenAI Investigador",
    providerId: "openai",
    role: "Investiga la solicitud, consulta memoria si es necesario y responde con precision.",
    notebook: "General",
  });
  const [aiProviderStatus, setAiProviderStatus] = useState("Selecciona una IA para configurarla.");
  const [isTestingAiProvider, setIsTestingAiProvider] = useState(false);
  const [userProfile, setUserProfile] = useState<TBitUserProfile | null>(readStoredUserProfile);
  const [profileDraft, setProfileDraft] = useState<TBitUserProfile>(() => readStoredUserProfile() ?? buildDefaultUserProfile());
  const [isFirstRunModalOpen, setIsFirstRunModalOpen] = useState(() => !hasCompleteLocalRegistration(readStoredUserProfile()));
  const [profileSetupStatus, setProfileSetupStatus] = useState("");
  const [registrationPassword, setRegistrationPassword] = useState("");
  const [registrationPasswordConfirm, setRegistrationPasswordConfirm] = useState("");
  const [spacePrepareMode, setSpacePrepareMode] = useState<SpacePrepareMode>("keep");
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [spaceInventory, setSpaceInventory] = useState<TBitSpaceInventoryItem[]>([]);
  const [selectedSpaceIdsForDelete, setSelectedSpaceIdsForDelete] = useState<string[]>([]);
  const [spaceDeleteConfirmation, setSpaceDeleteConfirmation] = useState("");
  const [spaceManagerStatus, setSpaceManagerStatus] = useState("Carga la lista para administrar espacios T-BIT.");
  const [isLoadingSpaceInventory, setIsLoadingSpaceInventory] = useState(false);
  const [isDeletingSpaces, setIsDeletingSpaces] = useState(false);
  const [isZenMode, setIsZenMode] = useState(true);
  const [zenSection, setZenSection] = useState<ZenSection>("chat");
  const [activeNotebook, setActiveNotebook] = useState(() => (
    window.localStorage.getItem(ACTIVE_NOTEBOOK_STORAGE_KEY) ?? "General"
  ));
  const [multiAiMode, setMultiAiMode] = useState<MultiAiMode>(() => {
    const stored = window.localStorage.getItem(MULTI_AI_MODE_STORAGE_KEY);
    return stored === "deliberative" || stored === "critical" ? stored : "fast";
  });
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [settingsModalTab, setSettingsModalTab] = useState<SettingsModalTab>("general");
  const [userSettings, setUserSettings] = useState(readStoredUserSettings);
  const [aiMessages, setAiMessages] = useState<AiMessage[]>([
    {
      id: "ai-boot",
      sender: "Oraculo",
      text: "Canal cognitivo listo. Usa 'recuerda ...' o 'consulta ...'."
    }
  ]);
  const [highlightedVitId, setHighlightedVitId] = useState<string>();
  const [focusTarget, setFocusTarget] = useState<FocusTarget>();
  const [selectedSecondBrainNode, setSelectedSecondBrainNode] = useState<SecondBrainPreviewNode | null>(null);
  const [visibleMemoryActionStatus, setVisibleMemoryActionStatus] = useState("Selecciona un nodo del mapa para ver acciones.");
  const [recoveredData, setRecoveredData] = useState<RecoveredData>();
  const [queryAttribute, setQueryAttribute] = useState("telefono");
  const [queryResult, setQueryResult] = useState<AttributeQueryResult>();
  const memoryGraph = useTBitStore((state) => state.memoryGraph);
  const setMemoryGraph = useTBitStore((state) => state.setMemoryGraph);
  const [secondBrainMapStatus, setSecondBrainMapStatus] = useState("Mapa no cargado.");
  const [semanticQuery, setSemanticQuery] = useState("");
  const [semanticResults, setSemanticResults] = useState<SemanticSearchResult[]>([]);
  const [semanticStatus, setSemanticStatus] = useState("Busqueda semantica lista.");
  const [isSemanticSearching, setIsSemanticSearching] = useState(false);
  const [semanticActiveKeys, setSemanticActiveKeys] = useState<string[]>([]);
  const [isOmniDragging, setIsOmniDragging] = useState(false);
  const [isOmniImporting, setIsOmniImporting] = useState(false);
  const [omniDropStatus, setOmniDropStatus] = useState("Arrastra documentos o archivos para agregarlos a tu memoria.");
  const [omniImportProgress, setOmniImportProgress] = useState(0);
  const [isSecondBrainSidebarCollapsed, setIsSecondBrainSidebarCollapsed] = useState(false);
  const [qVaultLayerFilters, setQVaultLayerFilters] = useState<QVaultLayerFilters>({
    documents: true,
    memories: true,
    chats: true,
    live: true,
    links: true,
    anti: true,
    labels: true,
  });
  const [qVaultMapMode, setQVaultMapMode] = useState<QVaultMapMode>("scene3d");
  const omniFileInputRef = useRef<HTMLInputElement | null>(null);
  const aiChatEndRef = useRef<HTMLDivElement | null>(null);
  const visibleVits = currentUniverse === "ai" ? aiVits : vits;
  const renderableVits = useMemo(
    () => visibleVits.filter((vit) => !isChunkKey(vit.key)),
    [visibleVits],
  );
  const hiddenInternalChunkCount = visibleVits.length - renderableVits.length;
  const requestHistory = useMemo(() => (
    aiMessages
      .filter((message) => message.sender === "T-User")
      .slice(-6)
      .reverse()
  ), [aiMessages]);

  useEffect(() => {
    aiChatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [aiMessages, aiIsThinking, isZenMode]);

  useEffect(() => {
    if (!apiKey.trim()) return;
    let cancelled = false;

    tbitChatClient.getProviders()
      .then(({ activeProvider, providers }) => {
        if (cancelled) return;
        setAiProviderInfo(activeProvider);
        setBaseAiProviderCatalog(providers.length ? providers : FALLBACK_AI_PROVIDER_CATALOG);
        if (!window.localStorage.getItem(AI_PROVIDER_SELECTED_STORAGE_KEY)) {
          setSelectedAiProviderId(activeProvider.id);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAiProviderInfo(null);
          setBaseAiProviderCatalog(FALLBACK_AI_PROVIDER_CATALOG);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [apiKey]);

  useEffect(() => {
    if (!isSettingsModalOpen || settingsModalTab !== "storage") return;
    void loadSpaceInventory();
  }, [isSettingsModalOpen, settingsModalTab]);

  useEffect(() => {
    if (!isZenMode || !apiKey.trim()) return;

    let cancelled = false;

    setSecondBrainMapStatus("Cargando mapa del vacío...");
    loadBestSecondBrainGraph(undefined, () => !cancelled).catch((error) => {
      if (cancelled) return;
      setSecondBrainMapStatus(error instanceof Error ? error.message : "No se pudo cargar el mapa.");
    });

    return () => {
      cancelled = true;
    };
  }, [apiKey, isZenMode, setMemoryGraph, userProfile?.displayName, userProfile?.userId]);

  function updateApiKey(value: string) {
    setApiKey(value);
    window.localStorage.setItem("tbitApiKey", value);
    window.localStorage.setItem("tbit_api_key", value);
  }

  function buildApiHeaders() {
    return {
      "Content-Type": "application/json",
      "x-tbit-api-key": apiKey
    };
  }

  function requireApiKey(): boolean {
    if (apiKey.trim()) {
      return true;
    }

    setLogs((current) => [
      { id: crypto.randomUUID(), message: "ERROR :: Llave local API no configurada. Ejecuta npm run setup:secret y reinicia Vite, o pegala en el panel." },
      ...current
    ].slice(0, 14));
    return false;
  }

  async function loadBestSecondBrainGraph(
    statusWhenEmpty = "No hay documentos o memorias visibles para este usuario.",
    shouldApply: () => boolean = () => true,
  ) {
    const scopedUsers = Array.from(new Set([activeUserId(), activeDisplayName()]
      .map((value) => value.trim())
      .filter(Boolean)));
    let selectedGraph: typeof memoryGraph = null;
    let selectedScope = "";

    for (const scope of scopedUsers) {
      const response = await memoryCoreClient.graph(scope);
      const graph = (response as { graph?: typeof memoryGraph }).graph ?? null;
      if (!selectedGraph) selectedGraph = graph;
      if (graph && graph.nodes.length > 0) {
        selectedGraph = graph;
        selectedScope = scope;
        break;
      }
    }

    if (!shouldApply()) return;
    setMemoryGraph(selectedGraph);
    setSecondBrainMapStatus(
      selectedGraph && selectedGraph.nodes.length > 0
        ? `Mapa listo: ${selectedGraph.nodes.length} nodos${selectedScope ? ` (${selectedScope})` : ""}.`
        : statusWhenEmpty,
    );
  }

  async function refreshSecondBrainGraphAfterImport() {
    await loadBestSecondBrainGraph("Archivo guardado. El mapa se actualizara cuando existan nodos visibles.");
  }

  function removeMemoryRootsFromVisibleGraph(rootKeys: string[]) {
    if (!memoryGraph || rootKeys.length === 0) return;
    const roots = new Set(rootKeys.map((key) => getDocumentRootKey(key)));
    setMemoryGraph({
      ...memoryGraph,
      nodes: memoryGraph.nodes.filter((node) => !roots.has(getDocumentRootKey(node.key))),
      links: memoryGraph.links.filter((link) => (
        !roots.has(getDocumentRootKey(link.sourceKey)) &&
        !roots.has(getDocumentRootKey(link.targetKey))
      )),
      tags: Object.fromEntries(
        Object.entries(memoryGraph.tags ?? {})
          .map(([tag, keys]) => [tag, keys.filter((key) => !roots.has(getDocumentRootKey(key)))])
          .filter(([, keys]) => keys.length > 0),
      ),
    });
  }

  async function clearVisibleConversation() {
    const first = window.confirm("Borrar solo la conversación visible de esta sesión? La memoria guardada en Q-Vault no se eliminara.");
    if (!first) return;

    setAiMessages([
      {
        id: crypto.randomUUID(),
        sender: "Oraculo",
        text: "Conversacion visible limpiada. La memoria persistente no fue alterada.",
      },
    ]);
    setVisibleMemoryActionStatus("Conversacion visible limpiada. Para borrar una memoria guardada, selecciona su nodo en el mapa y usa Eliminar seleccion.");
  }

  function renameActiveNotebook() {
    const nextName = window.prompt("Nuevo nombre del notebook activo:", activeNotebook.trim() || "General");
    if (nextName === null) return;
    const normalized = nextName.trim();
    if (!normalized) {
      setVisibleMemoryActionStatus("El notebook necesita un nombre visible.");
      return;
    }
    updateActiveNotebook(normalized);
    setVisibleMemoryActionStatus(`Notebook activo renombrado a ${normalized}.`);
  }

  async function deleteSelectedVisibleDocument() {
    if (!selectedSecondBrainNode) {
      setVisibleMemoryActionStatus("Selecciona primero un documento, asset o memoria en el mapa.");
      return;
    }

    const rootKey = getDocumentRootKey(selectedSecondBrainNode.key);
    const label = selectedSecondBrainNode.label || rootKey;
    const isMarkdownDocument = rootKey.startsWith("Markdown::");
    const isAssetDocument = rootKey.startsWith("Asset::");
    const isMemoryRecord = !isMarkdownDocument && !isAssetDocument;

    if (isMemoryRecord && !rootKey.startsWith(`${activeUserId()}::`)) {
      setVisibleMemoryActionStatus("Solo puedes borrar memorias pertenecientes al usuario activo.");
      return;
    }

    const first = window.confirm(`Eliminar "${label}" del vacío?`);
    if (!first) return;
    const second = window.confirm(`Confirmacion final: borrar definitivamente "${label}"?`);
    if (!second) return;

    try {
      setVisibleMemoryActionStatus(`Eliminando ${label}...`);
      const response = isMarkdownDocument
        ? await markdownBridgeClient.delete(rootKey) as { result?: { deletedKeys?: string[]; collapsedCount?: number; indexRemovedCount?: number } }
        : isAssetDocument
          ? await assetManagerClient.delete(rootKey) as { result?: { deletedKeys?: string[]; collapsedCount?: number; indexRemovedCount?: number } }
          : await memoryCoreClient.delete(rootKey) as { result?: { key?: string; collapsed?: boolean; removedFromIndex?: boolean } };

      const deletedKeys = "deletedKeys" in (response.result ?? {}) ? ((response.result as { deletedKeys?: string[] }).deletedKeys ?? [rootKey]) : [rootKey];
      const deletedRoots = Array.from(new Set([rootKey, ...deletedKeys].map((key) => getDocumentRootKey(key))));
      removeMemoryRootsFromVisibleGraph(deletedRoots);
      setSelectedSecondBrainNode(null);
      setSemanticActiveKeys((current) => current.filter((key) => !deletedRoots.includes(getDocumentRootKey(key))));
      setSecondBrainMapStatus(`Eliminado: ${label}.`);
      if (isMemoryRecord) {
        const result = response.result as { collapsed?: boolean; removedFromIndex?: boolean } | undefined;
        setVisibleMemoryActionStatus(
          `Memoria eliminada: ${label}. Físico: ${result?.collapsed ? "colapsado" : "sin registro físico"} | Índice: ${result?.removedFromIndex ? "limpio" : "sin entrada"}.`,
        );
      } else {
        const result = response.result as { collapsedCount?: number; indexRemovedCount?: number } | undefined;
        setVisibleMemoryActionStatus(
          `Eliminado: ${label}. Colapsados: ${result?.collapsedCount ?? 0} | Índice: ${result?.indexRemovedCount ?? 0}.`,
        );
      }
    } catch (error) {
      setVisibleMemoryActionStatus(error instanceof Error ? error.message : "Fallo eliminando seleccion.");
    }
  }

  async function importFilesToOmniWorkspace(files: File[]) {
    const validFiles = files.filter((file) => file.size > 0);
    if (validFiles.length === 0) {
      setOmniDropStatus("No se detectaron archivos validos.");
      return;
    }
    if (!requireApiKey()) {
      setOmniDropStatus("Configura la llave local API antes de importar archivos.");
      return;
    }

    setIsOmniImporting(true);
    setOmniImportProgress(0);
    setOmniDropStatus(`Agregando ${validFiles.length} archivo${validFiles.length === 1 ? "" : "s"} al vacío...`);

    const imported: string[] = [];
    const failed: string[] = [];

    try {
      for (let fileIndex = 0; fileIndex < validFiles.length; fileIndex += 1) {
        const file = validFiles[fileIndex];
        const baseProgress = Math.round((fileIndex / validFiles.length) * 100);
        const semanticMode = file.size > INLINE_SEMANTIC_FILE_LIMIT_BYTES ? "deferred" : "auto";
        try {
          setOmniDropStatus(
            file.size > LARGE_OMNI_FILE_WARNING_BYTES
              ? `Archivo grande detectado: ${file.name}. Guardando primero el binario verificable; la extraccion semantica quedara diferida.`
              : `Leyendo ${file.name}...`,
          );
          const contentBase64 = await fileToBase64Payload(file, (readPercent) => {
            const currentFileShare = readPercent / validFiles.length;
            setOmniImportProgress(Math.min(45, Math.round(baseProgress + currentFileShare)));
          });
          setOmniDropStatus(`Enviando ${file.name} al contenedor T-BIT...`);
          setOmniImportProgress(Math.min(85, Math.round(((fileIndex + 0.75) / validFiles.length) * 100)));
          const response = await universalDocumentClient.importDocumentWithProgress(
            {
              userId: activeUserId(),
              filename: file.name,
              mimeType: file.type || "application/octet-stream",
              contentBase64,
              semanticMode,
              analyzeCode: userSettings.autoAnalyzeCode,
              showCodeGraphRelations: userSettings.showCodeGraphRelations,
            },
            (uploadPercent) => {
              const currentFileProgress = 45 + Math.round(uploadPercent * 0.4);
              setOmniImportProgress(Math.min(92, Math.round(baseProgress + currentFileProgress / validFiles.length)));
            },
          );
          setOmniDropStatus(`Confirmando escritura fisica de ${file.name}...`);
          const readableTitle = isReadableDisplayLabel(response.result.title)
            ? response.result.title
            : file.name;
          const codeGraph = response.result.codeGraph;
          imported.push(
            codeGraph
              ? `${readableTitle} (código ${codeGraph.language}: ${codeGraph.functions} funciones, ${codeGraph.classes} clases, ${codeGraph.imports} imports)`
              : response.result.searchable
              ? `${readableTitle} (consultable)`
              : `${response.result.filename} (asset verificable${response.result.semanticStatus === "deferred" ? ", semantica diferida" : ""})`,
          );
          setOmniImportProgress(Math.round(((fileIndex + 1) / validFiles.length) * 100));
        } catch (error) {
          failed.push(`${file.name}: ${error instanceof Error ? error.message : "fallo desconocido"}`);
        }
      }

      try {
        await refreshSecondBrainGraphAfterImport();
      } catch {
        setSecondBrainMapStatus("Archivo guardado, pero no se pudo refrescar el mapa automáticamente.");
      }

      setAiMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          sender: "Oraculo",
          text: failed.length === 0
            ? `Documento${imported.length === 1 ? "" : "s"} añadido${imported.length === 1 ? "" : "s"} a tu fuente de conocimiento: ${imported.join(", ")}.`
            : `Importacion parcial. OK: ${imported.join(", ") || "ninguno"}. Error: ${failed.join(" | ")}`,
        },
      ]);
      setOmniDropStatus(
        failed.length === 0
          ? `${imported.length} archivo${imported.length === 1 ? "" : "s"} añadido${imported.length === 1 ? "" : "s"} a tu memoria.`
          : `Importacion parcial: ${imported.length} OK, ${failed.length} con error.`,
      );
      setSemanticStatus("Contenido agregado. Reindexa busqueda semantica si quieres incluirlo en busqueda por significado.");
    } finally {
      setIsOmniImporting(false);
      setIsOmniDragging(false);
      setOmniImportProgress(0);
    }
  }

  function getProviderDescriptor(providerId = selectedAiProviderId): TBitAiProviderDescriptor {
    const resolvedProviderId = aiAgentInstances.find((agent) => agent.id === providerId)?.providerId ?? providerId;
    return aiProviderCatalog.find((provider) => provider.id === resolvedProviderId)
      ?? FALLBACK_AI_PROVIDER_CATALOG.find((provider) => provider.id === resolvedProviderId)
      ?? FALLBACK_AI_PROVIDER_CATALOG[0];
  }

  function getProviderDraft(providerId = selectedAiProviderId): AiProviderConfigDraft {
    const descriptor = getProviderDescriptor(providerId);
    const resolvedProviderId = aiAgentInstances.find((agent) => agent.id === providerId)?.providerId ?? providerId;
    return aiProviderConfigs[resolvedProviderId] ?? {
      apiKey: "",
      model: descriptor.defaultModel,
      baseUrl: descriptor.defaultBaseUrl ?? "",
    };
  }

  function isProviderConfigured(descriptor: TBitAiProviderDescriptor, draft = getProviderDraft(descriptor.id)): boolean {
    if (descriptor.id === "deterministic") return true;
    if (descriptor.requiresApiKey && !draft.apiKey.trim()) return false;
    if (descriptor.requiresBaseUrl && !draft.baseUrl.trim()) return false;
    if (descriptor.protocol === "openai-compatible" && descriptor.mode === "local") return Boolean((draft.baseUrl || descriptor.defaultBaseUrl || "").trim());
    return true;
  }

  function selectedProviderConfig(providerId = selectedAiProviderId): TBitAiProviderConfig {
    const descriptor = getProviderDescriptor(providerId);
    const draft = getProviderDraft(providerId);
    const apiKey = draft.apiKey.trim()
      || (descriptor.custom && !descriptor.requiresApiKey ? "local-provider" : undefined);
    return {
      id: descriptor.runtimeId ?? descriptor.id,
      apiKey,
      model: draft.model.trim() || descriptor.defaultModel,
      baseUrl: draft.baseUrl.trim() || descriptor.defaultBaseUrl,
    };
  }

  function getAgentRuntime(agentId = selectedAiProviderId): AiAgentRuntime {
    const instance = aiAgentInstances.find((agent) => agent.id === agentId);
    const provider = getProviderDescriptor(agentId);
    const draft = getProviderDraft(agentId);
    return {
      id: instance?.id ?? provider.id,
      name: instance?.name ?? provider.label,
      provider,
      draft,
      role: instance?.role,
      notebook: instance?.notebook,
      isInstance: Boolean(instance),
      configured: isProviderConfigured(provider, draft),
    };
  }

  function buildAgentMessage(command: string, agent = getAgentRuntime()): string {
    if (!agent.isInstance || !agent.role?.trim()) return command;
    return [
      "[T-BIT AGENT INSTANCE]",
      `Nombre: ${agent.name}`,
      `Proveedor base: ${agent.provider.label}`,
      `Notebook asignado: ${agent.notebook || activeNotebookKey()}`,
      `Rol operativo: ${agent.role.trim()}`,
      "",
      "Instruccion del usuario:",
      command,
    ].join("\n");
  }

  function updateActiveNotebook(value: string) {
    const next = value.slice(0, 80);
    setActiveNotebook(next);
    window.localStorage.setItem(ACTIVE_NOTEBOOK_STORAGE_KEY, next);
  }

  function activeNotebookKey(): string {
    return normalizeTBitKey(activeNotebook.trim() || "General") || "General";
  }

  function multiAiModeLabel(mode = multiAiMode): string {
    if (mode === "deliberative") return "Deliberativo";
    if (mode === "critical") return "Critico";
    return "Rapido";
  }

  function updateMultiAiMode(value: MultiAiMode) {
    setMultiAiMode(value);
    window.localStorage.setItem(MULTI_AI_MODE_STORAGE_KEY, value);
  }

  function getConsensusProviders(): TBitAiProviderDescriptor[] {
    const configured = aiProviderCatalog.filter((provider) => (
      provider.id !== "deterministic" && isProviderConfigured(provider, getProviderDraft(provider.id))
    ));
    const selected = getProviderDescriptor();
    if (selected.id !== "deterministic" && isProviderConfigured(selected, getProviderDraft(selected.id))) {
      return [
        selected,
        ...configured.filter((provider) => provider.id !== selected.id),
      ].slice(0, 5);
    }
    return configured.slice(0, 5);
  }

  function getConsensusAgents(): AiAgentRuntime[] {
    const instances = aiAgentInstances
      .filter((agent) => agent.enabled)
      .map((agent) => getAgentRuntime(agent.id))
      .filter((agent) => agent.provider.id !== "deterministic" && agent.configured);

    if (instances.length > 0) {
      const selected = getAgentRuntime();
      const ordered = selected.configured && selected.provider.id !== "deterministic"
        ? [selected, ...instances.filter((agent) => agent.id !== selected.id)]
        : instances;
      return ordered.slice(0, 5);
    }

    return getConsensusProviders().map((provider) => getAgentRuntime(provider.id));
  }

  function selectAiProvider(providerId: string) {
    setSelectedAiProviderId(providerId);
    window.localStorage.setItem(AI_PROVIDER_SELECTED_STORAGE_KEY, providerId);
    setZenSection("ai");
    const agent = getAgentRuntime(providerId);
    setAiProviderStatus(`${agent.name} seleccionado. ${agent.configured ? "Listo para probar o usar." : "Completa la configuracion requerida del proveedor base."}`);
  }

  function updateAiProviderDraft(providerId: string, field: keyof AiProviderConfigDraft, value: string) {
    setAiProviderConfigs((current) => {
      const descriptor = getProviderDescriptor(providerId);
      const next = {
        ...current,
        [providerId]: {
          ...(current[providerId] ?? {
            apiKey: "",
            model: descriptor.defaultModel,
            baseUrl: descriptor.defaultBaseUrl ?? "",
          }),
          [field]: value,
        },
      };
      window.localStorage.setItem(AI_PROVIDER_CONFIGS_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }

  function clearSelectedAiProviderConfig() {
    setAiProviderConfigs((current) => {
      const next = { ...current };
      delete next[getProviderDescriptor().id];
      window.localStorage.setItem(AI_PROVIDER_CONFIGS_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
    const agent = getAgentRuntime();
    setAiProviderStatus(`${agent.provider.label}: configuracion local eliminada. Puedes pegar una nueva llave cuando quieras.`);
  }

  function persistCustomAiProviders(next: TBitAiProviderDescriptor[]) {
    setCustomAiProviders(next);
    window.localStorage.setItem(AI_CUSTOM_PROVIDERS_STORAGE_KEY, JSON.stringify(next));
  }

  function createCustomAiProvider() {
    const label = normalizeUnicodeText(customProviderDraft.label.trim());
    const model = normalizeUnicodeText(customProviderDraft.model.trim());
    const baseUrl = customProviderDraft.baseUrl.trim();

    if (!label || !model || !baseUrl) {
      setAiProviderStatus("ERROR :: Nombre, modelo y Base URL son requeridos para crear una IA personalizada.");
      return;
    }

    const id = `custom:${normalizeTBitKey(label) || "provider"}:${crypto.randomUUID().slice(0, 8)}`;
    const descriptor: TBitAiProviderDescriptor = {
      id,
      label,
      mode: /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])/i.test(baseUrl) ? "local" : "remote",
      defaultModel: model,
      defaultBaseUrl: baseUrl,
      requiresApiKey: customProviderDraft.requiresApiKey,
      requiresBaseUrl: true,
      protocol: "openai-compatible",
      runtimeId: "openai-compatible",
      custom: true,
    };
    persistCustomAiProviders([...customAiProviders, descriptor]);
    setAiProviderConfigs((current) => {
      const next = {
        ...current,
        [id]: {
          apiKey: customProviderDraft.apiKey.trim(),
          model,
          baseUrl,
        },
      };
      window.localStorage.setItem(AI_PROVIDER_CONFIGS_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
    setSelectedAiProviderId(id);
    window.localStorage.setItem(AI_PROVIDER_SELECTED_STORAGE_KEY, id);
    setZenSection("ai");
    setAiProviderStatus(`${label} agregado como proveedor OpenAI-compatible. Listo para probar o usar.`);
  }

  function deleteCustomAiProvider(providerId: string) {
    const provider = customAiProviders.find((item) => item.id === providerId);
    if (!provider) return;
    persistCustomAiProviders(customAiProviders.filter((item) => item.id !== providerId));
    setAiProviderConfigs((current) => {
      const next = { ...current };
      delete next[providerId];
      window.localStorage.setItem(AI_PROVIDER_CONFIGS_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
    persistAgentInstances(aiAgentInstances.filter((agent) => agent.providerId !== providerId));
    if (selectedAiProviderId === providerId || aiAgentInstances.some((agent) => agent.id === selectedAiProviderId && agent.providerId === providerId)) {
      selectAiProvider("deterministic");
    }
    setAiProviderStatus(`${provider.label} eliminado del catalogo local.`);
  }

  function persistAgentInstances(next: AiAgentInstance[]) {
    setAiAgentInstances(next);
    window.localStorage.setItem(AI_AGENT_INSTANCES_STORAGE_KEY, JSON.stringify(next));
  }

  function createAgentInstance() {
    const provider = getProviderDescriptor(agentInstanceDraft.providerId);
    const name = normalizeUnicodeText(agentInstanceDraft.name.trim()) || `${provider.label} Agente`;
    const role = normalizeUnicodeText(agentInstanceDraft.role.trim());
    if (!role) {
      setAiProviderStatus("ERROR :: Define un rol para la instancia antes de crearla.");
      return;
    }

    const id = `agent:${normalizeTBitKey(name) || "instancia"}:${crypto.randomUUID().slice(0, 8)}`;
    const next = [
      ...aiAgentInstances,
      {
        id,
        name,
        providerId: provider.id,
        role,
        notebook: agentInstanceDraft.notebook.trim() || activeNotebookKey(),
        enabled: true,
      },
    ];
    persistAgentInstances(next);
    setSelectedAiProviderId(id);
    window.localStorage.setItem(AI_PROVIDER_SELECTED_STORAGE_KEY, id);
    setZenSection("ai");
    setAiProviderStatus(`${name} creado sobre ${provider.label}. Listo para usar con rol propio.`);
    setAgentInstanceDraft((current) => ({
      ...current,
      name: `${provider.label} Critico`,
      role: "Evalúa respuestas, detecta contradicciones y entrega observaciones verificables.",
    }));
  }

  function deleteAgentInstance(agentId: string) {
    const removed = aiAgentInstances.find((agent) => agent.id === agentId);
    const next = aiAgentInstances.filter((agent) => agent.id !== agentId);
    persistAgentInstances(next);
    if (selectedAiProviderId === agentId) {
      selectAiProvider("deterministic");
    }
    if (removed) {
      setAiProviderStatus(`${removed.name} eliminado. ${selectedAiProviderId === agentId ? "T-BIT Local queda como principal." : "La seleccion principal no cambio."}`);
    }
  }

  function toggleAgentInstance(agentId: string) {
    const target = aiAgentInstances.find((agent) => agent.id === agentId);
    const nextEnabled = !(target?.enabled ?? true);
    persistAgentInstances(aiAgentInstances.map((agent) => (
      agent.id === agentId ? { ...agent, enabled: nextEnabled } : agent
    )));
    if (target) {
      setAiProviderStatus(
        nextEnabled
          ? `${target.name} participara en Multi-IA cuando el consenso este encendido.`
          : `${target.name} queda disponible, pero no participara en Multi-IA.`,
      );
    }
  }

  async function testSelectedAiProvider() {
    if (!requireApiKey()) return;
    setIsTestingAiProvider(true);
    setAiProviderStatus("Probando conexion con el proveedor seleccionado...");
    try {
      const response = await tbitChatClient.testProvider(selectedProviderConfig());
      if (!response.ok) throw new Error(response.error ?? "La prueba no fue exitosa.");
      setAiProviderInfo(response.provider ?? null);
      setAiProviderStatus(`Conexion confirmada: ${response.provider?.label ?? getProviderDescriptor().label}. ${response.sample ?? ""}`.trim());
    } catch (error) {
      setAiProviderStatus(formatUserFacingAiError(error, selectedAgentRuntime.name));
    } finally {
      setIsTestingAiProvider(false);
    }
  }

  function toggleUserSetting(key: keyof typeof userSettings) {
    setUserSettings((current) => {
      const next = {
        ...current,
        [key]: !current[key],
      };
      window.localStorage.setItem(USER_SETTINGS_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }

  function activeUserId(): string {
    return normalizeUserScope(userProfile?.userId || userProfile?.displayName || "usuario_local");
  }

  function activeDisplayName(): string {
    return userProfile?.displayName?.trim() || "Usuario local";
  }

  function scopeUserKey(key: string): string {
    const normalized = normalizeUnicodeText(key.trim());
    if (!normalized) return `${activeUserId()}::Memoria::General`;
    if (normalized.startsWith("Usuario::")) {
      return normalized.replace(/^Usuario::/, `${activeUserId()}::`);
    }
    return normalized;
  }

  function resetRuntimeVisualState(message = "Mapa limpio. Importa documentos o guarda memorias para construir el nuevo espacio.") {
    setVits([]);
    setAiVits([]);
    setMemoryGraph(null);
    setHighlightedVitId(undefined);
    setFocusTarget(undefined);
    setSelectedSecondBrainNode(null);
    setVisibleMemoryActionStatus("Selecciona un nodo del mapa para ver acciones.");
    setActiveQueryLine(null);
    setRecoveredData(undefined);
    setQueryResult(undefined);
    setSemanticResults([]);
    setSemanticActiveKeys([]);
    setSemanticStatus("Busqueda semantica lista.");
    setSecondBrainMapStatus(message);
  }

  async function saveUserProfile() {
    const displayName = normalizeUnicodeText(profileDraft.displayName.trim());
    const userId = normalizeUserScope(profileDraft.userId || displayName);
    const email = normalizeEmail(profileDraft.email ?? "");
    const vaultRoot = normalizeUnicodeText((profileDraft.vaultRoot ?? "").trim());
    const containerSizeMb = Number.isFinite(Number(profileDraft.containerSizeMb))
      ? Math.min(MAX_VAULT_SIZE_MB, Math.max(MIN_VAULT_SIZE_MB, Math.round(Number(profileDraft.containerSizeMb))))
      : 1024;

    if (!displayName || !userId) {
      setProfileSetupStatus("Ingresa un nombre visible y un ID de usuario T-BIT.");
      return;
    }
    if (!email || !isValidEmail(email)) {
      setProfileSetupStatus("Ingresa un email valido para registrar el usuario.");
      return;
    }
    const mustCreatePassword = !userProfile?.passwordHash && !profileDraft.passwordHash;
    const isChangingPassword = registrationPassword.length > 0 || registrationPasswordConfirm.length > 0;
    if (mustCreatePassword || isChangingPassword) {
      if (registrationPassword.length < 8) {
        setProfileSetupStatus("La contraseña local debe tener minimo 8 caracteres.");
        return;
      }
      if (registrationPassword !== registrationPasswordConfirm) {
        setProfileSetupStatus("La confirmación de contraseña no coincide.");
        return;
      }
    }

    let passwordHash = profileDraft.passwordHash ?? userProfile?.passwordHash;
    let passwordSalt = profileDraft.passwordSalt ?? userProfile?.passwordSalt;
    if (mustCreatePassword || isChangingPassword) {
      passwordSalt = createLocalSalt();
      try {
        passwordHash = await hashLocalPassword(registrationPassword, passwordSalt);
      } catch (error) {
        setProfileSetupStatus(error instanceof Error ? error.message : "No se pudo proteger la contraseña local.");
        return;
      }
    }
    if (!passwordHash || !passwordSalt) {
      setProfileSetupStatus("Configura una contraseña local para registrar el usuario.");
      return;
    }

    if (spacePrepareMode === "overwrite") {
      const confirmed = window.confirm(
        `Confirmacion final:\n\nRecrear los contenedores T-BIT con ${containerSizeMb} MB puede eliminar datos existentes si el espacio ya contiene metadata.\n\nQuieres continuar?`,
      );
      if (!confirmed) {
        setProfileSetupStatus("Sobrescritura cancelada. Se conservara el espacio existente.");
        return;
      }
    }

    setIsSavingProfile(true);
    setProfileSetupStatus("Verificando espacio físico T-BIT...");

    const nextProfile: TBitUserProfile = {
      displayName,
      userId,
      email,
      passwordHash,
      passwordSalt,
      authVersion: "local-pbkdf2-sha256-v1",
      vaultRoot,
      containerSizeMb,
      createdAt: userProfile?.createdAt ?? profileDraft.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    try {
      const report = await containerHealthClient.prepareSpace(containerSizeMb, "both", spacePrepareMode, {
        userId,
        displayName,
        email,
        vaultRoot,
      });
      window.localStorage.setItem(USER_PROFILE_STORAGE_KEY, JSON.stringify(nextProfile));
      setUserProfile(nextProfile);
      setProfileDraft(nextProfile);
      setRegistrationPassword("");
      setRegistrationPasswordConfirm("");
      if (report.warnings.length > 0) {
        setProfileSetupStatus(report.warnings.join(" "));
        resetRuntimeVisualState(`Perfil ${displayName} activo. El contenedor existente se conservó.`);
        window.alert(`${report.warnings.join("\n")}\n\nTu perfil se guardó. El contenedor fisico existente se conservó porque elegiste no sobrescribirlo.`);
      } else {
        setProfileSetupStatus(`Espacio T-BIT listo: ${containerSizeMb} MB.`);
        if (spacePrepareMode === "overwrite") {
          resetRuntimeVisualState(`Espacio ${containerSizeMb} MB recreado. Mapa limpio para ${displayName}.`);
        } else {
          resetRuntimeVisualState(`Perfil ${displayName} activo. Carga o importa contenido para construir el mapa.`);
        }
      }
      setIsFirstRunModalOpen(false);
    } catch (error) {
      setProfileSetupStatus(error instanceof Error ? error.message : "No se pudo verificar el espacio T-BIT.");
    } finally {
      setIsSavingProfile(false);
    }
  }

  async function loadSpaceInventory() {
    setIsLoadingSpaceInventory(true);
    setSpaceManagerStatus("Leyendo espacios T-BIT del equipo...");
    try {
      const vaultRoot = (profileDraft.vaultRoot ?? userProfile?.vaultRoot ?? "").trim();
      const inventory = await containerHealthClient.listUserSpaces(vaultRoot);
      setSpaceInventory(inventory.spaces);
      setSelectedSpaceIdsForDelete((current) => current.filter((spaceId) => inventory.spaces.some((space) => space.spaceId === spaceId && !space.active)));
      setSpaceManagerStatus(`Espacios encontrados: ${inventory.spaces.length}.`);
    } catch (error) {
      setSpaceManagerStatus(error instanceof Error ? error.message : "No se pudo leer el inventario de espacios.");
    } finally {
      setIsLoadingSpaceInventory(false);
    }
  }

  function toggleSpaceDeleteSelection(spaceId: string) {
    setSelectedSpaceIdsForDelete((current) => (
      current.includes(spaceId)
        ? current.filter((item) => item !== spaceId)
        : [...current, spaceId]
    ));
  }

  async function deleteSelectedSpaces() {
    if (selectedSpaceIdsForDelete.length === 0) {
      setSpaceManagerStatus("Selecciona al menos un espacio no activo.");
      return;
    }
    if (spaceDeleteConfirmation !== "ELIMINAR") {
      setSpaceManagerStatus("Escribe ELIMINAR para confirmar el borrado.");
      return;
    }
    const confirmed = window.confirm(
      `Confirmacion final:\n\nSe eliminaran ${selectedSpaceIdsForDelete.length} espacio(s) T-BIT completos, incluyendo contenedores .tbit, metadata, WAL e indices.\n\nEsta accion no se puede deshacer.\n\nContinuar?`,
    );
    if (!confirmed) {
      setSpaceManagerStatus("Borrado cancelado.");
      return;
    }

    setIsDeletingSpaces(true);
    setSpaceManagerStatus("Eliminando espacios seleccionados...");
    try {
      const vaultRoot = (profileDraft.vaultRoot ?? userProfile?.vaultRoot ?? "").trim();
      const result = await containerHealthClient.deleteUserSpaces(selectedSpaceIdsForDelete, spaceDeleteConfirmation, vaultRoot);
      setSpaceInventory(result.spaces);
      setSelectedSpaceIdsForDelete([]);
      setSpaceDeleteConfirmation("");
      setSpaceManagerStatus(`Espacios eliminados: ${result.deleted.join(", ")}.`);
    } catch (error) {
      setSpaceManagerStatus(error instanceof Error ? error.message : "No se pudieron eliminar los espacios.");
    } finally {
      setIsDeletingSpaces(false);
    }
  }

  async function activateInventorySpace(space: TBitSpaceInventoryItem) {
    if (!space.spaceId) return;
    const vaultRoot = (profileDraft.vaultRoot ?? userProfile?.vaultRoot ?? "").trim();
    const displayName = normalizeUnicodeText(space.displayName || space.ownerUserId || space.spaceId);
    const userId = normalizeUserScope(space.ownerUserId || space.spaceId);
    const email = normalizeEmail(space.email || profileDraft.email || userProfile?.email || "");
    const nextProfile: TBitUserProfile = {
      displayName,
      userId,
      email,
      passwordHash: profileDraft.passwordHash ?? userProfile?.passwordHash,
      passwordSalt: profileDraft.passwordSalt ?? userProfile?.passwordSalt,
      authVersion: profileDraft.authVersion ?? userProfile?.authVersion,
      vaultRoot,
      containerSizeMb: Math.min(MAX_VAULT_SIZE_MB, Math.max(MIN_VAULT_SIZE_MB, Math.round(space.sizeMB || profileDraft.containerSizeMb || 1024))),
      createdAt: userProfile?.createdAt ?? profileDraft.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setIsSavingProfile(true);
    setSpaceManagerStatus(`Activando espacio ${space.label || space.spaceId}...`);
    try {
      const result = await containerHealthClient.activateUserSpace(space.spaceId, displayName, vaultRoot, email);
      window.localStorage.setItem(USER_PROFILE_STORAGE_KEY, JSON.stringify(nextProfile));
      setUserProfile(nextProfile);
      setProfileDraft(nextProfile);
      setSpaceInventory(result.spaces);
      setSelectedSpaceIdsForDelete([]);
      setSpaceDeleteConfirmation("");
      resetRuntimeVisualState(`Boveda activa: ${displayName}.`);
      setSpaceManagerStatus(`Espacio activo: ${space.label || space.spaceId}.`);
      setIsFirstRunModalOpen(false);
    } catch (error) {
      setSpaceManagerStatus(error instanceof Error ? error.message : "No se pudo activar el espacio seleccionado.");
    } finally {
      setIsSavingProfile(false);
    }
  }

  function deleteLocalUserProfile() {
    if (!userProfile) {
      setProfileSetupStatus("No hay un usuario local activo para eliminar.");
      return;
    }

    const confirmed = window.confirm(
      "Eliminar usuario local:\n\nEsto borra el perfil guardado en este navegador y volvera a mostrar el primer arranque.\n\nNo elimina tus bóvedas .tbit. Para borrar datos físicos usa Ajustes > Bovedas.\n\nContinuar?",
    );
    if (!confirmed) {
      setProfileSetupStatus("Eliminacion de usuario cancelada.");
      return;
    }

    const typed = window.prompt("Confirmacion final: escribe ELIMINAR USUARIO para borrar solo el perfil local.");
    if (typed !== "ELIMINAR USUARIO") {
      setProfileSetupStatus("El usuario local no fue eliminado: confirmación incorrecta.");
      return;
    }

    window.localStorage.removeItem(USER_PROFILE_STORAGE_KEY);
    const blankProfile = buildDefaultUserProfile();
    setUserProfile(null);
    setProfileDraft(blankProfile);
    setRegistrationPassword("");
    setRegistrationPasswordConfirm("");
    setSelectedSpaceIdsForDelete([]);
    setSpaceDeleteConfirmation("");
    setAiMessages([
      {
        id: "ai-boot",
        sender: "Oraculo",
        text: "Canal cognitivo listo. Usa 'recuerda ...' o 'consulta ...'.",
      },
    ]);
    resetRuntimeVisualState("Usuario local eliminado. Selecciona o crea una boveda para continuar.");
    setProfileSetupStatus("Usuario local eliminado. Las bovedas fisicas se conservaron.");
    setIsSettingsModalOpen(false);
    setIsFirstRunModalOpen(true);
  }
  function upsertVit(vit: Vit) {
    setVits((current) => {
      const withoutSameKey = current.filter((item) => item.key !== vit.key);
      return [vit, ...withoutSameKey].slice(0, 16);
    });
    setHighlightedVitId(vit.id);
    setFocusTarget({
      id: vit.id,
      position: vit.position,
      startedAt: performance.now()
    });
  }

  function upsertAiVit(vit: Vit) {
    setAiVits((current) => {
      const withoutSameKey = current.filter((item) => item.key !== vit.key);
      return [vit, ...withoutSameKey].slice(0, 16);
    });
    setHighlightedVitId(vit.id);
    setFocusTarget({
      id: vit.id,
      position: vit.position,
      startedAt: performance.now()
    });
  }

  function vitFromApiPayload(payload: any, data: string): Vit {
    return {
      id: crypto.randomUUID(),
      key: payload.clave,
      data,
      position: payload.coordinates as [number, number, number],
      antiPosition: payload.antiCoordinates as [number, number, number],
      offsetV: payload.offsetV,
      offsetAntiV: payload.offsetAntiV,
      createdAt: new Date().toLocaleTimeString("es-CO", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      })
    };
  }

  function pushAiMessage(sender: AiMessage["sender"], text: string, kind?: AiMessage["kind"]) {
    setAiMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), sender, text, kind }
    ].slice(-18));
  }

  function buildAiKey(command: string): string {
    const normalized = command
      .replace(/^(recuerda|recordar|consulta|consultar|busca|buscar)\s+/i, "")
      .trim()
      .normalize("NFC")
      .replace(/\s+/g, "_")
      .replace(/[^\p{L}\p{N}_-]/gu, "")
      .slice(0, 48) || "MemoriaGeneral";

    return `${activeUserId()}::Memoria::${normalized}`;
  }

  async function refreshSecondBrainGraphAfterMemorySave() {
    try {
      await loadBestSecondBrainGraph();
    } catch {
      // El autoguardado no debe bloquear el chat ni la respuesta de la IA.
    }
  }

  async function autoSaveChatTurn(input: string, responseText: string, mode = "chat", providerId = selectedAiProviderId, details?: Record<string, unknown>) {
    if (!userSettings.autoSaveMemory) return;

    const normalizedInput = normalizeUnicodeText(input.trim());
    const normalizedResponse = normalizeUnicodeText(responseText.trim());
    if (!normalizedInput || !normalizedResponse) return;

    const agent = getAgentRuntime(providerId);
    const provider = agent.provider;
    const savedAt = new Date().toISOString();
    const notebook = activeNotebookKey();
    const turnId = `${savedAt.replace(/[:.]/g, "-")}::${hashPreviewKey(`${normalizedInput}\n${normalizedResponse}`).toString(16)}`;
    const key = `${activeUserId()}::Bitacora::${notebook}::${turnId}`;
    const text = `Notebook: ${activeNotebook.trim() || "General"}\nUsuario: ${normalizedInput}\n\n${agent.name}: ${normalizedResponse}`;

    try {
      await memoryCoreClient.remember({
        userId: activeUserId(),
        key,
        text,
        payload: {
          type: "CHAT_TURN",
          mode,
          input: normalizedInput,
          response: normalizedResponse,
          agentId: agent.id,
          agentName: agent.name,
          agentRole: agent.role,
          providerId: provider.id,
          providerLabel: provider.label,
          notebook,
          notebookLabel: activeNotebook.trim() || "General",
          savedAt,
          details,
        },
        tags: ["chat", "autosave", provider.id, agent.id, mode, `notebook-${notebook}`],
        source: "chat-autosave",
      });
      await refreshSecondBrainGraphAfterMemorySave();
    } catch (error) {
      setLogs((current) => [
        { id: crypto.randomUUID(), message: `WARN :: Auto-save chat omitido: ${error instanceof Error ? error.message : "fallo desconocido"}` },
        ...current,
      ].slice(0, 14));
    }
  }

  function isExplicitZenWrite(command: string): boolean {
    return /^(recuerda|recordar|guarda|guardar|memoriza|memorizar)\b/i.test(command);
  }

  function isExplicitZenAction(command: string): boolean {
    return /^(consulta|consultar|busca|buscar|encuentra|encontrar|lista|listar|muestra|mostrar|muéstrame|muestrame|calcula|calcular|resuelve|resolver|deriva|derivar|integra|integrar)\b/i.test(command)
      || isExplicitZenWrite(command);
  }

  async function searchZenMemory(command: string): Promise<string | null> {
    const cleanQuery = command
      .replace(/^(busca|buscar|consulta|consultar|encuentra|encontrar|lista|listar|muestra|mostrar|muéstrame|muestrame)\s+/i, "")
      .trim();

    if (!cleanQuery) return null;

    const response = await queryIndexClient.search({
      query: cleanQuery,
      limit: 18,
    }) as { results?: Array<{ title: string; filename?: string; key: string; source: string; textPreview: string }> };
    const results = response.results ?? [];

    if (results.length === 0) {
      const responseText = `No encontre resultados para "${cleanQuery}" en la memoria indexada.`;
      pushAiMessage("Oraculo", responseText);
      return responseText;
    }

    const grouped = new Map<string, {
      rootKey: string;
      title: string;
      source: string;
      previews: string[];
      chunkCount: number;
    }>();

    for (const result of results) {
      const rootKey = getDocumentRootKey(result.key);
      const current = grouped.get(rootKey);
      const rawTitle = result.filename || result.title || humanizeTBitLabel(rootKey);
      const title = /^chunk_\d+$/i.test(rawTitle) ? humanizeTBitLabel(rootKey) : humanizeTBitLabel(rawTitle);
      const preview = (result.textPreview || "")
        .split("\n")
        .filter((line) => !/^chunk_\d+\b/i.test(line.trim()))
        .join("\n")
        .trim();

      if (!current) {
        grouped.set(rootKey, {
          rootKey,
          title,
          source: result.source,
          previews: preview ? [preview] : [],
          chunkCount: isChunkKey(result.key) ? 1 : 0,
        });
      } else {
        if (preview && !current.previews.includes(preview)) {
          current.previews.push(preview);
        }
        if (isChunkKey(result.key)) {
          current.chunkCount += 1;
        }
      }
    }

    const documents = Array.from(grouped.values()).slice(0, 6);
    const discovery = isFileDiscoveryQuery(command);
    const summary = documents
      .map((document, index) => {
        const chunkText = document.chunkCount > 0 ? ` (${document.chunkCount} fragmentos internos)` : "";
        if (discovery) {
          return `${index + 1}. ${document.title}${chunkText}`;
        }
        const preview = document.previews[0] || "Documento disponible en el vacío.";
        return `${index + 1}. ${document.title}${chunkText}\n${preview}`;
      })
      .join("\n\n");

    const prefix = discovery
      ? `Encontré estos documentos relacionados con "${cleanQuery}":`
      : `Resultados encontrados para "${cleanQuery}":`;
    const responseText = `${prefix}\n\n${summary}`;
    pushAiMessage("Oraculo", responseText);
    return responseText;
  }

  async function answerZenDocumentQuestion(command: string): Promise<string | null> {
    if (isFileDiscoveryQuery(command)) return null;

    const looksLikeDocumentQuestion = /\b(item|punto|numeral|apartado|seccion|sección|archivo|documento|nota|markdown|\.md)\b/i.test(command);
    if (!looksLikeDocumentQuestion) return null;

    const response = await documentQaClient.ask({
      query: command,
      limit: 6,
    });

    if (!response.ok || response.matchedMode === "not-found") {
      return null;
    }

    const citation = response.citations[0]?.label ? `\n\nFuente: ${response.citations[0].label}` : "";
    const source = response.filename || response.title || response.documentKey || "documento";
    const responseText = `${source}\n${response.answer}${citation}`;
    pushAiMessage("Oraculo", responseText);
    return responseText;
  }

  function compactAiResponse(text: string, maxLength = 900): string {
    const normalized = normalizeUnicodeText(text)
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    return normalized.length > maxLength ? `${normalized.slice(0, maxLength).trim()}...` : normalized;
  }

  function buildConsensusResponse(command: string, results: MultiAiResult[]): string {
    const successful = results.filter((result) => result.ok);
    const failed = results.filter((result) => !result.ok);
    const header = `Consulta Multi-IA para "${command}"\nRespuestas validas: ${successful.length}/${results.length}`;
    const responses = successful
      .map((result, index) => `${index + 1}. ${result.providerLabel} (${result.model})\n${compactAiResponse(result.text)}`)
      .join("\n\n");
    const failures = failed.length
      ? `\n\nProveedores sin respuesta:\n${failed.map((result) => `- ${result.providerLabel}: ${result.error ?? "fallo desconocido"}`).join("\n")}`
      : "";
    const synthesis = successful.length > 1
      ? "\n\nSintesis T-BIT:\nSe consultaron varias IAs configuradas y se agruparon sus respuestas en una sola bitacora verificable. Usa cada bloque por proveedor como evidencia primaria antes de tomar una decision."
      : "";
    return `${header}\n\n${responses || "No hubo respuestas validas."}${synthesis}${failures}`;
  }

  function formatConsensusTranscript(results: MultiAiResult[]): string {
    return results.map((result, index) => [
      `### ${index + 1}. ${result.providerLabel} (${result.model})`,
      result.ok ? result.text : `ERROR: ${result.error ?? "sin respuesta"}`,
    ].join("\n")).join("\n\n");
  }

  function selectConsensusJudge(agents: AiAgentRuntime[]): AiAgentRuntime {
    return agents.find((agent) => agent.id === selectedAiProviderId) ?? agents[0];
  }

  async function askConsensusProvider(
    agent: AiAgentRuntime,
    message: string,
    sessionSuffix: string,
  ): Promise<MultiAiResult> {
    const prompt = buildAgentMessage(message, agent);
    const response = await tbitChatClient.sendMessage(
      `tbit-ui-main-${agent.id}-${sessionSuffix}`,
      prompt,
      selectedProviderConfig(agent.id),
      activeUserId(),
    );

    if (!response.ok) {
      throw new Error(response.error ?? "Proveedor sin respuesta.");
    }

    return {
      providerId: agent.id,
      providerLabel: agent.name,
      model: agent.draft.model || agent.provider.defaultModel,
      ok: true,
      text: response.data ?? "Operacion completada.",
      response,
    };
  }

  function settledConsensusResults(
    settled: PromiseSettledResult<MultiAiResult>[],
    agents: AiAgentRuntime[],
  ): MultiAiResult[] {
    return settled.map((item, index): MultiAiResult => {
      const agent = agents[index];
      if (item.status === "fulfilled") return item.value;
      return {
        providerId: agent.id,
        providerLabel: agent.name,
        model: agent.draft.model || agent.provider.defaultModel,
        ok: false,
        text: "",
        error: item.reason instanceof Error ? item.reason.message : "Proveedor sin respuesta.",
      };
    });
  }

  async function runMultiAiConsensus(command: string): Promise<string | null> {
    const providers = getConsensusAgents();
    if (!userSettings.multiAiConsensus || providers.length < 2) {
      return null;
    }

    const roundOnePrompt = multiAiMode === "fast"
      ? command
      : [
        "[T-BIT MULTI-IA / RONDA 1]",
        "Rol: agente proponente independiente.",
        "Responde la pregunta del usuario con precision, claridad y sin inventar datos.",
        "Si necesitas contexto almacenado, usa lo que el sistema te entregue; si no existe, dilo.",
        "",
        `Pregunta del usuario: ${command}`,
      ].join("\n");

    const roundOne = settledConsensusResults(
      await Promise.allSettled(providers.map((provider) => askConsensusProvider(provider, roundOnePrompt, "round-1"))),
      providers,
    );

    if (!roundOne.some((result) => result.ok)) {
      throw new Error("Ninguna IA configurada respondio en modo Multi-IA.");
    }

    let responseText = buildConsensusResponse(command, roundOne);
    let details: Record<string, unknown> = {
      mode: multiAiMode,
      notebook: activeNotebookKey(),
      providers: roundOne.map((result) => ({
        providerId: result.providerId,
        providerLabel: result.providerLabel,
        model: result.model,
        ok: result.ok,
        error: result.error,
        text: result.text,
      })),
    };

    if (multiAiMode === "deliberative") {
      const activeProviders = providers.filter((_, index) => roundOne[index]?.ok);
      const revisionPrompt = [
        "[T-BIT MULTI-IA / RONDA 2]",
        "Lee las respuestas de los demas agentes. Ajusta tu respuesta solo si encuentras mejoras reales.",
        "Entrega una version revisada, concreta y util para el usuario.",
        "",
        `Pregunta original: ${command}`,
        "",
        formatConsensusTranscript(roundOne),
      ].join("\n");

      const revisions = settledConsensusResults(
        await Promise.allSettled(activeProviders.map((provider) => askConsensusProvider(provider, revisionPrompt, "round-2"))),
        activeProviders,
      );
      const judge = selectConsensusJudge(providers);
      const judgePrompt = [
        "[T-BIT MULTI-IA / JUEZ DELIBERATIVO]",
        "Actua como arbitro neutral. Sintetiza una unica respuesta final para el usuario.",
        "Conserva los acuerdos, descarta contradicciones y evita mostrar metadatos internos.",
        "",
        `Pregunta original: ${command}`,
        "",
        "Respuestas revisadas:",
        formatConsensusTranscript(revisions.some((result) => result.ok) ? revisions : roundOne),
      ].join("\n");

      try {
        responseText = (await askConsensusProvider(judge, judgePrompt, "judge-deliberative")).text;
        details = { ...details, roundOne, revisions, judgeProviderId: judge.id };
      } catch {
        responseText = buildConsensusResponse(command, revisions.some((result) => result.ok) ? revisions : roundOne);
        details = { ...details, roundOne, revisions, judgeProviderId: judge.id, judgeFallback: true };
      }
    }

    if (multiAiMode === "critical") {
      const critiquePrompt = [
        "[T-BIT MULTI-IA / RONDA CRITICA]",
        "Rol: agente critico. No respondas al usuario directamente.",
        "Busca fallos de logica, contradicciones, supuestos no justificados, datos posiblemente desactualizados y riesgos.",
        "Entrega observaciones breves y accionables.",
        "",
        `Pregunta original: ${command}`,
        "",
        formatConsensusTranscript(roundOne),
      ].join("\n");

      const critiques = settledConsensusResults(
        await Promise.allSettled(providers.map((provider) => askConsensusProvider(provider, critiquePrompt, "critique"))),
        providers,
      );
      const judge = selectConsensusJudge(providers);
      const judgePrompt = [
        "[T-BIT MULTI-IA / JUEZ CRITICO]",
        "Actua como sintetizador final. Usa las respuestas iniciales y las criticas para entregar una respuesta unica, prudente y clara.",
        "No imprimas código interno ni detalles técnicos del debate salvo que ayuden al usuario.",
        "",
        `Pregunta original: ${command}`,
        "",
        "Respuestas iniciales:",
        formatConsensusTranscript(roundOne),
        "",
        "Criticas:",
        formatConsensusTranscript(critiques),
      ].join("\n");

      try {
        responseText = (await askConsensusProvider(judge, judgePrompt, "judge-critical")).text;
        details = { ...details, roundOne, critiques, judgeProviderId: judge.id };
      } catch {
        responseText = buildConsensusResponse(command, roundOne);
        details = { ...details, roundOne, critiques, judgeProviderId: judge.id, judgeFallback: true };
      }
    }

    pushAiMessage("Oraculo", responseText);
    await autoSaveChatTurn(command, responseText, `multi_ai_${multiAiMode}`, "deterministic", details);
    return responseText;
  }

  async function handleAiCommand() {
    const command = normalizeUnicodeText(aiInput.trim());

    if (!command || !requireApiKey()) {
      return;
    }

    pushAiMessage("T-User", command);
    setAiInput("");
    setAiIsThinking(true);

    try {
      const activeProviderDescriptor = getProviderDescriptor();
      const activeAgent = getAgentRuntime();
      const agentCommand = buildAgentMessage(command, activeAgent);

      if (isZenMode && !isExplicitZenWrite(command)) {
        const documentAnswered = await answerZenDocumentQuestion(command);
        if (documentAnswered) {
          await autoSaveChatTurn(command, documentAnswered, "document_qa");
          return;
        }

        if (isExplicitZenAction(command) && /^(consulta|consultar|busca|buscar|encuentra|encontrar|lista|listar|muestra|mostrar|muéstrame|muestrame)/i.test(command)) {
          const handled = await searchZenMemory(command);
          if (handled) {
            await autoSaveChatTurn(command, handled, "query_index");
            return;
          }
        }
      }

      const consensusResponse = await runMultiAiConsensus(command);
      if (consensusResponse) return;

      if (activeProviderDescriptor.id !== "deterministic") {
        const response = await tbitChatClient.sendMessage(`tbit-ui-main-${activeAgent.id}`, agentCommand, selectedProviderConfig(), activeUserId());

        if (!response.ok) {
          throw new Error(response.error ?? "Error en proveedor IA.");
        }

        if (response.providerInfo) {
          setAiProviderInfo(response.providerInfo);
        }
        const responseText = response.data ?? "Operacion completada.";
        pushAiMessage("Oraculo", responseText);
        // Tanda 2 — Visibilidad del eslabon determinista: si la respuesta no
        // provino de ninguna IA (proveedores agotados/enfriamiento), se avisa
        // de forma explicita para no confundirla con una respuesta de IA.
        if (response.deterministicFallback) {
          pushAiMessage(
            "Oraculo",
            "⚠️ AVISO T-BIT: esta respuesta proviene del ESLABON DETERMINISTA LOCAL (reglas fijas, sin modelo de IA). Los proveedores de IA configurados fallaron, agotaron cuota o estan en enfriamiento. La respuesta puede ser limitada y no debe tratarse como generada por IA.",
            "deterministic-notice",
          );
        }
        await autoSaveChatTurn(command, responseText, "provider_chat");

        const coordinates = response.meta?.coordinates ?? response.meta?.coordenadas;
        if (coordinates) {
          const antiCoordinates = response.meta?.antiCoordinates ?? response.meta?.antiCoordenadas ?? coordinates.map((value) => -value) as [number, number, number];
          const vit: Vit = {
            id: crypto.randomUUID(),
            key: response.meta?.key ?? "TBIT::AI::Operacion",
            data: response.data ?? "",
            position: coordinates,
            antiPosition: antiCoordinates,
            offsetV: 0,
            offsetAntiV: 0,
            createdAt: new Date().toLocaleTimeString("es-CO", {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit"
            })
          };
          upsertAiVit(vit);
          setCurrentUniverse("ai");
          setActiveQueryLine({
            from: [0, 0, 0],
            to: vit.position,
            startedAt: performance.now()
          });
          window.setTimeout(() => setActiveQueryLine(null), 3200);
        }
        return;
      }

      if (isZenMode && !isExplicitZenAction(command)) {
        const handled = await searchZenMemory(`buscar ${command}`);
        if (handled) {
          await autoSaveChatTurn(command, handled, "query_index");
          return;
        }
      }

      const isQuery = /^(consulta|consultar|busca|buscar)/i.test(command);
      const isComputation = /^(calcula|calcular|resuelve|resolver)/i.test(command);
      const equationKey = inferEquationKey(command);

      if (!isQuery && !isComputation && equationKey) {
        const definition = buildEinsteinEnergyMassEquation();
        const payloadText = JSON.stringify(definition.payload, null, 2);
        const response = await fetch(`${API_URL}/ai/inject`, {
          method: "POST",
          headers: buildApiHeaders(),
          body: JSON.stringify({
            key: `${definition.dominio}::${definition.coleccion}::${definition.id_concepto}`,
            payload: payloadText
          })
        });
        const payload = await response.json();

        if (!response.ok || !payload.ok) {
          throw new Error(payload.error ?? "No se pudo memorizar la ecuacion.");
        }

        const vit = vitFromApiPayload(payload, payloadText);
        upsertAiVit(vit);
        setCurrentUniverse("ai");
        const responseText = `Ecuacion computable guardada: ${definition.payload.nombre}.`;
        pushAiMessage("Oraculo", responseText);
        await autoSaveChatTurn(command, responseText, "equation_memory");
        return;
      }

      if (isComputation && equationKey) {
        const mass = extractNumericVariable(command, "m");

        if (mass === undefined) {
          throw new Error("Indica una masa numerica. Ej: calcula energia para masa de 5 kg.");
        }

        const response = await fetch(`${API_URL}/ai/oracle`, {
          method: "POST",
          headers: buildApiHeaders(),
          body: JSON.stringify({ key: equationKey })
        });
        const payload = await response.json();

        if (!response.ok || !payload.ok) {
          throw new Error(payload.error ?? "No se encontro la ecuacion computable.");
        }

        const equation = JSON.parse(payload.dato);
        const result = evaluateEquation(equation, { m: mass });
        const vit = vitFromApiPayload(payload, payload.dato);
        upsertAiVit(vit);
        setCurrentUniverse("ai");
        setActiveQueryLine({
          from: [0, 0, 0],
          to: vit.position,
          startedAt: performance.now()
        });
        window.setTimeout(() => setActiveQueryLine(null), 3200);
        const responseText = `${equation.nombre}: ${equation.expresion_latex}\n${result.variable} = ${result.value.toExponential(6)} ${result.unit ?? ""}`.trim();
        pushAiMessage("Oraculo", responseText);
        await autoSaveChatTurn(command, responseText, "symbolic_computation");
        return;
      }

      const key = scopeUserKey(inferirClaveConsulta(command));

      if (isQuery) {
        const response = await fetch(`${API_URL}/ai/oracle`, {
          method: "POST",
          headers: buildApiHeaders(),
          body: JSON.stringify({ key })
        });
        const payload = await response.json();

        if (!response.ok || !payload.ok) {
          throw new Error(payload.error ?? "El Oraculo no encontro esa memoria.");
        }

        const vit = vitFromApiPayload(payload, payload.dato);
        upsertAiVit(vit);
        setCurrentUniverse("ai");
        setActiveQueryLine({
          from: [0, 0, 0],
          to: vit.position,
          startedAt: performance.now()
        });
        window.setTimeout(() => setActiveQueryLine(null), 3200);
        const responseText = `Esto fue lo que encontre:\n${payload.dato}`;
        pushAiMessage("Oraculo", responseText);
        await autoSaveChatTurn(command, responseText, "oracle_query");
        return;
      }

      const semanticMemory = construirMemoriaSemantica(command);
      const payloadText = JSON.stringify(semanticMemory.payload, null, 2);
      const semanticKey = scopeUserKey(semanticMemory.key);
      const response = await fetch(`${API_URL}/ai/inject`, {
        method: "POST",
        headers: buildApiHeaders(),
        body: JSON.stringify({
          key: semanticKey,
          payload: payloadText
        })
      });
      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "No se pudo memorizar en el vacío.");
      }

      const vit = vitFromApiPayload(payload, payloadText);
      upsertAiVit(vit);
      setCurrentUniverse("ai");
      const responseText = "Listo. Guarde esa memoria en tu vacío T-BIT y quedo verificada.";
      pushAiMessage("Oraculo", responseText);
      await autoSaveChatTurn(command, responseText, "explicit_memory_write");
    } catch (error) {
      pushAiMessage("Oraculo", formatUserFacingAiError(error, selectedAgentRuntime.name));
    } finally {
      setAiIsThinking(false);
    }
  }

  function buildDatabaseKey(): string {
    return `${normalizeTBitKey(dbDomain)}::${normalizeTBitKey(dbCollection)}::${normalizeTBitKey(dbIdentifier)}`;
  }

  function getActiveKey(): string {
    return interfaceMode === "database" || interfaceMode === "wizard" ? buildDatabaseKey() : normalizeTBitKey(keyInput);
  }

  function updateWizardAttribute(id: string, field: "clave" | "valor", value: string) {
    setWizardAttributes((current) => (
      current.map((attribute) => (
        attribute.id === id ? { ...attribute, [field]: value } : attribute
      ))
    ));
  }

  function addWizardAttribute() {
    setWizardAttributes((current) => [
      ...current,
      { id: crypto.randomUUID(), clave: "", valor: "" }
    ]);
  }

  function buildWizardDocument(): string {
    const documentObject = wizardAttributes.reduce<Record<string, string>>((result, attribute) => {
      const key = normalizeUnicodeText(attribute.clave.trim());
      const value = normalizeUnicodeText(attribute.valor.trim());

      if (key && value) {
        result[key] = value;
      }

      return result;
    }, {});

    return JSON.stringify(documentObject, null, 2);
  }

  async function injectIntoVoid(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (interfaceMode === "database" || interfaceMode === "wizard") {
      await injectDatabaseNode();
      return;
    }

    if (!requireApiKey()) {
      return;
    }

    const normalizedKey = normalizeTBitKey(keyInput);
    const normalizedData = normalizeUnicodeText(dataInput.trim());
    if (!normalizedKey) {
      setLogs((current) => [
        { id: crypto.randomUUID(), message: "ERROR :: Dato Clave requerido" },
        ...current
      ]);
      return;
    }

    if (!normalizedData) {
      setLogs((current) => [
        { id: crypto.randomUUID(), message: "ERROR :: Dato de carga requerido" },
        ...current
      ]);
      return;
    }

    setIsInjecting(true);

    try {
      const serverResponse = await fetch(`${API_URL}/inyectar`, {
        method: "POST",
        headers: buildApiHeaders(),
        body: JSON.stringify({
          clave: normalizedKey,
          dato: normalizedData
        })
      });

      const payload = await serverResponse.json();

      if (!serverResponse.ok || !payload.ok) {
        throw new Error(payload.error ?? "La API rechazo la inyeccion.");
      }

      const position = payload.coordinates as [number, number, number];
      const antiPosition = payload.antiCoordinates as [number, number, number];
      const timestamp = new Date().toLocaleTimeString("es-CO", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      });

      const vit: Vit = {
        id: crypto.randomUUID(),
        key: normalizedKey,
        data: normalizedData,
        position,
        antiPosition,
        offsetV: payload.offsetV,
        offsetAntiV: payload.offsetAntiV,
        createdAt: timestamp
      };

      upsertVit(vit);
      setLogs((current) => [
        { id: crypto.randomUUID(), message: "[+] ESCRITURA FISICA CONFIRMADA EN SECTOR" },
        { id: crypto.randomUUID(), message: `${timestamp} :: VIT ${normalizedKey}` },
        { id: crypto.randomUUID(), message: `SECTOR-V :: ${payload.offsetV}` },
        { id: crypto.randomUUID(), message: `SECTOR-ANTI-V :: ${payload.offsetAntiV}` },
        { id: crypto.randomUUID(), message: `COORD-V :: ${formatVector(position)}` },
        { id: crypto.randomUUID(), message: `COORD-ANTI-V :: ${formatVector(antiPosition)}` },
        ...current
      ].slice(0, 14));
    } catch (error) {
      setLogs((current) => [
        {
          id: crypto.randomUUID(),
          message: `ERROR :: ${error instanceof Error ? error.message : "Fallo de enlace con API"}`
        },
        ...current
      ].slice(0, 14));
    } finally {
      setIsInjecting(false);
    }
  }

  async function injectDatabaseNode() {
    const domain = normalizeTBitKey(dbDomain);
    const collection = normalizeTBitKey(dbCollection);
    const identifier = normalizeTBitKey(dbIdentifier);
    const document = interfaceMode === "wizard" ? buildWizardDocument() : normalizeUnicodeText(dbDocument.trim());

    if (!domain || !collection || !identifier) {
      setLogs((current) => [
        { id: crypto.randomUUID(), message: "ERROR :: Jerarquia T-DB incompleta" },
        ...current
      ]);
      return;
    }

    if (!document) {
      setLogs((current) => [
        { id: crypto.randomUUID(), message: "ERROR :: Documento JSON requerido" },
        ...current
      ]);
      return;
    }

    if (interfaceMode === "wizard" && document === "{}") {
      setLogs((current) => [
        { id: crypto.randomUUID(), message: "ERROR :: Agrega al menos un atributo con valor" },
        ...current
      ]);
      return;
    }

    if (interfaceMode === "database") {
      try {
        JSON.parse(document);
      } catch {
        setLogs((current) => [
          { id: crypto.randomUUID(), message: "ERROR :: Documento JSON invalido" },
          ...current
        ]);
        return;
      }
    }

    if (!requireApiKey()) {
      return;
    }

    const claveMaestra = `${domain}::${collection}::${identifier}`;
    setKeyInput(claveMaestra);
    setIsInjecting(true);

    try {
      const serverResponse = await fetch(`${API_URL}/inyectar`, {
        method: "POST",
        headers: buildApiHeaders(),
        body: JSON.stringify({
          clave: claveMaestra,
          dato: document
        })
      });

      const payload = await serverResponse.json();

      if (!serverResponse.ok || !payload.ok) {
        throw new Error(payload.error ?? "La API rechazo el nodo fractal.");
      }

      const position = payload.coordinates as [number, number, number];
      const antiPosition = payload.antiCoordinates as [number, number, number];
      const timestamp = new Date().toLocaleTimeString("es-CO", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      });

      const vit: Vit = {
        id: crypto.randomUUID(),
        key: claveMaestra,
        data: document,
        position,
        antiPosition,
        offsetV: payload.offsetV,
        offsetAntiV: payload.offsetAntiV,
        createdAt: timestamp
      };

      upsertVit(vit);
      if (interfaceMode === "wizard") {
        setDbIdentifier("");
        setWizardAttributes((current) => (
          current.map((attribute) => ({ ...attribute, valor: "" }))
        ));
      }
      setLogs((current) => [
        { id: crypto.randomUUID(), message: "CONSTRUYENDO ARQUITECTURA FRACTAL..." },
        { id: crypto.randomUUID(), message: `NODO RAIZ: ${domain}` },
        { id: crypto.randomUUID(), message: `SUB-NODO: ${collection}` },
        { id: crypto.randomUUID(), message: `ENTIDAD: ${identifier}` },
        { id: crypto.randomUUID(), message: "[SUCCESS] REGISTRO DE BASE DE DATOS GUARDADO EN COORDENADA ESPACIAL." },
        { id: crypto.randomUUID(), message: `CLAVE-MAESTRA :: ${claveMaestra}` },
        ...current
      ].slice(0, 14));
    } catch (error) {
      setLogs((current) => [
        {
          id: crypto.randomUUID(),
          message: `ERROR :: ${error instanceof Error ? error.message : "Fallo de inyeccion fractal"}`
        },
        ...current
      ].slice(0, 14));
    } finally {
      setIsInjecting(false);
    }
  }

  async function recoverFromVoid() {
    const normalizedKey = normalizeTBitKey(getActiveKey());

    if (!normalizedKey) {
      setLogs((current) => [
        { id: crypto.randomUUID(), message: "ERROR :: Dato Clave requerido para recuperacion" },
        ...current
      ]);
      return;
    }

    if (!requireApiKey()) {
      return;
    }

    setIsRecovering(true);
    setLogs((current) => [
      { id: crypto.randomUUID(), message: "INICIANDO SALTO O(1) A COORDENADA..." },
      ...current
    ].slice(0, 14));

    try {
      const serverResponse = await fetch(`${API_URL}/recuperar`, {
        method: "POST",
        headers: buildApiHeaders(),
        body: JSON.stringify({
          clave: normalizedKey
        })
      });

      const payload = await serverResponse.json();

      if (!serverResponse.ok || !payload.ok || payload.integridadValida !== true) {
        throw new Error(payload.error ?? "La integridad no pudo confirmarse.");
      }

      const position = payload.coordinates as [number, number, number];
      const antiPosition = payload.antiCoordinates as [number, number, number];
      const timestamp = new Date().toLocaleTimeString("es-CO", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      });

      const vit: Vit = {
        id: crypto.randomUUID(),
        key: normalizedKey,
        data: payload.dato,
        position,
        antiPosition,
        offsetV: payload.offsetV,
        offsetAntiV: payload.offsetAntiV,
        createdAt: timestamp
      };

      upsertVit(vit);
      setRecoveredData({
        clave: normalizedKey,
        dato: payload.dato,
        integridadValida: payload.integridadValida
      });
      setLogs((current) => [
        { id: crypto.randomUUID(), message: "INICIANDO SALTO O(1) A COORDENADA..." },
        { id: crypto.randomUUID(), message: "LEYENDO VECTOR (V)... OK" },
        { id: crypto.randomUUID(), message: "LEYENDO ANTI-VECTOR (-V)... OK" },
        { id: crypto.randomUUID(), message: "CALCULANDO INTEGRIDAD: V + (-V) = 0" },
        { id: crypto.randomUUID(), message: "[SUCCESS] INTEGRIDAD CUÁNTICA CONFIRMADA. DATOS SEGUROS." },
        ...current.filter((log) => log.message !== "INICIANDO SALTO O(1) A COORDENADA...")
      ].slice(0, 14));
    } catch (error) {
      setRecoveredData({
        clave: normalizedKey,
        dato: "",
        integridadValida: false
      });
      setLogs((current) => [
        {
          id: crypto.randomUUID(),
          message: `ERROR :: ${error instanceof Error ? error.message : "Fallo de recuperacion"}`
        },
        ...current
      ].slice(0, 14));
    } finally {
      setIsRecovering(false);
    }
  }

  async function collapseData() {
    const normalizedKey = normalizeTBitKey(getActiveKey());

    if (!normalizedKey) {
      setLogs((current) => [
        { id: crypto.randomUUID(), message: "ERROR :: Dato Clave requerido para colapso" },
        ...current
      ]);
      return;
    }

    if (!requireApiKey()) {
      return;
    }

    setIsCollapsing(true);
    setLogs((current) => [
      { id: crypto.randomUUID(), message: "INICIANDO PROTOCOLO DE COLAPSO..." },
      ...current
    ].slice(0, 14));

    try {
      const serverResponse = await fetch(`${API_URL}/colapsar`, {
        method: "DELETE",
        headers: buildApiHeaders(),
        body: JSON.stringify({
          clave: normalizedKey
        })
      });

      const payload = await serverResponse.json();

      if (!serverResponse.ok || !payload.ok) {
        throw new Error(payload.error ?? "El protocolo de colapso fue rechazado.");
      }

      setVits((current) => current.filter((vit) => vit.key !== normalizedKey));
      setHighlightedVitId(undefined);
      setFocusTarget(undefined);
      setRecoveredData((current) => (
        current?.clave === normalizedKey
          ? { clave: normalizedKey, dato: "", integridadValida: false }
          : current
      ));
      setLogs((current) => [
        { id: crypto.randomUUID(), message: "INICIANDO PROTOCOLO DE COLAPSO..." },
        { id: crypto.randomUUID(), message: "CALCULANDO TRAYECTORIA DE ANIQUILACIÓN..." },
        { id: crypto.randomUUID(), message: "SOBREESCRIBIENDO SECTORES FÍSICOS CON CEROS ABSOLUTOS (0x00)..." },
        { id: crypto.randomUUID(), message: "[SUCCESS] ANULACIÓN CUÁNTICA COMPLETADA. RASTRO ELIMINADO." },
        ...current.filter((log) => log.message !== "INICIANDO PROTOCOLO DE COLAPSO...")
      ].slice(0, 14));
    } catch (error) {
      setLogs((current) => [
        {
          id: crypto.randomUUID(),
          message: `ERROR :: ${error instanceof Error ? error.message : "Fallo de colapso"}`
        },
        ...current
      ].slice(0, 14));
    } finally {
      setIsCollapsing(false);
    }
  }

  async function querySpecificAttribute() {
    const normalizedKey = normalizeTBitKey(getActiveKey());
    const attribute = normalizeUnicodeText(queryAttribute.trim());
    const coordinateLabel = interfaceMode === "raw" ? normalizedKey : dbIdentifier.trim();

    if (!normalizedKey) {
      setLogs((current) => [
        { id: crypto.randomUUID(), message: "ERROR :: Clave requerida para consulta de atributo" },
        ...current
      ]);
      return;
    }

    if (!requireApiKey()) {
      return;
    }

    if (!attribute) {
      setQueryResult({
        attribute: "",
        error: "ERROR: Ingresa un atributo a consultar."
      });
      return;
    }

    setLogs((current) => [
      { id: crypto.randomUUID(), message: `BUSCANDO PROPIEDAD ${attribute} EN COORDENADA ${coordinateLabel}...` },
      ...current
    ].slice(0, 14));

    try {
      const serverResponse = await fetch(`${API_URL}/recuperar`, {
        method: "POST",
        headers: buildApiHeaders(),
        body: JSON.stringify({
          clave: normalizedKey
        })
      });

      const payload = await serverResponse.json();

      if (!serverResponse.ok || !payload.ok || payload.integridadValida !== true) {
        throw new Error(payload.error ?? "La integridad no pudo confirmarse.");
      }

      const documentObject = JSON.parse(payload.dato) as Record<string, unknown>;
      const hasAttribute = Object.prototype.hasOwnProperty.call(documentObject, attribute);

      if (!hasAttribute) {
        const error = `ERROR: El atributo '${attribute}' no existe en este registro.`;
        setQueryResult({ attribute, error });
        setLogs((current) => [
          { id: crypto.randomUUID(), message: `ERROR :: El atributo ${attribute} no existe en este registro.` },
          ...current
        ].slice(0, 14));
        return;
      }

      const rawValue = documentObject[attribute];
      const value = typeof rawValue === "string" ? rawValue : JSON.stringify(rawValue);
      const position = payload.coordinates as [number, number, number];
      const antiPosition = payload.antiCoordinates as [number, number, number];
      const vit: Vit = {
        id: crypto.randomUUID(),
        key: normalizedKey,
        data: payload.dato,
        position,
        antiPosition,
        offsetV: payload.offsetV,
        offsetAntiV: payload.offsetAntiV,
        createdAt: new Date().toLocaleTimeString("es-CO", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit"
        })
      };

      upsertVit(vit);
      setRecoveredData({
        clave: normalizedKey,
        dato: payload.dato,
        integridadValida: true
      });
      setQueryResult({ attribute, value });
      setLogs((current) => [
        { id: crypto.randomUUID(), message: `BUSCANDO PROPIEDAD ${attribute} EN COORDENADA ${coordinateLabel}...` },
        { id: crypto.randomUUID(), message: "ACCESO O(1) EXITOSO..." },
        { id: crypto.randomUUID(), message: "EXTRACCIÓN COMPLETADA." },
        ...current.filter((log) => !log.message.startsWith(`BUSCANDO PROPIEDAD ${attribute} EN COORDENADA`))
      ].slice(0, 14));
    } catch (error) {
      const message = error instanceof SyntaxError
        ? "ERROR: El documento recuperado no es JSON valido."
        : `ERROR: ${error instanceof Error ? error.message : "Fallo de consulta"}`;

      setQueryResult({ attribute, error: message });
      setLogs((current) => [
        { id: crypto.randomUUID(), message },
        ...current
      ].slice(0, 14));
    }
  }

  const activeVit = renderableVits[0];
  const selectedAgentRuntime = getAgentRuntime();
  const selectedProviderDescriptor = getProviderDescriptor();
  const selectedProviderDraft = getProviderDraft();
  const connectedAgents = [
    ...aiAgentInstances.map((instance) => {
      const runtime = getAgentRuntime(instance.id);
      return {
        id: instance.id,
        name: instance.name,
        detail: `${runtime.provider.label} · ${instance.notebook || "General"}`,
        protocol: runtime.provider.protocol,
        active: instance.id === selectedAiProviderId,
        configured: runtime.configured,
        isInstance: true,
        enabled: instance.enabled,
        participates: instance.enabled && runtime.configured && runtime.provider.id !== "deterministic",
      };
    }),
    ...aiProviderCatalog.map((provider) => {
    const draft = getProviderDraft(provider.id);
    return {
      ...provider,
      id: provider.id,
      name: provider.label,
      detail: draft.model || provider.defaultModel,
      protocol: provider.protocol,
      active: provider.id === selectedAiProviderId,
      configured: isProviderConfigured(provider, draft),
      isInstance: false,
      enabled: true,
      participates: aiAgentInstances.length === 0 && provider.id !== "deterministic" && isProviderConfigured(provider, draft),
    };
  })];
  const consensusPreviewAgents = userSettings.multiAiConsensus ? getConsensusAgents() : [];
  const activeAgentName = selectedAgentRuntime.name;
  const allPreviewNodes = useMemo<SecondBrainPreviewNode[]>(() => {
    const liveNodes: SecondBrainPreviewNode[] = renderableVits
      .map((vit): SecondBrainPreviewNode | null => {
        if (!isFiniteVector3(vit.position)) return null;
        const antiPosition = isFiniteVector3(vit.antiPosition) ? vit.antiPosition : invertVector3(vit.position);
        return {
          id: vit.id,
          key: vit.key,
          label: humanizeTBitLabel(vit.key),
          position: vit.position,
          antiPosition,
          kind: "live" as const,
          chunkCount: 0,
        };
      })
      .filter((node): node is SecondBrainPreviewNode => node !== null);

    const documents = new Map<string, SecondBrainPreviewNode>();

    for (const node of memoryGraph?.nodes ?? []) {
      const rootKey = getDocumentRootKey(node?.key);
      if (!rootKey) continue;

      const existing = documents.get(rootKey);
      if (existing) {
        if (isChunkKey(node?.key)) existing.chunkCount += 1;
        continue;
      }

      const position = previewCoordinatesForKey(rootKey);
      const nodeTags = node.tags ?? [];
      const isChatMemory = isChatMemoryKey(rootKey, node.source, nodeTags);
      documents.set(rootKey, {
        id: rootKey,
        key: rootKey,
        label: humanizeTBitLabel(rootKey),
        position,
        antiPosition: invertVector3(position),
        kind: isChatMemory ? "chat" : "memory",
        source: node.source,
        tags: nodeTags,
        chunkCount: isChunkKey(node?.key) ? 1 : 0,
      });
    }

    const documentKeys = new Set(documents.keys());
    return [
      ...Array.from(documents.values()),
      ...liveNodes.filter((node) => !documentKeys.has(node.key)),
    ];
  }, [renderableVits, memoryGraph]);
  const previewNodes = useMemo<SecondBrainPreviewNode[]>(() => (
    allPreviewNodes
      .filter((node) => {
        if (node.kind === "live") return qVaultLayerFilters.live;
        if (node.kind === "chat") return qVaultLayerFilters.chats;
        if (node.chunkCount > 0) return qVaultLayerFilters.documents;
        return qVaultLayerFilters.memories;
      })
      .slice(0, 420)
  ), [allPreviewNodes, qVaultLayerFilters.chats, qVaultLayerFilters.documents, qVaultLayerFilters.live, qVaultLayerFilters.memories]);
  const previewLinks = useMemo<SecondBrainPreviewLink[]>(() => {
    if (!memoryGraph || previewNodes.length === 0 || !qVaultLayerFilters.links) return [];
    const rootByKey = new Map<string, (typeof previewNodes)[number]>();
    for (const node of previewNodes) {
      rootByKey.set(node.key, node);
    }

    return memoryGraph.links
      .map((link) => {
        const sourceKey = getDocumentRootKey(link.sourceKey);
        const targetKey = getDocumentRootKey(link.targetKey);
        if (sourceKey === targetKey) return null;
        const source = rootByKey.get(sourceKey);
        const target = rootByKey.get(targetKey);
        if (!source || !target) return null;
        return {
          id: `${sourceKey}->${targetKey}:${link.type}`,
          source,
          target,
          type: link.type,
        };
      })
      .filter((link): link is NonNullable<typeof link> => Boolean(link))
      .slice(0, 36);
  }, [memoryGraph, previewNodes, qVaultLayerFilters.links]);
  const semanticActiveKeySet = useMemo(() => new Set(semanticActiveKeys), [semanticActiveKeys]);

  function toggleQVaultLayer(layer: keyof QVaultLayerFilters) {
    setQVaultLayerFilters((current) => ({
      ...current,
      [layer]: !current[layer],
    }));
  }

  function focusSemanticResult(result: SemanticSearchResult) {
    const targetNode = allPreviewNodes.find((node) => node.key === result.rootKey || node.key === result.key);
    const position = targetNode?.position ?? previewCoordinatesForKey(result.rootKey || result.key);
    const targetId = targetNode?.id ?? result.rootKey ?? result.key;
    setSemanticActiveKeys([result.rootKey, result.key, ...result.matchedKeys].filter(Boolean));
    setFocusTarget({ id: targetId, position, startedAt: performance.now() });
    setSecondBrainMapStatus(`Vecindario semantico enfocado: ${result.title}.`);
  }

  async function runSemanticSearch(event?: FormEvent) {
    event?.preventDefault();
    const query = normalizeUnicodeText(semanticQuery.trim());
    if (!query) {
      setSemanticStatus("Escribe una idea, tema o pregunta para buscar por significado.");
      return;
    }

    setIsSemanticSearching(true);
    setSemanticStatus("Calculando distancia semantica...");
    try {
      const response = await semanticIndexClient.search({
        query,
        userId: activeUserId(),
        limit: 8,
      });
      setSemanticResults(response.results);
      const keys = response.results.flatMap((result) => [result.rootKey, result.key, ...result.matchedKeys]);
      setSemanticActiveKeys(Array.from(new Set(keys.filter(Boolean))));
      setSemanticStatus(
        response.results.length > 0
          ? `Vecindario listo: ${response.results.length} resultado${response.results.length === 1 ? "" : "s"} con ${response.index.model}.`
          : "No se encontraron vecinos semanticos para esta consulta.",
      );
      if (response.results[0]) {
        focusSemanticResult(response.results[0]);
      }
    } catch (error) {
      setSemanticStatus(error instanceof Error ? error.message : "No se pudo ejecutar la busqueda semantica.");
    } finally {
      setIsSemanticSearching(false);
    }
  }

  async function rebuildSemanticSearchIndex() {
    setIsSemanticSearching(true);
    setSemanticStatus("Reconstruyendo indice semantico...");
    try {
      const response = await semanticIndexClient.rebuild();
      setSemanticStatus(`Indice semantico listo: ${response.index.totalRecords} entradas con ${response.index.model}.`);
    } catch (error) {
      setSemanticStatus(error instanceof Error ? error.message : "No se pudo reconstruir el indice semantico.");
    } finally {
      setIsSemanticSearching(false);
    }
  }
  const selfNavigation = [
    { id: "chat", label: "Mission Control", icon: Brain },
    { id: "documents", label: "Notebook", icon: Notebook },
    { id: "assets", label: "Files", icon: Folder },
    { id: "map", label: "Memory", icon: MapIcon },
    { id: "ai", label: "Agents", icon: Bot },
    { id: "security", label: "Security", icon: Shield },
    { id: "health", label: "Health", icon: Activity },
    { id: "settings", label: "Ajustes", icon: Settings },
  ] as const;
  const visibleSecondBrainNavigation = selfNavigation.filter(({ id }) => id !== "security" && id !== "health");
  const developerSubsystems = [
    "Quantum Engine completo: inyeccion raw, T-DB, recuperacion, colapso y canvas 3D",
    "Health + WAL: estado físico del contenedor, registros pendientes y errores",
    "AES keys: llave activa, rotacion y migracion de payloads cifrados",
    "Permisos IA: lectura, escritura, busqueda, computo y borrado confirmado",
    "Indices tecnicos: Query Index, Memory Graph, Guardian Observer y relaciones",
    "Chunks + Vit/AntiVit: fragmentos físicos, offsets, vectores y anti-vectores",
  ];
  const settingsTabs = [
    { id: "general", label: "General", icon: SlidersHorizontal },
    { id: "editor", label: "Editor", icon: FileText },
    { id: "files", label: "Archivos y enlaces", icon: Link2 },
    { id: "appearance", label: "Apariencia", icon: Palette },
    { id: "ai", label: "Proveedores IA", icon: Plug },
    { id: "storage", label: "Bovedas", icon: HardDrive },
    { id: "notebooks", label: "Notebooks", icon: Notebook },
    { id: "permissions", label: "Permisos IA", icon: Shield },
    { id: "security", label: "Seguridad", icon: KeyRound },
    { id: "keys", label: "Llaves", icon: KeyRound },
    { id: "advanced", label: "Avanzado", icon: Code2 },
  ] as const;

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-tbit-void font-mono text-cyan-50">
      <Suspense fallback={<SceneSuspenseFallback />}>
        <VoidScene
          vits={renderableVits}
          highlightedVitId={highlightedVitId}
          focusTarget={focusTarget}
          activeQueryLine={activeQueryLine}
        />
      </Suspense>

      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_70%_35%,rgba(0,255,204,0.12),transparent_32%),linear-gradient(90deg,rgba(3,7,18,0.88)_0%,rgba(3,7,18,0.42)_37%,rgba(3,7,18,0.08)_100%)]" />

      <div className="pointer-events-auto fixed left-1/2 top-4 z-50 flex -translate-x-1/2 items-center gap-2 border border-cyan-200/18 bg-slate-950/88 p-1 text-[10px] uppercase tracking-[0.14em] text-cyan-100 shadow-2xl shadow-cyan-950/40 backdrop-blur-xl">
        <button
          type="button"
          onClick={() => setIsZenMode(false)}
          className={!isZenMode ? "bg-amber-300 px-4 py-2 font-bold text-slate-950" : "hidden px-4 py-2 text-cyan-100/65 transition hover:text-white"}
        >
          Modo Desarrollador
        </button>
        <button
          type="button"
          onClick={() => setIsZenMode(true)}
          className={isZenMode ? "bg-emerald-400 px-4 py-2 font-bold text-slate-950" : "px-4 py-2 text-emerald-300 transition hover:bg-emerald-400 hover:text-slate-950"}
        >
          Q-Vault
        </button>
      </div>

      {isZenMode ? (
        <section
          className="pointer-events-auto absolute inset-0 z-30 flex bg-[radial-gradient(circle_at_18%_16%,rgba(130,103,255,0.22),transparent_30%),radial-gradient(circle_at_78%_14%,rgba(0,210,255,0.16),transparent_28%),linear-gradient(135deg,rgba(17,24,68,0.92),rgba(35,48,129,0.76)_46%,rgba(88,75,175,0.58))]"
          onDragEnter={(event) => {
            event.preventDefault();
            if (!isOmniImporting) setIsOmniDragging(true);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            if (!isOmniImporting) setIsOmniDragging(true);
          }}
          onDragLeave={(event) => {
            const nextTarget = event.relatedTarget;
            if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) {
              setIsOmniDragging(false);
            }
          }}
          onDrop={(event) => {
            event.preventDefault();
            setIsOmniDragging(false);
            void importFilesToOmniWorkspace(Array.from(event.dataTransfer.files));
          }}
        >
          {(isOmniDragging || isOmniImporting) && (
            <div className="absolute inset-5 z-50 flex items-center justify-center rounded-[30px] border border-cyan-100/50 bg-[#111a4b]/78 text-center shadow-[0_0_80px_rgba(34,211,238,0.35)] backdrop-blur-xl">
              <div className="max-w-md rounded-[28px] border border-white/14 bg-white/10 p-8">
                <p className="text-[10px] uppercase tracking-[0.26em] text-cyan-200">
                  {isOmniImporting ? "Agregando a memoria" : "Universal Dropzone"}
                </p>
                <h3 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-white">
                  {isOmniImporting ? "Procesando archivo..." : "Suelta para añadir a tu memoria"}
                </h3>
                <p className="mt-4 text-sm leading-relaxed text-blue-100/72">
                  {isOmniImporting
                    ? omniDropStatus
                    : "Markdown, texto y JSON se guardan como memoria consultable. Otros archivos se guardan como assets binarios verificables."}
                </p>
                {isOmniImporting && (
                  <div className="mt-5">
                    <div className="h-2 overflow-hidden rounded-full bg-white/12">
                      <div
                        className="h-full rounded-full bg-cyan-200 transition-all duration-300"
                        style={{ width: `${Math.max(6, omniImportProgress)}%` }}
                      />
                    </div>
                    <p className="mt-2 text-[10px] uppercase tracking-[0.18em] text-cyan-100/72">
                      {omniImportProgress}% completado
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
          <div className={isSecondBrainSidebarCollapsed
            ? "grid h-full w-full grid-cols-[76px_minmax(0,1fr)] overflow-hidden bg-[#1b245d]/46 text-white backdrop-blur-xl"
            : "grid h-full w-full grid-cols-[252px_minmax(0,1fr)] overflow-hidden bg-[#1b245d]/46 text-white backdrop-blur-xl"}
          >
            <aside className="flex min-h-0 flex-col border-r border-white/10 bg-[#202a66]/70 p-4 shadow-[inset_-1px_0_0_rgba(255,255,255,0.05)]">
              <button
                type="button"
                onClick={() => setIsSecondBrainSidebarCollapsed((value) => !value)}
                className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl border border-white/12 bg-white/8 text-blue-50 transition hover:border-cyan-200/55 hover:bg-cyan-200/14"
                title={isSecondBrainSidebarCollapsed ? "Expandir barra lateral" : "Colapsar barra lateral"}
              >
                {isSecondBrainSidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
              </button>
              {isSecondBrainSidebarCollapsed ? (
                <div className="flex min-h-0 flex-1 flex-col items-center gap-3">
                  <button
                    type="button"
                    onClick={() => omniFileInputRef.current?.click()}
                    className="flex h-10 w-10 items-center justify-center rounded-2xl border border-dashed border-cyan-200/35 bg-cyan-200/8 text-cyan-100 transition hover:border-cyan-100 hover:bg-cyan-200/14"
                    title="Agregar archivos"
                  >
                    <UploadCloud size={17} />
                  </button>
                  {visibleSecondBrainNavigation.slice(0, 5).map(({ id, label, icon: Icon }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => {
                        if (id === "settings") {
                          setSettingsModalTab("general");
                          setIsSettingsModalOpen(true);
                          return;
                        }
                        setZenSection(id as ZenSection);
                      }}
                      className={zenSection === id
                        ? "flex h-10 w-10 items-center justify-center rounded-2xl border border-white/16 bg-white/14 text-cyan-100"
                        : "flex h-10 w-10 items-center justify-center rounded-2xl text-blue-100/62 transition hover:bg-white/8 hover:text-white"}
                      title={label}
                    >
                      <Icon size={17} />
                    </button>
                  ))}
                </div>
              ) : (
                <>
              <div className="border-b border-white/10 pb-4">
                <p className="text-[10px] uppercase tracking-[0.26em] text-cyan-100/65">Local · Bogotá</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-[-0.02em] text-white">Q-Vault OS</h2>
                <p className="mt-1 text-xs text-emerald-200/85">{activeDisplayName()}</p>
                <p className="mt-2 text-xs leading-relaxed text-blue-100/62">
                  Mission Control para tus IAs, memoria, documentos y proyectos T-BIT.
                </p>
              </div>

              <nav className="mt-4 space-y-2 text-sm">
                <p className="px-3 text-[10px] uppercase tracking-[0.26em] text-blue-100/45">Workspace</p>
                {selfNavigation.slice(0, 1).map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      setZenSection(id as ZenSection);
                    }}
                    className={zenSection === id
                      ? "flex w-full items-center gap-3 rounded-2xl border border-white/14 bg-white/12 px-3 py-2.5 text-left font-semibold text-white shadow-[0_12px_28px_rgba(80,96,220,0.22)]"
                      : "flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-blue-100/72 transition hover:bg-white/8 hover:text-white"}
                  >
                    <Icon size={16} className={zenSection === id ? "text-cyan-200" : "text-blue-100/55"} />
                    {label}
                  </button>
                ))}
              </nav>

              <div className="mt-4 border-t border-white/10 pt-4">
                <p className="px-3 text-[10px] uppercase tracking-[0.22em] text-blue-100/45">Historial de solicitudes</p>
                <div className="mt-2 max-h-32 space-y-1.5 overflow-y-auto pr-1">
                  {requestHistory.length === 0 ? (
                    <p className="rounded-2xl border border-white/8 bg-white/5 px-3 py-2 text-[11px] leading-relaxed text-blue-100/45">
                      Tus preguntas apareceran aqui.
                    </p>
                  ) : (
                    requestHistory.map((message, index) => (
                      <button
                        key={message.id}
                        type="button"
                        onClick={() => setAiInput(message.text)}
                        className="w-full rounded-2xl border border-white/8 bg-white/7 px-3 py-2 text-left transition hover:border-cyan-200/35 hover:bg-cyan-200/10"
                        title="Reusar solicitud"
                      >
                        <p className="text-[10px] uppercase tracking-[0.12em] text-cyan-100/55">Solicitud {requestHistory.length - index}</p>
                        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-blue-50/78">{message.text}</p>
                      </button>
                    ))
                  )}
                </div>
              </div>

              <div className="mt-4 border-t border-white/10 pt-4">
                <p className="px-3 text-[10px] uppercase tracking-[0.22em] text-blue-100/45">Agregar archivos</p>
                <button
                  type="button"
                  onClick={() => omniFileInputRef.current?.click()}
                  disabled={isOmniImporting}
                  className="mt-2 flex w-full flex-col items-center justify-center rounded-2xl border border-dashed border-cyan-200/35 bg-cyan-200/8 px-3 py-4 text-center transition hover:border-cyan-100 hover:bg-cyan-200/14 disabled:cursor-wait disabled:opacity-60"
                >
                  <UploadCloud size={22} className="text-cyan-100" />
                  <span className="mt-2 text-xs font-semibold text-cyan-50">{isOmniImporting ? "Procesando..." : "Seleccionar o arrastrar"}</span>
                  <span className="mt-1 text-[10px] text-blue-100/48">PDF · XLS · DOC · MD · JSON</span>
                  <span className="mt-2 flex gap-1.5">
                    {["PDF", "XLS", "DOC"].map((type) => (
                      <span key={type} className="rounded-md border border-white/12 bg-white/10 px-1.5 py-0.5 text-[9px] text-blue-50/80">{type}</span>
                    ))}
                  </span>
                </button>
                <p className="mt-2 line-clamp-2 text-[10px] leading-relaxed text-blue-100/45">{omniDropStatus}</p>
                {isOmniImporting && (
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-cyan-200 transition-all duration-300"
                      style={{ width: `${Math.max(6, omniImportProgress)}%` }}
                    />
                  </div>
                )}
              </div>

              <div className="mt-5 min-h-0 flex-1 overflow-y-auto border-t border-white/10 pt-4">
                <p className="px-3 text-[10px] uppercase tracking-[0.26em] text-blue-100/45">Agents</p>
                <div className="mt-3 space-y-1.5 text-sm">
                  {connectedAgents.slice(0, 7).map((agent, index) => (
                    <button
                      key={agent.id}
                      type="button"
                      onClick={() => selectAiProvider(agent.id)}
                      className={agent.active
                        ? "w-full rounded-2xl border border-white/16 bg-white/13 p-2.5 text-left shadow-[0_12px_34px_rgba(116,101,255,0.24)]"
                        : "w-full rounded-2xl border border-transparent p-2.5 text-left transition hover:border-white/10 hover:bg-white/8"}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/18 text-[10px] font-bold shadow-[0_0_20px_rgba(160,130,255,0.22)] ${
                            index % 6 === 0 ? "bg-pink-300/80 text-indigo-950" :
                            index % 6 === 1 ? "bg-fuchsia-300/80 text-indigo-950" :
                            index % 6 === 2 ? "bg-cyan-300/80 text-indigo-950" :
                            index % 6 === 3 ? "bg-sky-300/80 text-indigo-950" :
                            index % 6 === 4 ? "bg-blue-400/80 text-white" :
                            "bg-emerald-300/80 text-indigo-950"
                          }`}>
                            {agent.name.slice(0, 1)}
                          </span>
                          <p className={agent.active ? "truncate text-white" : "truncate text-blue-50/82"}>{agent.name}</p>
                        </div>
                        <span className={agent.active
                          ? "h-2 w-2 rounded-full bg-emerald-300 shadow-[0_0_14px_#6ee7b7]"
                          : agent.configured ? "h-2 w-2 rounded-full bg-cyan-200/80" : "h-2 w-2 rounded-full bg-amber-300/80"} />
                      </div>
                      <p className="ml-10 mt-1 truncate text-[10px] text-blue-100/45">{agent.detail}</p>
                    </button>
                  ))}
                </div>

                <div className="mt-5 border-t border-white/10 pt-4">
                  <p className="px-3 text-[10px] uppercase tracking-[0.26em] text-blue-100/45">Self</p>
                  <div className="mt-3 space-y-1.5 text-sm">
                    {visibleSecondBrainNavigation.slice(1).map(({ id, label, icon: Icon }) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => {
                          if (id === "settings") {
                            setSettingsModalTab("general");
                            setIsSettingsModalOpen(true);
                            return;
                          }
                          setZenSection(id as ZenSection);
                        }}
                        className={zenSection === id
                          ? "flex w-full items-center gap-3 rounded-2xl border border-white/14 bg-white/12 px-3 py-2.5 text-left font-semibold text-white"
                          : "flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-blue-100/72 transition hover:bg-white/8 hover:text-white"}
                      >
                        <Icon size={16} className={zenSection === id ? "text-cyan-200" : "text-blue-100/55"} />
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-white/10 bg-black/12 p-3 text-xs">
                <p className="text-blue-100/45">Auto-saved to T-BIT</p>
                <p className="mt-1 text-emerald-200">{aiIsThinking ? "Transmitiendo memoria..." : "Listo"}</p>
              </div>
                </>
              )}
              <input
                ref={omniFileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(event) => {
                  const files = Array.from(event.target.files ?? []);
                  event.target.value = "";
                  if (files.length > 0) {
                    void importFilesToOmniWorkspace(files);
                  }
                }}
              />
            </aside>

            <div className="flex min-h-0 min-w-0 flex-col bg-[radial-gradient(circle_at_72%_18%,rgba(56,189,248,0.16),transparent_34%),radial-gradient(circle_at_35%_72%,rgba(167,139,250,0.2),transparent_36%),linear-gradient(135deg,rgba(36,48,115,0.48),rgba(21,29,78,0.54))] px-6 py-5">
            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-white/10 pb-4">
              <div>
                <p className="text-[10px] uppercase tracking-[0.26em] text-blue-100/55">11:25 · Local · Bogotá · {activeUserId()}</p>
                <h2 className="mt-2 text-4xl font-semibold tracking-[-0.04em] text-white xl:text-5xl">Q-Vault</h2>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-blue-100/68">
                  Pregunta, guarda y explora tu memoria persistente Q-Vault desde una sola pantalla.
                </p>
                <p className="mt-3 text-[10px] uppercase tracking-[0.14em] text-cyan-200/85">
                  {`${selectedProviderDescriptor.label} · ${selectedProviderDraft.model || selectedProviderDescriptor.defaultModel}`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsZenMode(false)}
                className="rounded-2xl border border-white/16 bg-white/8 px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] text-blue-50 transition hover:border-cyan-200/60 hover:bg-cyan-200/18"
              >
                Modo Desarrollador
              </button>
            </div>

            <div className="mt-4 flex shrink-0 flex-wrap gap-2 text-xs">
              <div className="rounded-full border border-white/18 bg-white/8 px-3 py-2 text-blue-50">
                <span className="text-cyan-200">Memoria</span> → {currentUniverse === "ai" ? "ai_memoria.tbit" : "universo.tbit"}
              </div>
              <div className="rounded-full border border-white/18 bg-white/8 px-3 py-2 text-blue-50">
                <span className="text-cyan-200">Nodos</span> · {aiVits.length}
              </div>
              <div className="rounded-full border border-white/18 bg-white/8 px-3 py-2 text-blue-50">
                <span className="text-cyan-200">Estado</span> · {aiIsThinking ? "Transmitiendo" : "Listo"}
              </div>
              <label className="flex min-w-[220px] items-center gap-2 rounded-full border border-white/18 bg-white/8 px-3 py-1.5 text-blue-50">
                <span className="text-cyan-200">Notebook</span>
                <input
                  value={activeNotebook}
                  onChange={(event) => updateActiveNotebook(event.target.value)}
                  className="min-w-0 flex-1 bg-transparent text-white outline-none placeholder:text-blue-100/35"
                  placeholder="General"
                />
              </label>
              <button
                type="button"
                onClick={renameActiveNotebook}
                className="rounded-full border border-white/18 bg-white/8 px-3 py-2 text-blue-100/75 transition hover:border-cyan-200/45 hover:text-white"
                title="Cambia el notebook usado para nuevas memorias y conversaciones."
              >
                Renombrar notebook
              </button>
              <button
                type="button"
                onClick={() => void clearVisibleConversation()}
                className="rounded-full border border-rose-200/24 bg-rose-400/8 px-3 py-2 text-rose-100/85 transition hover:border-rose-200/60 hover:bg-rose-300/18"
                title="Limpia la conversacion visible y permite borrar la bitacora persistente del notebook."
              >
                Borrar conversación
              </button>
              <button
                type="button"
                onClick={() => toggleUserSetting("multiAiConsensus")}
                className={userSettings.multiAiConsensus
                  ? "rounded-full border border-emerald-200/35 bg-emerald-300/18 px-3 py-2 font-bold text-emerald-100"
                  : "rounded-full border border-white/18 bg-white/8 px-3 py-2 text-blue-100/65 transition hover:border-cyan-200/35 hover:text-white"}
                title="Activa la consulta Multi-IA. Rapido consulta en paralelo; Deliberativo y Critico agregan rondas de revision."
              >
                Multi-IA · {userSettings.multiAiConsensus ? "ON" : "OFF"}
              </button>
              <label className="flex items-center gap-2 rounded-full border border-white/18 bg-white/8 px-3 py-1.5 text-blue-50">
                <span className="text-cyan-200">Modo</span>
                <select
                  value={multiAiMode}
                  onChange={(event) => updateMultiAiMode(event.target.value as MultiAiMode)}
                  disabled={!userSettings.multiAiConsensus}
                  className="bg-transparent text-white outline-none disabled:text-blue-100/35"
                  title="Rapido es el modo por defecto. Deliberativo y Critico consumen mas llamadas de IA."
                >
                  <option className="bg-[#1e2866]" value="fast">Rapido</option>
                  <option className="bg-[#1e2866]" value="deliberative">Deliberativo</option>
                  <option className="bg-[#1e2866]" value="critical">Critico</option>
                </select>
              </label>
            </div>

            {zenSection !== "chat" && zenSection !== "map" && (
              <div className="mt-4 max-h-[220px] shrink-0 overflow-y-auto rounded-[24px] border border-white/12 bg-white/8 p-4 text-xs text-blue-50/72 shadow-[inset_0_1px_0_rgba(255,255,255,0.07)]">
                {zenSection === "documents" && "Documentos: puedes preguntar por items, secciones o contenido de Markdown importado. Ej: cual es el item 6 del book.md."}
                {zenSection === "assets" && "Archivos: los binarios importados se gestionan automáticamente. Los detalles fisicos viven en Modo Desarrollador."}
                {zenSection === "ai" && (
                  <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.2em] text-tbit-cyan">Panel de IA</p>
                      <h3 className="mt-2 text-lg font-semibold text-white">{selectedProviderDescriptor.label}</h3>
                      <p className="mt-1 text-cyan-100/55">
                        Selecciona cualquier IA de la barra lateral. Todas comparten el mismo Memory Core T-BIT.
                      </p>
                      {selectedAgentRuntime.isInstance && (
                        <div className="mt-3 rounded-2xl border border-purple-200/20 bg-purple-300/10 p-3">
                          <p className="text-[10px] uppercase tracking-[0.18em] text-purple-100/60">Instancia activa</p>
                          <p className="mt-1 text-sm text-white">{selectedAgentRuntime.name}</p>
                          <p className="mt-2 text-xs leading-relaxed text-purple-50/70">{selectedAgentRuntime.role}</p>
                        </div>
                      )}
                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <label className="block">
                          <span className="text-[10px] uppercase tracking-[0.16em] text-cyan-100/45">Modelo</span>
                          <input
                            value={selectedProviderDraft.model}
                            onChange={(event) => updateAiProviderDraft(selectedProviderDescriptor.id, "model", event.target.value)}
                            className="mt-1 w-full border border-cyan-200/14 bg-black/45 px-3 py-2 text-white outline-none focus:border-tbit-cyan"
                            placeholder={selectedProviderDescriptor.defaultModel}
                          />
                        </label>
                        <label className="block">
                          <span className="text-[10px] uppercase tracking-[0.16em] text-cyan-100/45">Base URL</span>
                          <input
                            value={selectedProviderDraft.baseUrl}
                            onChange={(event) => updateAiProviderDraft(selectedProviderDescriptor.id, "baseUrl", event.target.value)}
                            className="mt-1 w-full border border-cyan-200/14 bg-black/45 px-3 py-2 text-white outline-none focus:border-tbit-cyan"
                            placeholder={selectedProviderDescriptor.defaultBaseUrl ?? "https://.../v1"}
                          />
                        </label>
                        <label className="block sm:col-span-2">
                          <span className="text-[10px] uppercase tracking-[0.16em] text-cyan-100/45">
                            API Key {selectedProviderDescriptor.requiresApiKey ? "(requerida)" : "(opcional/local)"}
                          </span>
                          <input
                            type="password"
                            value={selectedProviderDraft.apiKey}
                            onChange={(event) => updateAiProviderDraft(selectedProviderDescriptor.id, "apiKey", event.target.value)}
                            className="mt-1 w-full border border-cyan-200/14 bg-black/45 px-3 py-2 text-white outline-none focus:border-tbit-cyan"
                            placeholder={selectedProviderDescriptor.requiresApiKey ? "Pega tu API key" : "Opcional"}
                          />
                        </label>
                      </div>
                    </div>
                    <div className="rounded-[22px] border border-white/12 bg-[#202c6f]/70 p-3">
                      <p className="text-blue-100/45">Estado</p>
                      <p className={isProviderConfigured(selectedProviderDescriptor, selectedProviderDraft) ? "mt-2 text-emerald-300" : "mt-2 text-amber-300"}>
                        {isProviderConfigured(selectedProviderDescriptor, selectedProviderDraft) ? "Configuración lista" : "Falta configuracion"}
                      </p>
                      <p className="mt-3 text-blue-100/60">{aiProviderStatus}</p>
                      <p className="mt-3 text-blue-100/55">
                        Multi-IA usa modo {multiAiModeLabel()}. Rapido consulta hasta {getConsensusAgents().length} agentes/proveedores en paralelo; Deliberativo y Critico agregan rondas de revision.
                      </p>
                      <button
                        type="button"
                        onClick={() => void testSelectedAiProvider()}
                        disabled={isTestingAiProvider || selectedProviderDescriptor.id === "deterministic"}
                        className="mt-4 w-full rounded-2xl border border-cyan-200/30 bg-cyan-200/14 px-3 py-2 font-bold uppercase tracking-[0.12em] text-cyan-100 transition hover:bg-cyan-200 hover:text-[#1b245d] disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        {isTestingAiProvider ? "Probando..." : "Probar IA"}
                      </button>
                      <button
                        type="button"
                        onClick={clearSelectedAiProviderConfig}
                        disabled={selectedProviderDescriptor.id === "deterministic"}
                        className="mt-2 w-full rounded-2xl border border-rose-200/25 bg-rose-400/8 px-3 py-2 font-bold uppercase tracking-[0.12em] text-rose-100 transition hover:bg-rose-300 hover:text-[#241331] disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        Limpiar configuracion
                      </button>
                    </div>
                  </div>
                )}
                {zenSection === "security" && "Seguridad: payloads cifrados con AES-256-GCM, llaves versionadas y validacion de integridad."}
                {zenSection === "health" && "Salud: el panel Health revisa metadata, WAL, chunks, assets e indice logico."}
                {zenSection === "settings" && "Ajustes: la configuracion avanzada sigue disponible en Modo Desarrollador mientras el workspace limpio mantiene solo acciones de usuario."}
              </div>
            )}

            <div className="mt-4 max-h-[250px] min-h-[145px] shrink-0 space-y-3 overflow-y-auto rounded-[24px] border border-white/10 bg-[#314199]/28 p-4 text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
              {aiProviderInfo && (
                <div className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-1.5 text-[10px] uppercase tracking-[0.14em]">
                  <span className="text-blue-100/55">Motor de respuesta</span>
                  <span
                    className={
                      aiProviderInfo.mode === "deterministic"
                        ? "tbit-badge tbit-badge-warn"
                        : "tbit-badge tbit-badge-ok"
                    }
                    title={
                      aiProviderInfo.mode === "deterministic"
                        ? "Respuestas generadas por reglas locales deterministas, sin modelo de IA."
                        : `Respuestas generadas por IA: ${aiProviderInfo.label} (${aiProviderInfo.model}).`
                    }
                  >
                    {aiProviderInfo.mode === "deterministic"
                      ? "Eslabon determinista local"
                      : `${aiProviderInfo.label} · ${aiProviderInfo.model}`}
                  </span>
                </div>
              )}
              {aiMessages.map((message) => (
                <div key={message.id} className={message.sender === "T-User" ? "ml-auto max-w-[82%]" : "mr-auto max-w-[82%]"}>
                  {message.kind === "deterministic-notice" ? (
                    <div
                      role="note"
                      aria-label="Aviso de eslabon determinista"
                      className="tbit-animate-in rounded-2xl border border-amber-300/45 bg-amber-950/35 p-3"
                    >
                      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-amber-200">
                        Sin IA · Eslabon determinista
                      </p>
                      <p className="mt-2 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-amber-50/90">
                        {message.text}
                      </p>
                    </div>
                  ) : (
                    <div className={message.sender === "T-User" ? "rounded-2xl border border-cyan-100/20 bg-cyan-200/10 p-3" : "rounded-2xl border border-white/12 bg-white/10 p-3"}>
                      <p className={message.sender === "T-User" ? "text-cyan-100" : "text-pink-100"}>{message.sender}</p>
                      <p className="mt-2 whitespace-pre-wrap break-words leading-relaxed text-blue-50/88">{message.text}</p>
                    </div>
                  )}
                </div>
              ))}
              <div ref={aiChatEndRef} />
            </div>

            <div className="mt-4 flex min-h-[440px] flex-[1.45] flex-col overflow-hidden rounded-[28px] border border-white/12 bg-[radial-gradient(circle_at_50%_50%,rgba(130,103,255,0.2),transparent_36%),linear-gradient(135deg,rgba(22,30,78,0.72),rgba(25,38,96,0.52))] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.22em] text-cyan-200/80">Q-Vault Map</p>
                  <p className="mt-1 text-xs text-blue-100/55">
                    {previewNodes.length > 0
                      ? `Mapa listo: ${previewNodes.length} de ${allPreviewNodes.length} nodo${allPreviewNodes.length === 1 ? "" : "s"} visibles. Chunks internos agrupados.`
                      : secondBrainMapStatus || "Documentos y memorias visibles sin exponer chunks internos."}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsZenMode(false)}
                  className="rounded-2xl border border-white/14 bg-white/8 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-blue-50 transition hover:border-cyan-200/60 hover:bg-cyan-200/18"
                >
                  Abrir modo desarrollador
                </button>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-white/7 px-3 py-2 text-[10px] uppercase tracking-[0.12em] text-blue-50/70">
                <div className="mr-2 flex rounded-full border border-cyan-100/20 bg-black/16 p-1">
                  {[
                    ["scene3d", "3D vivo"],
                    ["map2d", "Mapa 2D"],
                  ].map(([mode, label]) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setQVaultMapMode(mode as QVaultMapMode)}
                      className={qVaultMapMode === mode
                        ? "rounded-full bg-cyan-200 px-3 py-1 font-bold text-[#172257]"
                        : "rounded-full px-3 py-1 text-blue-100/48 transition hover:text-blue-50"}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {[
                  ["documents", "Documentos"],
                  ["memories", "Memorias"],
                  ["chats", "Chats IA"],
                  ["live", "Vits"],
                  ["links", "Enlaces"],
                  ["anti", "Anti-Vits"],
                  ["labels", "Etiquetas"],
                ].map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => toggleQVaultLayer(key as keyof QVaultLayerFilters)}
                    className={qVaultLayerFilters[key as keyof QVaultLayerFilters]
                      ? "rounded-full border border-cyan-200/45 bg-cyan-200/18 px-3 py-1 font-bold text-cyan-50"
                      : "rounded-full border border-white/12 bg-black/16 px-3 py-1 text-blue-100/42 transition hover:text-blue-50"}
                  >
                    {label}
                  </button>
                ))}
                {allPreviewNodes.length > previewNodes.length && (
                  <span className="ml-auto text-blue-100/42">LOD activo</span>
                )}
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/8 px-4 py-3 text-xs text-blue-50/80">
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-cyan-200/70">Seleccion en mapa</p>
                  <p className="mt-1 truncate text-blue-50">
                    {selectedSecondBrainNode
                      ? `${selectedSecondBrainNode.label}${selectedSecondBrainNode.chunkCount > 0 ? ` (${selectedSecondBrainNode.chunkCount} fragmentos)` : ""}`
                      : "Haz click sobre un nodo visible."}
                  </p>
                  <p className="mt-1 text-[11px] text-blue-100/55">{visibleMemoryActionStatus}</p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (!selectedSecondBrainNode) {
                        setVisibleMemoryActionStatus("Selecciona primero un nodo del mapa.");
                        return;
                      }
                      setFocusTarget({ id: selectedSecondBrainNode.id, position: selectedSecondBrainNode.position, startedAt: performance.now() });
                      setVisibleMemoryActionStatus(`Nodo enfocado: ${selectedSecondBrainNode.label}.`);
                    }}
                    disabled={!selectedSecondBrainNode}
                    className="rounded-xl border border-cyan-200/30 bg-cyan-200/10 px-3 py-2 font-bold uppercase tracking-[0.12em] text-cyan-100 transition hover:bg-cyan-200 hover:text-[#172257] disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    Enfocar
                  </button>
                  <button
                    type="button"
                    onClick={() => void deleteSelectedVisibleDocument()}
                    disabled={!selectedSecondBrainNode}
                    className="rounded-xl border border-rose-200/35 bg-rose-400/10 px-3 py-2 font-bold uppercase tracking-[0.12em] text-rose-100 transition hover:bg-rose-300 hover:text-[#241331] disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    Eliminar seleccion
                  </button>
                </div>
              </div>
              <div className="relative mt-4 min-h-[350px] flex-1 overflow-hidden rounded-[24px] border border-white/10 bg-[#111a4b]/55">
                <div className="pointer-events-none absolute inset-0 opacity-50 [background-image:linear-gradient(rgba(148,163,255,0.16)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,255,0.16)_1px,transparent_1px)] [background-size:46px_46px]" />
                {previewNodes.length === 0 ? (
                  <div className="absolute inset-0 flex items-center justify-center px-8 text-center text-sm leading-relaxed text-blue-100/60">
                    Importa un documento, guarda una memoria o cambia a AI Mem para construir tu mapa.
                  </div>
                ) : qVaultMapMode === "scene3d" ? (
                  <Suspense fallback={<SceneSuspenseFallback />}>
                    <QVaultScene3D
                      nodes={previewNodes}
                      links={previewLinks}
                      activeKeys={semanticActiveKeySet}
                      showAnti={qVaultLayerFilters.anti}
                      showLabels={qVaultLayerFilters.labels}
                      focusTarget={focusTarget}
                      onSelectNode={(node) => {
                        if (node.kind === "live") {
                          setHighlightedVitId(node.id);
                        }
                        setSelectedSecondBrainNode(node);
                        setFocusTarget({ id: node.id, position: node.position, startedAt: performance.now() });
                        setVisibleMemoryActionStatus("Nodo seleccionado. Puedes enfocarlo o eliminarlo si pertenece a tu Q-Vault.");
                        setSecondBrainMapStatus(`${node.label}${node.chunkCount > 0 ? ` (${node.chunkCount} fragmentos agrupados)` : ""}.`);
                      }}
                    />
                  </Suspense>
                ) : (
                  <SecondBrainPreviewScene
                    nodes={previewNodes}
                    links={previewLinks}
                    activeKeys={semanticActiveKeySet}
                    showAnti={qVaultLayerFilters.anti}
                    showLabels={qVaultLayerFilters.labels}
                    onSelectNode={(node) => {
                      if (node.kind === "live") {
                        setHighlightedVitId(node.id);
                      }
                      setSelectedSecondBrainNode(node);
                      setFocusTarget({ id: node.id, position: node.position, startedAt: performance.now() });
                      setVisibleMemoryActionStatus("Nodo seleccionado. Puedes enfocarlo o eliminarlo si pertenece a tu Q-Vault.");
                      setSecondBrainMapStatus(`${node.label}${node.chunkCount > 0 ? ` (${node.chunkCount} fragmentos agrupados)` : ""}.`);
                    }}
                  />
                )}
              </div>
            </div>

            <div className="mt-4 flex shrink-0 gap-3 rounded-[24px] border border-white/12 bg-[#273376]/58 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
              <input
                value={aiInput}
                onChange={(event) => setAiInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    void handleAiCommand();
                  }
                }}
                className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-[#1f2a68]/80 px-4 py-3 text-sm text-white outline-none transition placeholder:text-blue-100/45 focus:border-cyan-200/70"
                placeholder={`Message ${activeAgentName}...`}
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => void handleAiCommand()}
                disabled={aiIsThinking}
                className="rounded-2xl border border-cyan-200/60 bg-cyan-200/90 px-5 py-3 text-xs font-bold uppercase tracking-[0.14em] text-[#18245d] transition hover:bg-white disabled:cursor-wait disabled:opacity-50"
              >
                Enviar
              </button>
            </div>
            </div>
            <aside className="hidden min-h-0 flex-col border-l border-white/10 bg-[#212d6e]/48 p-4">
              <div className="border-b border-white/10 pb-4">
                <p className="text-[10px] uppercase tracking-[0.22em] text-cyan-200">Q-Vault Map Preview</p>
                <p className="mt-2 text-xs leading-relaxed text-blue-100/58">
                  Vista normal de documentos. Los fragmentos físicos se ocultan aquí y solo aparecen en Modo Desarrollador.
                </p>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-2xl border border-white/10 bg-white/8 p-3">
                  <p className="text-blue-100/45">Documents</p>
                  <p className="mt-2 text-2xl text-white">{previewNodes.length}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/8 p-3">
                  <p className="text-blue-100/45">Vault</p>
                  <p className="mt-2 text-xs text-cyan-200">
                    {currentUniverse === "ai" ? `${activeDisplayName()} AI Mem` : `${activeDisplayName()} Vault`}
                  </p>
                </div>
              </div>

              <div className="mt-4 rounded-[24px] border border-yellow-200/16 bg-[linear-gradient(135deg,rgba(35,31,76,0.94),rgba(42,50,128,0.72))] p-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.18em] text-yellow-100/70">Busqueda semantica</p>
                    <p className="mt-1 text-xs leading-relaxed text-blue-100/50">Encuentra documentos por significado, no solo por palabras exactas.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void rebuildSemanticSearchIndex()}
                    disabled={isSemanticSearching}
                    className="rounded-xl border border-yellow-200/24 bg-yellow-200/8 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-yellow-100 transition hover:bg-yellow-200 hover:text-[#1d255f] disabled:cursor-wait disabled:opacity-50"
                  >
                    Reindexar
                  </button>
                </div>
                <form className="mt-3 flex gap-2" onSubmit={(event) => void runSemanticSearch(event)}>
                  <input
                    value={semanticQuery}
                    onChange={(event) => setSemanticQuery(event.target.value)}
                    className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-[#17215d]/82 px-3 py-2 text-xs text-white outline-none transition placeholder:text-blue-100/38 focus:border-yellow-200/70"
                    placeholder="Ej: estrategias de marketing"
                    autoComplete="off"
                  />
                  <button
                    type="submit"
                    disabled={isSemanticSearching}
                    className="flex h-9 w-10 items-center justify-center rounded-2xl border border-cyan-200/30 bg-cyan-200/12 text-cyan-100 transition hover:bg-cyan-200 hover:text-[#18245d] disabled:cursor-wait disabled:opacity-50"
                    title="Buscar por significado"
                  >
                    <Search size={14} />
                  </button>
                </form>
                <p className="mt-2 text-[10px] leading-relaxed text-blue-100/48">{semanticStatus}</p>
                {semanticResults.length > 0 && (
                  <div className="mt-3 max-h-40 space-y-2 overflow-y-auto pr-1">
                    {semanticResults.slice(0, 5).map((result) => (
                      <button
                        key={result.rootKey}
                        type="button"
                        onClick={() => focusSemanticResult(result)}
                        className="w-full rounded-2xl border border-white/8 bg-white/8 p-2 text-left transition hover:border-yellow-200/50 hover:bg-yellow-200/10"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="min-w-0 truncate text-xs text-blue-50/88">{result.title}</p>
                          <span className="shrink-0 rounded-full border border-yellow-200/22 px-2 py-0.5 text-[9px] text-yellow-100">
                            {Math.round(result.score * 100)}%
                          </span>
                        </div>
                        <p className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-blue-100/48">{result.textPreview}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="mt-4 rounded-[24px] border border-white/10 bg-[linear-gradient(135deg,rgba(25,35,90,0.95),rgba(37,56,132,0.78))] p-4">
                <p className="text-[10px] uppercase tracking-[0.18em] text-blue-100/45">Resumen del vault</p>
                <p className="mt-3 text-sm leading-relaxed text-blue-50/80">
                  {previewNodes.length === 0
                    ? "Importa un documento, guarda una memoria o cambia a AI Mem para ver contenido."
                    : `Hay ${previewNodes.length} documento${previewNodes.length === 1 ? "" : "s"} visibles. Abre Modo Desarrollador para navegar el mapa 3D completo.`}
                </p>
                <div className="mt-4 rounded-2xl border border-cyan-200/16 bg-cyan-200/8 p-3 text-xs text-cyan-100/72">
                  Vista limpia: documentos principales, memorias y archivos. Los chunks internos se agrupan automáticamente.
                </div>
              </div>

              <div className="mt-4 min-h-0 flex-1 overflow-y-auto rounded-[24px] border border-white/10 bg-[#314199]/32 p-3">
                <p className="text-[10px] uppercase tracking-[0.18em] text-blue-100/45">Archivos / documentos</p>
                <div className="mt-3 space-y-2">
                  {previewNodes.length === 0 ? (
                    <p className="text-xs leading-relaxed text-blue-100/48">
                      Aun no hay archivos visibles en esta vista. Importa un documento, guarda una memoria o cambia a AI Mem.
                    </p>
                  ) : (
                    previewNodes.slice(0, 10).map((node) => (
                      <button
                        key={node.id}
                        type="button"
                        onClick={() => {
                          if (node.kind === "live") {
                            setHighlightedVitId(node.id);
                          }
                          setFocusTarget({ id: node.id, position: node.position, startedAt: performance.now() });
                        }}
                        className="w-full rounded-2xl border border-white/8 bg-white/8 p-2 text-left transition hover:border-cyan-200/40 hover:bg-cyan-200/10"
                      >
                        <p className="truncate text-blue-50/86">{node.label}</p>
                        <p className="mt-1 truncate text-[10px] text-blue-100/45">
                          {node.kind === "live"
                            ? formatVector(node.position)
                            : node.chunkCount > 0
                              ? `${node.chunkCount} fragmentos internos agrupados`
                              : "Documento principal"}
                        </p>
                      </button>
                    ))
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsZenMode(false)}
                className="mt-4 rounded-2xl border border-cyan-200/35 bg-cyan-200/10 px-4 py-3 text-xs font-bold uppercase tracking-[0.14em] text-cyan-100 transition hover:bg-cyan-200 hover:text-[#18245d]"
              >
                Abrir modo desarrollador
              </button>
            </aside>
          </div>
        </section>
      ) : (
        <>
      <aside className="pointer-events-auto absolute left-0 top-0 flex h-full w-full max-w-[430px] flex-col overflow-y-auto border-r border-cyan-300/18 bg-tbit-panel px-6 py-6 shadow-2xl shadow-cyan-950/40 backdrop-blur-xl">
        <div className="border-b border-cyan-200/15 pb-5">
          <p className="text-xs uppercase tracking-[0.34em] text-cyan-200/70">Centro de Comando</p>
          <h1 className="mt-3 text-3xl font-semibold text-white">T-BIT CORE v1.1</h1>
          <div className="mt-4 flex items-center gap-3 text-xs uppercase text-cyan-100/70">
            <span className="h-2 w-2 rounded-full bg-tbit-cyan shadow-[0_0_16px_#00ffcc]" />
            Sistema de simetria 1:1 activo
          </div>
          <div className="mt-4 border border-cyan-200/12 bg-slate-950/45 p-3">
            <label className="block text-[10px] uppercase tracking-[0.18em] text-cyan-100/55" htmlFor="api-key">
              Llave local API
            </label>
            <input
              id="api-key"
              value={apiKey}
              onChange={(event) => updateApiKey(event.target.value)}
              className="mt-2 w-full border border-cyan-200/15 bg-black/35 px-3 py-2 text-xs text-white outline-none transition focus:border-tbit-cyan"
              placeholder="Ejecuta npm run setup:secret"
              autoComplete="off"
            />
            {!apiKey && (
              <p className="mt-2 text-[10px] leading-relaxed text-tbit-magenta">
                Sin llave local la API rechazara la inyeccion y no se dibujaran Vits.
              </p>
            )}
          </div>
        </div>

        <div className="mt-6 grid grid-cols-3 border border-cyan-200/15 bg-slate-950/45 p-1 text-[10px] uppercase tracking-[0.08em]">
          <button
            type="button"
            onClick={() => setInterfaceMode("raw")}
            className={interfaceMode === "raw" ? "bg-tbit-cyan px-3 py-2 font-bold text-slate-950" : "px-3 py-2 text-cyan-100/65 transition hover:text-white"}
          >
            Modo Raw
          </button>
          <button
            type="button"
            onClick={() => setInterfaceMode("database")}
            className={interfaceMode === "database" ? "bg-tbit-cyan px-3 py-2 font-bold text-slate-950" : "px-3 py-2 text-cyan-100/65 transition hover:text-white"}
          >
            Modo T-DB
          </button>
          <button
            type="button"
            onClick={() => setInterfaceMode("wizard")}
            className={interfaceMode === "wizard" ? "bg-tbit-cyan px-3 py-2 font-bold text-slate-950" : "px-3 py-2 text-cyan-100/65 transition hover:text-white"}
          >
            Asistente T-DB (No-Code)
          </button>
        </div>

        <form onSubmit={injectIntoVoid} className="mt-5 space-y-4">
          {interfaceMode === "raw" ? (
            <>
              <label className="block text-sm text-cyan-100/80" htmlFor="dato-clave">
                Dato Clave
              </label>
              <input
                id="dato-clave"
                value={keyInput}
                onChange={(event) => setKeyInput(event.target.value)}
                className="w-full border border-cyan-200/20 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition focus:border-tbit-cyan focus:shadow-[0_0_0_1px_rgba(0,255,204,0.55)]"
                placeholder="La direccion matematica"
                autoComplete="off"
              />

              <label className="block text-sm text-cyan-100/80" htmlFor="dato-carga">
                Carga de Datos
              </label>
              <textarea
                id="dato-carga"
                value={dataInput}
                onChange={(event) => setDataInput(event.target.value)}
                className="h-24 w-full resize-none border border-cyan-200/20 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition focus:border-tbit-cyan focus:shadow-[0_0_0_1px_rgba(0,255,204,0.55)]"
                placeholder="Contenido a escribir en universo.tbit"
              />
            </>
          ) : interfaceMode === "database" ? (
            <div className="space-y-4">
              <div className="border-l border-tbit-cyan/55 pl-3">
                <label className="block text-sm text-cyan-100/80" htmlFor="db-domain">
                  Dominio / Nodo Raiz
                </label>
                <input
                  id="db-domain"
                  value={dbDomain}
                  onChange={(event) => setDbDomain(event.target.value)}
                  className="mt-2 w-full border border-cyan-200/20 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition focus:border-tbit-cyan focus:shadow-[0_0_0_1px_rgba(0,255,204,0.55)]"
                  placeholder="PetiusDB"
                  autoComplete="off"
                />
              </div>

              <div className="border-l border-cyan-300/35 pl-6">
                <label className="block text-sm text-cyan-100/80" htmlFor="db-collection">
                  Coleccion / Tabla
                </label>
                <input
                  id="db-collection"
                  value={dbCollection}
                  onChange={(event) => setDbCollection(event.target.value)}
                  className="mt-2 w-full border border-cyan-200/20 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition focus:border-tbit-cyan focus:shadow-[0_0_0_1px_rgba(0,255,204,0.55)]"
                  placeholder="Usuarios"
                  autoComplete="off"
                />
              </div>

              <div className="border-l border-cyan-400/20 pl-9">
                <label className="block text-sm text-cyan-100/80" htmlFor="db-identifier">
                  Identificador / ID
                </label>
                <input
                  id="db-identifier"
                  value={dbIdentifier}
                  onChange={(event) => setDbIdentifier(event.target.value)}
                  className="mt-2 w-full border border-cyan-200/20 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition focus:border-tbit-cyan focus:shadow-[0_0_0_1px_rgba(0,255,204,0.55)]"
                  placeholder="Erika"
                  autoComplete="off"
                />
              </div>

              <label className="block text-sm text-cyan-100/80" htmlFor="db-document">
                Documento JSON (Carga Util)
              </label>
              <textarea
                id="db-document"
                value={dbDocument}
                onChange={(event) => setDbDocument(event.target.value)}
                className="h-40 w-full resize-none border border-cyan-200/20 bg-slate-950/80 px-4 py-3 text-sm leading-relaxed text-white outline-none transition focus:border-tbit-cyan focus:shadow-[0_0_0_1px_rgba(0,255,204,0.55)]"
                placeholder={'{\n  "tipo": "registro",\n  "activo": true\n}'}
                spellCheck={false}
              />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="border-l border-tbit-cyan/55 pl-3">
                <label className="block text-sm text-cyan-100/80" htmlFor="wizard-domain">
                  Dominio / Nodo Raiz
                </label>
                <input
                  id="wizard-domain"
                  value={dbDomain}
                  onChange={(event) => setDbDomain(event.target.value)}
                  className="mt-2 w-full border border-cyan-200/20 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition focus:border-tbit-cyan focus:shadow-[0_0_0_1px_rgba(0,255,204,0.55)]"
                  placeholder="PetiusDB"
                  autoComplete="off"
                />
              </div>

              <div className="border-l border-cyan-300/35 pl-6">
                <label className="block text-sm text-cyan-100/80" htmlFor="wizard-collection">
                  Coleccion / Tabla
                </label>
                <input
                  id="wizard-collection"
                  value={dbCollection}
                  onChange={(event) => setDbCollection(event.target.value)}
                  className="mt-2 w-full border border-cyan-200/20 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition focus:border-tbit-cyan focus:shadow-[0_0_0_1px_rgba(0,255,204,0.55)]"
                  placeholder="Usuarios"
                  autoComplete="off"
                />
              </div>

              <div className="border-l border-cyan-400/20 pl-9">
                <label className="block text-sm text-cyan-100/80" htmlFor="wizard-identifier">
                  Identificador / ID
                </label>
                <input
                  id="wizard-identifier"
                  value={dbIdentifier}
                  onChange={(event) => setDbIdentifier(event.target.value)}
                  className="mt-2 w-full border border-cyan-200/20 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition focus:border-tbit-cyan focus:shadow-[0_0_0_1px_rgba(0,255,204,0.55)]"
                  placeholder="Erika"
                  autoComplete="off"
                />
              </div>

              <div className="border border-cyan-200/14 bg-slate-950/45 p-3">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="text-sm text-cyan-100/80">Generador Dinamico de Atributos</p>
                  <button
                    type="button"
                    onClick={addWizardAttribute}
                    className="border border-tbit-cyan/60 px-2 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-tbit-cyan transition hover:bg-tbit-cyan hover:text-slate-950"
                  >
                    + Añadir Atributo
                  </button>
                </div>

                <div className="space-y-2">
                  {wizardAttributes.map((attribute) => (
                    <div key={attribute.id} className="grid grid-cols-[1fr_1.2fr] gap-2">
                      <input
                        value={attribute.clave}
                        onChange={(event) => updateWizardAttribute(attribute.id, "clave", event.target.value)}
                        className="min-w-0 border border-cyan-200/20 bg-black/35 px-3 py-2 text-xs text-white outline-none transition focus:border-tbit-cyan"
                        placeholder="Atributo"
                        autoComplete="off"
                      />
                      <input
                        value={attribute.valor}
                        onChange={(event) => updateWizardAttribute(attribute.id, "valor", event.target.value)}
                        className="min-w-0 border border-cyan-200/20 bg-black/35 px-3 py-2 text-xs text-white outline-none transition focus:border-tbit-cyan"
                        placeholder="Valor"
                        autoComplete="off"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={isInjecting}
            className="w-full border border-tbit-cyan/70 bg-tbit-cyan px-4 py-3 text-sm font-bold uppercase tracking-[0.18em] text-slate-950 shadow-[0_0_28px_rgba(0,255,204,0.28)] transition hover:bg-cyan-200 active:translate-y-px disabled:cursor-wait disabled:opacity-60"
          >
            {isInjecting
              ? "Escribiendo Sector"
              : interfaceMode === "database" || interfaceMode === "wizard"
                ? "Ensamblar e Inyectar Nodo"
                : "Inyectar al Vacio"}
          </button>
        </form>

        <div className="my-5 border-t border-cyan-200/15" />

        <section className="space-y-4">
          <button
            type="button"
            onClick={recoverFromVoid}
            disabled={isRecovering || isCollapsing}
            className="w-full border border-tbit-magenta/80 bg-transparent px-4 py-3 text-sm font-bold uppercase tracking-[0.16em] text-tbit-magenta shadow-[0_0_26px_rgba(255,45,117,0.22)] transition hover:bg-tbit-magenta hover:text-white active:translate-y-px disabled:cursor-wait disabled:opacity-60"
          >
            {isRecovering ? "Leyendo Suma Cero" : "Recuperar del Vacio"}
          </button>

          <button
            type="button"
            onClick={collapseData}
            disabled={isCollapsing || isRecovering}
            className="w-full border border-[#ff0044]/80 bg-[#ff0044]/12 px-4 py-3 text-sm font-bold uppercase tracking-[0.16em] text-[#ff5f85] shadow-[0_0_28px_rgba(255,0,68,0.22)] transition hover:bg-[#ff0044] hover:text-white active:translate-y-px disabled:cursor-wait disabled:opacity-60"
          >
            {isCollapsing ? "Colapsando Sector" : "Colapsar Dato"}
          </button>

          <div className="border border-tbit-magenta/24 bg-slate-950/55 p-4 text-xs shadow-[0_0_24px_rgba(255,45,117,0.08)]">
            <div className="flex items-center justify-between gap-3">
              <p className="uppercase tracking-[0.2em] text-cyan-100/70">Datos Recuperados</p>
              <span
                className={
                  recoveredData?.integridadValida
                    ? "text-tbit-cyan"
                    : "text-tbit-magenta"
                }
              >
                {recoveredData
                  ? recoveredData.integridadValida
                    ? "INTEGRIDAD OK"
                    : "SIN VALIDAR"
                  : "EN ESPERA"}
              </span>
            </div>
            <p className="mt-3 min-h-14 whitespace-pre-wrap break-words text-sm leading-relaxed text-white">
              {recoveredData?.dato || "La carga recuperada aparecera aqui."}
            </p>
          </div>

          <div className="border border-cyan-200/16 bg-slate-950/55 p-4 text-xs shadow-[0_0_24px_rgba(0,255,204,0.08)]">
            <p className="uppercase tracking-[0.2em] text-cyan-100/70">Consulta de Atributos</p>
            <label className="mt-3 block text-cyan-100/75" htmlFor="oracle-attribute">
              Atributo a consultar
            </label>
            <input
              id="oracle-attribute"
              value={queryAttribute}
              onChange={(event) => setQueryAttribute(event.target.value)}
              className="mt-2 w-full border border-cyan-200/20 bg-black/35 px-3 py-2 text-sm text-white outline-none transition focus:border-tbit-cyan"
              placeholder="telefono"
              autoComplete="off"
            />
            <button
              type="button"
              onClick={querySpecificAttribute}
              className="mt-3 flex w-full items-center justify-center gap-2 border border-tbit-cyan/70 bg-tbit-cyan/10 px-3 py-2 text-xs font-bold uppercase tracking-[0.12em] text-tbit-cyan shadow-[0_0_22px_rgba(0,255,204,0.14)] transition hover:bg-tbit-cyan hover:text-slate-950 active:translate-y-px"
            >
              <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
                <path d="M16.5 16.5L21 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              Obtener Dato Especifico
            </button>

            <div
              className={
                queryResult?.error
                  ? "mt-3 border border-[#ff0044]/45 bg-[#ff0044]/10 p-3 text-[#ff8cab]"
                  : "mt-3 border border-tbit-cyan/45 bg-tbit-cyan/10 p-3 text-white shadow-[0_0_20px_rgba(0,255,204,0.12)]"
              }
            >
              {queryResult
                ? queryResult.error || `RESULTADO: ${queryResult.value}`
                : "RESULTADO: Esperando consulta del Oraculo."}
            </div>
          </div>
        </section>

        <section className="mt-6 grid grid-cols-2 gap-3 text-xs">
          <div className="border border-cyan-200/14 bg-slate-950/45 p-3">
            <p className="text-cyan-200/55">VITS</p>
            <p className="mt-2 text-2xl text-white">{vits.length}</p>
          </div>
          <div className="border border-cyan-200/14 bg-slate-950/45 p-3">
            <p className="text-cyan-200/55">ESTADO</p>
            <p className="mt-2 text-sm text-tbit-cyan">ONLINE</p>
          </div>
        </section>

        <section className="mt-4 border border-cyan-200/14 bg-slate-950/45 p-4 text-xs text-cyan-100/80">
          <p className="text-cyan-200/55">VECTOR ACTIVO</p>
          <p className="mt-3 min-h-5 text-white">
            {activeVit ? activeVit.key : "Sin inyecciones registradas"}
          </p>
          <p className="mt-2 text-tbit-cyan">
            {activeVit ? formatVector(activeVit.position) : "[0.000, 0.000, 0.000]"}
          </p>
          <p className="mt-1 text-tbit-magenta">
            {activeVit ? formatVector(activeVit.antiPosition) : "[0.000, 0.000, 0.000]"}
          </p>
          <p className="mt-3 text-cyan-100/55">
            {activeVit ? `Sectores ${activeVit.offsetV} / ${activeVit.offsetAntiV}` : "Sectores sin asignar"}
          </p>
        </section>

        <section className="mt-auto min-h-0 border border-cyan-200/14 bg-black/55 p-4 shadow-inner shadow-cyan-950/30">
          <div className="mb-3 flex items-center justify-between border-b border-cyan-200/10 pb-2">
            <p className="text-xs uppercase tracking-[0.22em] text-cyan-100/80">Terminal / Logs</p>
            <span className="text-[10px] text-tbit-cyan">LIVE</span>
          </div>
          <div className="max-h-56 space-y-2 overflow-hidden text-[11px] leading-relaxed text-cyan-100/76">
            {logs.map((log) => (
              <p key={log.id} className="break-words">
                <span className="text-tbit-cyan">&gt;</span> {log.message}
              </p>
            ))}
          </div>
        </section>
      </aside>

      <aside className="hidden">
        <div className="flex items-center justify-between border-b border-cyan-200/12 pb-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.24em] text-tbit-cyan">T-BIT AI Cognitive Bridge</p>
            <p className="mt-1 text-xs text-cyan-100/55">
              {aiIsThinking ? "Oraculo procesando..." : "Canal IA operativo"}
            </p>
            <p className="mt-1 text-[10px] uppercase tracking-[0.12em] text-emerald-300/80">
              {`${selectedProviderDescriptor.label} · ${selectedProviderDraft.model || selectedProviderDescriptor.defaultModel}`}
            </p>
          </div>
          <div className="grid grid-cols-2 border border-cyan-200/15 bg-black/35 p-1 text-[10px] uppercase tracking-[0.08em]">
            <button
              type="button"
              onClick={() => setCurrentUniverse("user")}
              className={currentUniverse === "user" ? "bg-tbit-cyan px-3 py-2 font-bold text-slate-950" : "px-3 py-2 text-cyan-100/55"}
            >
              User
            </button>
            <button
              type="button"
              onClick={() => setCurrentUniverse("ai")}
              className={currentUniverse === "ai" ? "bg-emerald-400 px-3 py-2 font-bold text-slate-950" : "px-3 py-2 text-cyan-100/55"}
            >
              AI Mem
            </button>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <div className="border border-cyan-200/12 bg-black/30 p-3">
            <p className="text-cyan-100/45">Universo visible</p>
            <p className="mt-1 text-tbit-cyan">{currentUniverse === "ai" ? "ai_memoria.tbit" : "universo.tbit"}</p>
          </div>
          <div className="border border-cyan-200/12 bg-black/30 p-3">
            <p className="text-cyan-100/45">Nodos IA</p>
            <p className="mt-1 text-white">{aiVits.length}</p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsZenMode(true)}
          className="mt-3 border border-emerald-400/40 bg-emerald-950/20 px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-emerald-300 transition hover:bg-emerald-400 hover:text-slate-950"
        >
          Entrar a Modo Zen
        </button>

        <div className="mt-3 min-h-0 flex-1 space-y-3 overflow-y-auto border border-cyan-200/10 bg-black/35 p-3 font-mono text-xs">
          {aiMessages.map((message) => (
            <div key={message.id} className="border-l border-cyan-200/18 pl-3">
              <p className={message.sender === "T-User" ? "text-tbit-cyan" : "text-emerald-300"}>
                {message.sender}
              </p>
              <p className="mt-1 whitespace-pre-wrap break-words text-cyan-50/78">{message.text}</p>
            </div>
          ))}
          <div ref={aiChatEndRef} />
        </div>

        <div className="mt-3 flex gap-2">
          <input
            value={aiInput}
            onChange={(event) => setAiInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                void handleAiCommand();
              }
            }}
            className="min-w-0 flex-1 border border-cyan-200/18 bg-black/45 px-3 py-2 text-xs text-white outline-none transition focus:border-tbit-cyan"
            placeholder="recuerda ... / consulta ..."
            autoComplete="off"
          />
          <button
            type="button"
            onClick={() => void handleAiCommand()}
            disabled={aiIsThinking}
            className="border border-tbit-cyan/70 bg-tbit-cyan/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] text-tbit-cyan transition hover:bg-tbit-cyan hover:text-slate-950 disabled:cursor-wait disabled:opacity-50"
          >
            Ejecutar
          </button>
        </div>
      </aside>
      <div className="pointer-events-auto fixed bottom-4 right-4 z-40 flex max-h-[calc(100vh-2rem)] w-96 max-w-[calc(100vw-2rem)] flex-col gap-3 overflow-y-auto">
        <div className="border border-amber-300/30 bg-amber-950/18 p-4 shadow-[0_0_34px_rgba(251,191,36,0.12)] backdrop-blur-xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-amber-200">Modo Desarrollador</p>
              <p className="mt-2 text-xs leading-relaxed text-amber-50/70">
                Área avanzada aislada de Q-Vault: aquí viven los controles físicos, criptográficos y de auditoria.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsZenMode(true)}
              className="shrink-0 border border-emerald-300/40 bg-emerald-400/12 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-200 transition hover:bg-emerald-300 hover:text-slate-950"
            >
              Usuario
            </button>
          </div>
          <div className="mt-3 grid gap-1.5 border-t border-amber-200/16 pt-3">
            {developerSubsystems.map((item) => (
              <p key={item} className="text-[10px] leading-relaxed text-amber-50/66">
                <span className="text-amber-200">[DEV]</span> {item}
              </p>
            ))}
          </div>
        </div>
        <ContainerHealthPanel />
        <AgentRuntimePanel />
        <EncryptionKeyPanel />
        <AiPermissionsPanel />
        <TBitNetworkPanel />
        <QueryIndexPanel />
        <GuardianObserverPanel />
        <AssetManagerPanel />
        <BinaryAssetPanel />
        <MemoryGraphPanel />
        <MarkdownImportPanel />
      </div>
        </>
      )}

      {isFirstRunModalOpen && (
        <div className="pointer-events-auto fixed inset-0 z-[90] flex items-center justify-center bg-[#0b102f]/80 px-5 py-6 backdrop-blur-xl">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void saveUserProfile();
            }}
            className="max-h-[94vh] w-full max-w-[760px] overflow-y-auto rounded-[28px] border border-white/14 bg-[#1f2a68]/92 text-white shadow-[0_30px_120px_rgba(0,0,0,0.65)]"
          >
            <div className="border-b border-white/10 p-8">
              <p className="text-[10px] uppercase tracking-[0.28em] text-cyan-200/80">Primer arranque</p>
              <h2 className="mt-3 text-4xl font-semibold tracking-[-0.04em]">Configura tu Q-Vault OS</h2>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-blue-100/68">
                Esta identidad local se usará para guardar memorias, documentos y consultas sin mezclar tu vacío con otros usuarios.
              </p>
            </div>

            <div className="grid gap-5 p-8">
              <label className="block">
                <span className="text-[10px] uppercase tracking-[0.18em] text-blue-100/55">Nombre visible</span>
                <input
                  value={profileDraft.displayName}
                  onChange={(event) => {
                    const displayName = event.target.value;
                    setProfileDraft((current) => ({
                      ...current,
                      displayName,
                      userId: current.userId || normalizeUserScope(displayName),
                    }));
                  }}
                  className="mt-2 w-full rounded-2xl border border-white/12 bg-[#141c4a] px-4 py-3 text-white outline-none transition placeholder:text-blue-100/35 focus:border-cyan-200/70"
                  placeholder="Ej. Mauricio"
                  autoFocus
                />
              </label>

              <label className="block">
                <span className="text-[10px] uppercase tracking-[0.18em] text-blue-100/55">ID de usuario T-BIT</span>
                <input
                  value={profileDraft.userId}
                  onChange={(event) => setProfileDraft((current) => ({ ...current, userId: normalizeUserScope(event.target.value) }))}
                  className="mt-2 w-full rounded-2xl border border-white/12 bg-[#141c4a] px-4 py-3 text-white outline-none transition placeholder:text-blue-100/35 focus:border-cyan-200/70"
                  placeholder="mauricio"
                />
                <p className="mt-2 text-xs text-blue-100/52">
                  Este ID se usa como raiz logica para tus claves. Puedes cambiarlo luego desde Ajustes.
                </p>
              </label>

              <label className="block">
                <span className="text-[10px] uppercase tracking-[0.18em] text-blue-100/55">Email de registro</span>
                <input
                  type="email"
                  value={profileDraft.email ?? ""}
                  onChange={(event) => setProfileDraft((current) => ({ ...current, email: event.target.value }))}
                  className="mt-2 w-full rounded-2xl border border-white/12 bg-[#141c4a] px-4 py-3 text-white outline-none transition placeholder:text-blue-100/35 focus:border-cyan-200/70"
                  placeholder="usuario@dominio.com"
                />
                <p className="mt-2 text-xs text-blue-100/52">
                  Este email queda ligado al perfil local y al manifiesto de cada espacio T-BIT que crees.
                </p>
              </label>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="text-[10px] uppercase tracking-[0.18em] text-blue-100/55">
                    {userProfile?.passwordHash || profileDraft.passwordHash ? "Nueva contraseña local opcional" : "Contrasena local"}
                  </span>
                  <input
                    type="password"
                    value={registrationPassword}
                    onChange={(event) => setRegistrationPassword(event.target.value)}
                    className="mt-2 w-full rounded-2xl border border-white/12 bg-[#141c4a] px-4 py-3 text-white outline-none transition placeholder:text-blue-100/35 focus:border-cyan-200/70"
                    placeholder="Minimo 8 caracteres"
                  />
                </label>
                <label className="block">
                  <span className="text-[10px] uppercase tracking-[0.18em] text-blue-100/55">Confirmar contraseña</span>
                  <input
                    type="password"
                    value={registrationPasswordConfirm}
                    onChange={(event) => setRegistrationPasswordConfirm(event.target.value)}
                    className="mt-2 w-full rounded-2xl border border-white/12 bg-[#141c4a] px-4 py-3 text-white outline-none transition placeholder:text-blue-100/35 focus:border-cyan-200/70"
                    placeholder="Repite la contraseña"
                  />
                </label>
              </div>
              <p className="-mt-2 text-xs leading-relaxed text-blue-100/52">
                La contraseña no se guarda en texto plano: T-BIT almacena un hash local PBKDF2-SHA256 con salt.
              </p>

              <label className="block">
                <span className="text-[10px] uppercase tracking-[0.18em] text-blue-100/55">Carpeta local de bovedas T-BIT</span>
                <input
                  value={profileDraft.vaultRoot ?? ""}
                  onChange={(event) => setProfileDraft((current) => ({ ...current, vaultRoot: event.target.value }))}
                  className="mt-2 w-full rounded-2xl border border-white/12 bg-[#141c4a] px-4 py-3 text-white outline-none transition placeholder:text-blue-100/35 focus:border-cyan-200/70"
                  placeholder="Vacio = carpeta interna del proyecto/data/spaces"
                />
                <p className="mt-2 text-xs leading-relaxed text-blue-100/52">
                  En esta version web/local pega una ruta del equipo. T-BIT la recordara en tu perfil y buscara tus espacios ahi en cada sesion.
                </p>
              </label>

              <label className="block">
                <span className="text-[10px] uppercase tracking-[0.18em] text-blue-100/55">Tamaño preferido del vacío cuántico</span>
                <select
                  value={profileDraft.containerSizeMb}
                  onChange={(event) => setProfileDraft((current) => ({ ...current, containerSizeMb: Number(event.target.value) }))}
                  className="mt-2 w-full rounded-2xl border border-white/12 bg-[#141c4a] px-4 py-3 text-white outline-none transition focus:border-cyan-200/70"
                >
                  <option value={1024}>1 GB</option>
                  <option value={2048}>2 GB</option>
                  <option value={5120}>5 GB</option>
                  <option value={10240}>10 GB</option>
                </select>
                <input
                  type="number"
                  min={MIN_VAULT_SIZE_MB}
                  max={MAX_VAULT_SIZE_MB}
                  step={256}
                  value={profileDraft.containerSizeMb}
                  onChange={(event) => setProfileDraft((current) => ({ ...current, containerSizeMb: Number(event.target.value) }))}
                  className="mt-2 w-full rounded-2xl border border-white/12 bg-[#101741] px-4 py-3 text-white outline-none transition placeholder:text-blue-100/35 focus:border-cyan-200/70"
                  placeholder="Tamaño personalizado en MB"
                />
                <p className="mt-2 text-xs text-blue-100/52">
                  T-BIT creará el espacio físico si no existe. Rango permitido: {MIN_VAULT_SIZE_MB} MB a {MAX_VAULT_SIZE_MB} MB.
                </p>
              </label>
              <div className="rounded-2xl border border-white/12 bg-[#141c4a] p-4">
                <p className="text-[10px] uppercase tracking-[0.18em] text-blue-100/55">Si ya existe un espacio T-BIT</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setSpacePrepareMode("keep")}
                    className={spacePrepareMode === "keep"
                      ? "rounded-2xl border border-emerald-300/70 bg-emerald-300/16 p-3 text-left text-sm text-emerald-100"
                      : "rounded-2xl border border-white/10 bg-white/5 p-3 text-left text-sm text-blue-100/70 transition hover:border-emerald-200/45"}
                  >
                    <span className="block font-bold">Conservar existente</span>
                    <span className="mt-1 block text-xs opacity-70">Usa el contenedor actual y evita cualquier perdida de datos.</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSpacePrepareMode("overwrite")}
                    className={spacePrepareMode === "overwrite"
                      ? "rounded-2xl border border-rose-300/70 bg-rose-300/16 p-3 text-left text-sm text-rose-100"
                      : "rounded-2xl border border-white/10 bg-white/5 p-3 text-left text-sm text-blue-100/70 transition hover:border-rose-200/45"}
                  >
                    <span className="block font-bold">Sobrescribir y recrear</span>
                    <span className="mt-1 block text-xs opacity-70">Reinicia el vacío con el tamaño elegido. Requiere confirmación final.</span>
                  </button>
                </div>
                {spacePrepareMode === "overwrite" && (
                  <p className="mt-3 rounded-xl border border-rose-300/35 bg-rose-500/10 p-3 text-xs leading-relaxed text-rose-100/85">
                    Advertencia: esta opcion borra metadata, WAL y contenido del contenedor seleccionado para crear un espacio limpio.
                  </p>
                )}
              </div>
              <div className="rounded-2xl border border-white/12 bg-[#141c4a] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.18em] text-blue-100/55">Espacios existentes en esta carpeta</p>
                    <p className="mt-1 text-xs text-blue-100/52">Selecciona espacios inactivos para eliminarlos con doble confirmación.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void loadSpaceInventory()}
                    disabled={isLoadingSpaceInventory}
                    className="rounded-xl border border-cyan-200/35 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-cyan-100 transition hover:bg-cyan-300 hover:text-[#16235d] disabled:cursor-wait disabled:opacity-50"
                  >
                    {isLoadingSpaceInventory ? "Leyendo..." : "Buscar espacios"}
                  </button>
                </div>
                <div className="mt-3 max-h-36 space-y-2 overflow-y-auto pr-1">
                  {spaceInventory.length === 0 ? (
                    <div className="rounded-xl border border-white/10 bg-black/18 p-3 text-xs text-blue-100/48">
                      No hay espacios cargados todavia.
                    </div>
                  ) : spaceInventory.map((space) => {
                    const selected = selectedSpaceIdsForDelete.includes(space.spaceId);
                    return (
                      <label
                        key={space.spaceId}
                        className={space.active
                          ? "flex items-start gap-3 rounded-xl border border-emerald-300/35 bg-emerald-400/8 p-3"
                          : selected
                            ? "flex items-start gap-3 rounded-xl border border-rose-300/45 bg-rose-400/10 p-3"
                            : "flex items-start gap-3 rounded-xl border border-white/10 bg-black/18 p-3"}
                      >
                        <input
                          type="checkbox"
                          checked={selected}
                          disabled={space.active}
                          onChange={() => toggleSpaceDeleteSelection(space.spaceId)}
                          className="mt-1 h-4 w-4 accent-rose-400 disabled:opacity-35"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-sm font-semibold text-white">{space.label}</p>
                            {space.active && <span className="rounded-full border border-emerald-300/35 px-2 py-0.5 text-[9px] uppercase tracking-[0.12em] text-emerald-200">Activo</span>}
                          </div>
                          <p className="mt-1 break-all text-[11px] text-blue-100/50">{space.spaceId}</p>
                          <p className="mt-1 text-[11px] text-blue-100/42">Tamaño físico: {space.sizeMB.toFixed(2)} MB</p>
                        </div>
                        {!space.active && (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.preventDefault();
                              void activateInventorySpace(space);
                            }}
                            disabled={isSavingProfile}
                            className="shrink-0 rounded-lg border border-cyan-200/35 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-cyan-100 transition hover:bg-cyan-300 hover:text-[#16235d] disabled:cursor-wait disabled:opacity-50"
                          >
                            Usar
                          </button>
                        )}
                      </label>
                    );
                  })}
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
                  <input
                    value={spaceDeleteConfirmation}
                    onChange={(event) => setSpaceDeleteConfirmation(event.target.value)}
                    className="rounded-xl border border-white/12 bg-[#101741] px-3 py-2 text-xs text-white outline-none focus:border-rose-300"
                    placeholder="Para borrar, escribe ELIMINAR"
                  />
                  <button
                    type="button"
                    onClick={() => void deleteSelectedSpaces()}
                    disabled={isDeletingSpaces || selectedSpaceIdsForDelete.length === 0 || spaceDeleteConfirmation !== "ELIMINAR"}
                    className="rounded-xl border border-rose-300/45 bg-rose-500/12 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-rose-100 transition hover:bg-rose-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    {isDeletingSpaces ? "Eliminando..." : "Eliminar"}
                  </button>
                </div>
                <p className="mt-3 rounded-xl border border-white/10 bg-black/18 p-3 text-xs text-blue-100/58">
                  {spaceManagerStatus}
                </p>
              </div>
              {profileSetupStatus && (
                <div className="rounded-2xl border border-cyan-200/20 bg-cyan-950/30 p-3 text-xs leading-relaxed text-cyan-100/82">
                  {profileSetupStatus}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-4 border-t border-white/10 bg-[#172158]/70 p-6">
              <p className="text-xs text-blue-100/55">Tus datos permanecen locales y cifrados en el contenedor T-BIT.</p>
              <button
                type="submit"
                disabled={
                  !profileDraft.displayName.trim()
                  || !normalizeEmail(profileDraft.email ?? "")
                  || (!userProfile?.passwordHash && !profileDraft.passwordHash && registrationPassword.length < 8)
                  || isSavingProfile
                }
                className="rounded-2xl bg-emerald-400 px-6 py-3 text-xs font-bold uppercase tracking-[0.14em] text-[#16235d] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSavingProfile ? "Preparando..." : "Crear Q-Vault OS"}
              </button>
            </div>
          </form>
        </div>
      )}

      {isSettingsModalOpen && (
        <div className="pointer-events-auto fixed inset-0 z-[80] flex items-center justify-center bg-black/52 px-5 py-6 backdrop-blur-md">
          <div className="grid h-full max-h-[820px] w-full max-w-[1120px] grid-cols-[250px_minmax(0,1fr)] overflow-hidden rounded-2xl border border-white/12 bg-[#1f1f20] text-white shadow-[0_30px_120px_rgba(0,0,0,0.65)]">
            <aside className="min-h-0 overflow-y-auto border-r border-white/10 bg-[#181819] p-4">
              <p className="mb-4 text-xs text-white/45">Opciones</p>
              <div className="space-y-1">
                {settingsTabs.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setSettingsModalTab(id)}
                    className={settingsModalTab === id
                      ? "flex w-full items-center gap-3 rounded-md bg-white/10 px-3 py-2 text-left text-sm text-white"
                      : "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm text-white/72 transition hover:bg-white/7 hover:text-white"}
                  >
                    <Icon size={16} className="text-white/70" />
                    {label}
                  </button>
                ))}
              </div>

              <div className="mt-8 border-t border-white/10 pt-4">
                <p className="mb-3 text-xs text-white/35">Plugins principales</p>
                {[
                  ["Enlaces entrantes", Link2],
                      ["Lienzo", MapIcon],
                  ["Paleta de comandos", Search],
                  ["Notas diarias", FileText],
                  ["Grafo de memoria", Brain],
                  ["Panel de IA", Bot],
                ].map(([label, Icon]) => {
                  const PluginIcon = Icon as typeof Brain;
                  return (
                    <div key={label as string} className="flex items-center justify-between gap-3 rounded-md px-3 py-2 text-sm text-white/50">
                      <span className="flex min-w-0 items-center gap-3">
                      <PluginIcon size={16} className="text-white/45" />
                        <span className="truncate">{label as string}</span>
                      </span>
                      <span className="text-[10px] uppercase tracking-[0.14em] text-white/28">Plan</span>
                    </div>
                  );
                })}
              </div>
            </aside>

            <section className="relative min-h-0 overflow-y-auto bg-[#202020] p-8">
              <button
                type="button"
                onClick={() => setIsSettingsModalOpen(false)}
                className="absolute right-4 top-4 rounded-md p-2 text-white/55 transition hover:bg-white/8 hover:text-white"
                aria-label="Cerrar ajustes"
              >
                <X size={20} />
              </button>

              {settingsModalTab === "general" && (
                <div className="max-w-[760px] space-y-8">
                  <div className="rounded-xl bg-[#282828] p-5">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <h3 className="text-lg font-semibold">Perfil local</h3>
                        <p className="mt-1 text-sm text-white/58">
                          Este usuario firma el contexto de memorias, documentos y consultas dentro de Q-Vault OS.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setProfileDraft(userProfile ?? buildDefaultUserProfile());
                          setRegistrationPassword("");
                          setRegistrationPasswordConfirm("");
                          setIsFirstRunModalOpen(true);
                        }}
                        className="rounded-md bg-[#8b5cf6] px-5 py-2 text-sm font-semibold text-white"
                      >
                        Editar perfil
                      </button>
                    </div>
                    <div className="mt-5 grid gap-4 sm:grid-cols-4">
                      <div>
                        <p className="text-sm text-white/45">Nombre</p>
                        <p className="mt-1 text-white">{activeDisplayName()}</p>
                      </div>
                      <div>
                        <p className="text-sm text-white/45">ID T-BIT</p>
                        <p className="mt-1 text-cyan-200">{activeUserId()}</p>
                      </div>
                      <div>
                        <p className="text-sm text-white/45">Email</p>
                        <p className="mt-1 break-all text-white">{userProfile?.email || "Sin registrar"}</p>
                      </div>
                      <div>
                        <p className="text-sm text-white/45">Vacio preferido</p>
                        <p className="mt-1 text-white">{userProfile?.containerSizeMb ?? 1024} MB</p>
                      </div>
                      <div className="sm:col-span-4">
                        <p className="text-sm text-white/45">Credencial local</p>
                        <p className="mt-1 text-emerald-200">
                          {userProfile?.passwordHash ? "Contrasena local protegida con PBKDF2-SHA256" : "Pendiente de configurar"}
                        </p>
                      </div>
                    </div>
                    <div className="mt-5 flex items-center justify-between gap-4 border-t border-white/8 pt-4">
                      <div>
                        <p>Eliminar usuario local</p>
                        <p className="text-sm text-white/55">Borra el perfil guardado en este navegador. Las bóvedas .tbit se conservan y se eliminan solo desde Bovedas.</p>
                      </div>
                      <button
                        type="button"
                        onClick={deleteLocalUserProfile}
                        disabled={!userProfile}
                        className="rounded-md border border-rose-300/45 bg-rose-500/12 px-4 py-2 text-sm font-semibold text-rose-100 transition hover:bg-rose-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        Eliminar usuario
                      </button>
                    </div>                  </div>

                  <div className="rounded-xl bg-[#282828] p-5">
                    <div className="flex items-center justify-between gap-4 border-b border-white/8 pb-4">
                      <div>
                        <h3 className="text-lg font-semibold">T-BIT CORE v1.1</h3>
                        <p className="mt-1 text-sm text-white/58">Motor local de memoria persistente.</p>
                        <button type="button" onClick={() => setSettingsModalTab("advanced")} className="mt-1 text-sm text-purple-300 underline">Ver estado de producto.</button>
                      </div>
                      <button type="button" onClick={() => setSettingsModalTab("storage")} className="rounded-md bg-[#8b5cf6] px-5 py-2 text-sm font-semibold text-white">Ver bovedas</button>
                    </div>
                    <div className="flex items-center justify-between gap-4 border-b border-white/8 py-4">
                      <div>
                        <p>Autoguardar memoria</p>
                        <p className="text-sm text-white/55">Guarda cada entrada exitosa del usuario y cada respuesta de IA como registro de Memory Core.</p>
                      </div>
                      <button type="button" onClick={() => toggleUserSetting("autoSaveMemory")} className={userSettings.autoSaveMemory ? "h-6 w-11 rounded-full bg-[#8b5cf6] p-1" : "h-6 w-11 rounded-full bg-white/18 p-1"}>
                        <span className={userSettings.autoSaveMemory ? "block h-4 w-4 translate-x-5 rounded-full bg-white transition" : "block h-4 w-4 rounded-full bg-white transition"} />
                      </button>
                    </div>
                    <div className="flex items-center justify-between gap-4 border-b border-white/8 py-4">
                      <div>
                        <p>Consenso Multi-IA</p>
                        <p className="text-sm text-white/55">Consulta los proveedores IA configurados y guarda la respuesta final en el notebook activo. Rápido es el modo predeterminado.</p>
                        <label className="mt-3 block max-w-[260px]">
                          <span className="text-xs uppercase tracking-[0.16em] text-white/38">Modo Multi-IA</span>
                          <select
                            value={multiAiMode}
                            onChange={(event) => updateMultiAiMode(event.target.value as MultiAiMode)}
                            disabled={!userSettings.multiAiConsensus}
                            className="mt-1 w-full rounded-md border border-white/12 bg-[#3a3a3a] px-3 py-2 text-sm text-white outline-none disabled:opacity-45"
                          >
                            <option value="fast">Rapido</option>
                            <option value="deliberative">Deliberativo</option>
                            <option value="critical">Critico</option>
                          </select>
                        </label>
                      </div>
                      <button type="button" onClick={() => toggleUserSetting("multiAiConsensus")} className={userSettings.multiAiConsensus ? "h-6 w-11 rounded-full bg-[#8b5cf6] p-1" : "h-6 w-11 rounded-full bg-white/18 p-1"}>
                        <span className={userSettings.multiAiConsensus ? "block h-4 w-4 translate-x-5 rounded-full bg-white transition" : "block h-4 w-4 rounded-full bg-white transition"} />
                      </button>
                    </div>
                    <div className="flex items-center justify-between gap-4 py-4">
                      <div>
                        <p>Idioma</p>
                        <p className="text-sm text-white/55">Cambia el idioma de visualización.</p>
                      </div>
                      <select value={userSettings.language} onChange={(event) => setUserSettings((current) => { const next = { ...current, language: event.target.value }; window.localStorage.setItem(USER_SETTINGS_STORAGE_KEY, JSON.stringify(next)); return next; })} className="rounded-md border border-white/12 bg-[#3a3a3a] px-3 py-2 text-sm text-white outline-none">
                        <option value="es">Español</option>
                        <option value="en" disabled>English (pendiente)</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <h3 className="mb-3 text-lg font-semibold">Cuenta local</h3>
                    <div className="rounded-xl bg-[#282828] p-5">
                      <div className="flex items-center justify-between gap-4 border-b border-white/8 pb-4">
                        <div>
                          <p>Boveda local</p>
                          <p className="text-sm text-white/55">Tus datos permanecen en el contenedor `.tbit` cifrado del usuario activo.</p>
                        </div>
                        <button type="button" onClick={() => setSettingsModalTab("storage")} className="rounded-md bg-[#3a3a3a] px-4 py-2 text-sm text-white">Administrar</button>
                      </div>
                      <div className="flex items-center justify-between gap-4 pt-4">
                        <div>
                          <p>Modelos de IA</p>
                          <p className="text-sm text-white/55">Conecta, activa o crea agentes para usar el mismo Memory Core.</p>
                        </div>
                        <button type="button" onClick={() => setSettingsModalTab("ai")} className="rounded-md bg-[#8b5cf6] px-4 py-2 text-sm font-semibold text-white">Configurar IA</button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {settingsModalTab === "editor" && (
                <div className="max-w-[800px] space-y-8">
                  <div className="rounded-xl bg-[#282828] p-5">
                    {[
                      ["Always focus new tabs", "When you open a new memory, switch to it immediately.", "focusNewTabs"],
                      ["Live Preview", "Default clean reading/editing mode for Markdown memories.", "livePreview"],
                      ["Show graph hints", "Display lightweight help inside memory graph panels.", "showGraphHints"],
                      ["Spellcheck", "Turn on spelling assistance in text inputs.", "spellcheck"],
                      ["Auto-pair Markdown syntax", "Pair markdown symbols for bold, italic, code and links.", "autoPairMarkdown"],
                    ].map(([title, description, key]) => (
                      <div key={key} className="flex items-center justify-between gap-4 border-b border-white/8 py-4 last:border-b-0">
                        <div>
                          <p>{title}</p>
                          <p className="text-sm text-white/55">{description}</p>
                        </div>
                        <button type="button" onClick={() => toggleUserSetting(key as keyof typeof userSettings)} className={userSettings[key as keyof typeof userSettings] ? "h-6 w-11 rounded-full bg-[#8b5cf6] p-1" : "h-6 w-11 rounded-full bg-white/18 p-1"}>
                          <span className={userSettings[key as keyof typeof userSettings] ? "block h-4 w-4 translate-x-5 rounded-full bg-white transition" : "block h-4 w-4 rounded-full bg-white transition"} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {settingsModalTab === "ai" && (
                <div className="max-w-[820px] space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold">Proveedores IA</h3>
                    <p className="mt-1 text-sm text-white/55">Connect any major AI to the same encrypted T-BIT Memory Core.</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-[#282828] p-4 text-sm text-white/62">
                    <p className="font-semibold text-white">Estado operativo</p>
                    <p className="mt-1">
                      <span className="text-purple-200">Activo</span> responde en modo normal.
                      <span className="ml-2 text-emerald-200">Participa</span> entra en Multi-IA cuando el consenso esta encendido.
                    </p>
                    <p className="mt-2 text-xs text-white/45">
                      Multi-IA: {userSettings.multiAiConsensus ? `${consensusPreviewAgents.length} agente${consensusPreviewAgents.length === 1 ? "" : "s"} seleccionado${consensusPreviewAgents.length === 1 ? "" : "s"} para modo ${multiAiModeLabel()}.` : "apagado; solo responde el agente activo."}
                    </p>
                  </div>
                  <div className="grid gap-3">
                    {connectedAgents.map((agent) => (
                      <button
                        key={agent.id}
                        type="button"
                        onClick={() => selectAiProvider(agent.id)}
                        className={agent.active ? "rounded-xl border border-purple-400/45 bg-purple-500/14 p-4 text-left" : "rounded-xl border border-white/10 bg-[#282828] p-4 text-left transition hover:border-purple-300/30"}
                      >
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <p className="font-semibold">{agent.name}</p>
                            <p className="mt-1 text-sm text-white/52">{agent.detail} · {agent.protocol}</p>
                          </div>
                          <span className={agent.active ? "rounded-full bg-purple-400 px-3 py-1 text-xs font-bold text-white" : agent.configured ? "rounded-full bg-emerald-400/18 px-3 py-1 text-xs text-emerald-200" : "rounded-full bg-amber-400/18 px-3 py-1 text-xs text-amber-200"}>
                            {agent.active ? "Activo" : agent.participates ? "Participa" : agent.configured ? "Listo" : "Configurar"}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                  <div className="rounded-xl bg-[#282828] p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h4 className="font-semibold">Proveedor IA personalizado</h4>
                        <p className="mt-1 text-sm text-white/55">
                          Agrega Ollama, OpenRouter, un modelo nuevo o cualquier API compatible con OpenAI Chat Completions.
                        </p>
                      </div>
                      <span className="rounded-full border border-cyan-300/25 px-3 py-1 text-xs text-cyan-100/70">
                        OpenAI-compatible
                      </span>
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <label className="block">
                        <span className="text-xs uppercase tracking-[0.14em] text-white/40">Nombre visible</span>
                        <input
                          value={customProviderDraft.label}
                          onChange={(event) => setCustomProviderDraft((current) => ({ ...current, label: event.target.value }))}
                          className="mt-1 w-full rounded-md border border-white/12 bg-[#1f1f1f] px-3 py-2 text-sm text-white outline-none focus:border-purple-300"
                          placeholder="Ollama Local"
                        />
                      </label>
                      <label className="block">
                        <span className="text-xs uppercase tracking-[0.14em] text-white/40">Modelo</span>
                        <input
                          value={customProviderDraft.model}
                          onChange={(event) => setCustomProviderDraft((current) => ({ ...current, model: event.target.value }))}
                          className="mt-1 w-full rounded-md border border-white/12 bg-[#1f1f1f] px-3 py-2 text-sm text-white outline-none focus:border-purple-300"
                          placeholder="llama3.1, mistral, model-id"
                        />
                      </label>
                      <label className="block sm:col-span-2">
                        <span className="text-xs uppercase tracking-[0.14em] text-white/40">Base URL</span>
                        <input
                          value={customProviderDraft.baseUrl}
                          onChange={(event) => setCustomProviderDraft((current) => ({ ...current, baseUrl: event.target.value }))}
                          className="mt-1 w-full rounded-md border border-white/12 bg-[#1f1f1f] px-3 py-2 text-sm text-white outline-none focus:border-purple-300"
                          placeholder="http://localhost:11434/v1"
                        />
                      </label>
                      <label className="block">
                        <span className="text-xs uppercase tracking-[0.14em] text-white/40">API Key</span>
                        <input
                          type="password"
                          value={customProviderDraft.apiKey}
                          onChange={(event) => setCustomProviderDraft((current) => ({ ...current, apiKey: event.target.value }))}
                          className="mt-1 w-full rounded-md border border-white/12 bg-[#1f1f1f] px-3 py-2 text-sm text-white outline-none focus:border-purple-300"
                          placeholder={customProviderDraft.requiresApiKey ? "Requerida" : "Opcional para local"}
                        />
                      </label>
                      <div className="flex items-end justify-between gap-3 rounded-md border border-white/10 bg-black/20 px-3 py-2">
                        <div>
                          <p className="text-sm font-semibold">Requiere API key</p>
                          <p className="text-xs text-white/45">Apagado para Ollama/LM Studio local.</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setCustomProviderDraft((current) => ({ ...current, requiresApiKey: !current.requiresApiKey }))}
                          className={customProviderDraft.requiresApiKey ? "rounded border border-emerald-300/40 bg-emerald-400/15 px-3 py-1 text-xs font-bold text-emerald-100" : "rounded border border-white/14 bg-white/8 px-3 py-1 text-xs text-white/65"}
                        >
                          {customProviderDraft.requiresApiKey ? "ON" : "OFF"}
                        </button>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={createCustomAiProvider}
                        className="rounded-md border border-cyan-300/30 bg-cyan-400/12 px-4 py-2 text-sm font-bold text-cyan-100 transition hover:bg-cyan-300 hover:text-[#111]"
                      >
                        Agregar proveedor
                      </button>
                    </div>
                    {customAiProviders.length > 0 && (
                      <div className="mt-4 space-y-2">
                        <p className="text-xs uppercase tracking-[0.14em] text-white/40">Personalizados guardados</p>
                        {customAiProviders.map((provider) => (
                          <div key={provider.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/20 p-3">
                            <div>
                              <p className="font-semibold">{provider.label}</p>
                              <p className="text-xs text-white/45">{provider.defaultModel} · {provider.defaultBaseUrl}</p>
                            </div>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => selectAiProvider(provider.id)}
                                className="rounded border border-purple-300/35 px-3 py-1 text-xs font-bold text-purple-100 hover:bg-purple-300 hover:text-[#111]"
                              >
                                Seleccionar
                              </button>
                              <button
                                type="button"
                                onClick={() => deleteCustomAiProvider(provider.id)}
                                className="rounded border border-red-300/35 px-3 py-1 text-xs font-bold text-red-100 hover:bg-red-400 hover:text-white"
                              >
                                Borrar
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="rounded-xl bg-[#282828] p-5">
                    <h4 className="font-semibold">Instancias de agente</h4>
                    <p className="mt-1 text-sm text-white/55">
                      Crea varios agentes sobre una misma IA. Comparten credenciales, pero cada uno tiene rol y notebook propio.
                    </p>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <label className="block">
                        <span className="text-xs uppercase tracking-[0.14em] text-white/40">Nombre</span>
                        <input
                          value={agentInstanceDraft.name}
                          onChange={(event) => setAgentInstanceDraft((current) => ({ ...current, name: event.target.value }))}
                          className="mt-1 w-full rounded-md border border-white/12 bg-[#1f1f1f] px-3 py-2 text-sm text-white outline-none focus:border-purple-300"
                          placeholder="OpenAI Investigador"
                        />
                      </label>
                      <label className="block">
                        <span className="text-xs uppercase tracking-[0.14em] text-white/40">Proveedor base</span>
                        <select
                          value={agentInstanceDraft.providerId}
                          onChange={(event) => setAgentInstanceDraft((current) => ({ ...current, providerId: event.target.value }))}
                          className="mt-1 w-full rounded-md border border-white/12 bg-[#1f1f1f] px-3 py-2 text-sm text-white outline-none focus:border-purple-300"
                        >
                          {aiProviderCatalog.map((provider) => (
                            <option key={provider.id} value={provider.id}>{provider.label}</option>
                          ))}
                        </select>
                      </label>
                      <label className="block sm:col-span-2">
                        <span className="text-xs uppercase tracking-[0.14em] text-white/40">Notebook</span>
                        <input
                          value={agentInstanceDraft.notebook}
                          onChange={(event) => setAgentInstanceDraft((current) => ({ ...current, notebook: event.target.value }))}
                          className="mt-1 w-full rounded-md border border-white/12 bg-[#1f1f1f] px-3 py-2 text-sm text-white outline-none focus:border-purple-300"
                          placeholder="General"
                        />
                      </label>
                      <label className="block sm:col-span-2">
                        <span className="text-xs uppercase tracking-[0.14em] text-white/40">Rol operativo</span>
                        <textarea
                          value={agentInstanceDraft.role}
                          onChange={(event) => setAgentInstanceDraft((current) => ({ ...current, role: event.target.value }))}
                          className="mt-1 min-h-24 w-full rounded-md border border-white/12 bg-[#1f1f1f] px-3 py-2 text-sm text-white outline-none focus:border-purple-300"
                          placeholder="Investiga, critica, sintetiza, audita..."
                        />
                      </label>
                    </div>
                    <button
                      type="button"
                      onClick={createAgentInstance}
                      className="mt-4 rounded-md bg-[#8b5cf6] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#a78bfa]"
                    >
                      Crear instancia
                    </button>
                    <div className="mt-5 grid gap-2">
                      {aiAgentInstances.length === 0 ? (
                        <p className="rounded-lg border border-white/10 bg-black/18 p-3 text-sm text-white/50">Aun no hay instancias creadas.</p>
                      ) : aiAgentInstances.map((agent) => {
                        const runtime = getAgentRuntime(agent.id);
                        return (
                          <div key={agent.id} className="rounded-lg border border-white/10 bg-black/18 p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="font-semibold text-white">{agent.name}</p>
                                  {agent.id === selectedAiProviderId && (
                                    <span className="rounded-full bg-purple-400/18 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-purple-100">
                                      Activo
                                    </span>
                                  )}
                                  {agent.enabled && runtime.configured && runtime.provider.id !== "deterministic" && (
                                    <span className="rounded-full bg-emerald-400/18 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-100">
                                      Participa Multi-IA
                                    </span>
                                  )}
                                </div>
                                <p className="mt-1 text-xs text-white/52">{runtime.provider.label} · {agent.notebook}</p>
                                <p className="mt-2 text-xs leading-relaxed text-white/58">{agent.role}</p>
                              </div>
                              <div className="flex shrink-0 flex-wrap justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => selectAiProvider(agent.id)}
                                  className={agent.id === selectedAiProviderId ? "rounded-md bg-purple-400/22 px-3 py-1 text-xs font-bold text-purple-100" : "rounded-md bg-white/10 px-3 py-1 text-xs text-white/70 hover:bg-purple-400/18 hover:text-purple-100"}
                                >
                                  {agent.id === selectedAiProviderId ? "Principal" : "Activar principal"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => toggleAgentInstance(agent.id)}
                                  className={agent.enabled ? "rounded-md bg-emerald-400/18 px-3 py-1 text-xs text-emerald-200" : "rounded-md bg-white/10 px-3 py-1 text-xs text-white/55"}
                                >
                                  {agent.enabled ? "Participa" : "No participa"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => deleteAgentInstance(agent.id)}
                                  className="rounded-md bg-rose-500/14 px-3 py-1 text-xs text-rose-200"
                                >
                                  Borrar
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {settingsModalTab === "storage" && (
                <div className="max-w-[800px] space-y-6">
                  <h3 className="text-lg font-semibold">Bóvedas</h3>
                  <div className="rounded-xl bg-[#282828] p-5">
                    <div className="grid gap-4 sm:grid-cols-3">
                      <div>
                        <p className="text-sm text-white/45">Container</p>
                        <p className="mt-1 text-xl">{userProfile?.containerSizeMb ?? 1024} MB</p>
                      </div>
                      <div>
                        <p className="text-sm text-white/45">Visible nodes</p>
                        <p className="mt-1 text-xl">{renderableVits.length}</p>
                        {hiddenInternalChunkCount > 0 && (
                          <p className="mt-1 text-[10px] text-white/35">{hiddenInternalChunkCount} chunks internos ocultos</p>
                        )}
                      </div>
                      <div>
                        <p className="text-sm text-white/45">AI memories</p>
                        <p className="mt-1 text-xl">{aiVits.length}</p>
                      </div>
                    </div>
                    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/8 pt-4">
                      <p className="text-sm text-white/55">
                        El reporte avanzado de salud permanece disponible en Modo Desarrollador.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setProfileDraft(userProfile ?? buildDefaultUserProfile());
                          setRegistrationPassword("");
                          setRegistrationPasswordConfirm("");
                          setIsFirstRunModalOpen(true);
                        }}
                        className="rounded-md border border-purple-300/35 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-purple-100 transition hover:bg-purple-300 hover:text-[#111]"
                      >
                        Cambiar usuario / tamano
                      </button>
                    </div>
                  </div>

                  <div className="rounded-xl bg-[#282828] p-5">
                    <h4 className="font-semibold text-white">Carpeta de bovedas</h4>
                    <p className="mt-1 max-w-xl text-sm leading-relaxed text-white/55">
                      Esta ruta se guarda en el perfil local. T-BIT buscara y creara espacios aqui para el usuario activo.
                    </p>
                    <input
                      value={profileDraft.vaultRoot ?? ""}
                      onChange={(event) => {
                        const vaultRoot = event.target.value;
                        setProfileDraft((current) => ({ ...current, vaultRoot }));
                        if (userProfile) {
                          const nextProfile = { ...userProfile, vaultRoot };
                          setUserProfile(nextProfile);
                          window.localStorage.setItem(USER_PROFILE_STORAGE_KEY, JSON.stringify(nextProfile));
                        }
                      }}
                      className="mt-4 w-full rounded-md border border-white/12 bg-[#1f1f1f] px-3 py-2 text-sm text-white outline-none focus:border-purple-300"
                      placeholder="Vacio = carpeta interna del proyecto/data/spaces"
                    />
                    <p className="mt-2 text-xs text-white/45">
                      Para un selector nativo de carpetas tipo Windows necesitaremos el empaquetado desktop Electron/Tauri; esta version local usa ruta escrita y lista visual.
                    </p>
                  </div>

                  <div className="rounded-xl bg-[#282828] p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h4 className="font-semibold text-white">Espacios T-BIT del equipo</h4>
                        <p className="mt-1 max-w-xl text-sm leading-relaxed text-white/55">
                          T-BIT selecciona automáticamente el espacio del usuario activo. Desde aquí puedes eliminar espacios antiguos o de prueba sin tocar el espacio que esta en uso.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void loadSpaceInventory()}
                        disabled={isLoadingSpaceInventory}
                        className="rounded-md border border-white/15 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-white/75 transition hover:border-purple-300 hover:text-purple-200 disabled:cursor-wait disabled:opacity-50"
                      >
                        {isLoadingSpaceInventory ? "Cargando..." : "Actualizar"}
                      </button>
                    </div>

                    <div className="mt-4 grid gap-2">
                      {spaceInventory.length === 0 ? (
                        <div className="rounded-lg border border-white/10 bg-black/18 p-3 text-sm text-white/50">
                          No hay espacios registrados todavia, o aun no se ha cargado el inventario.
                        </div>
                      ) : spaceInventory.map((space) => {
                        const selected = selectedSpaceIdsForDelete.includes(space.spaceId);
                        return (
                          <label
                            key={space.spaceId}
                            className={space.active
                              ? "flex items-start gap-3 rounded-lg border border-emerald-300/35 bg-emerald-400/8 p-3"
                              : selected
                                ? "flex items-start gap-3 rounded-lg border border-rose-300/45 bg-rose-400/10 p-3"
                                : "flex items-start gap-3 rounded-lg border border-white/10 bg-black/18 p-3"}
                          >
                            <input
                              type="checkbox"
                              checked={selected}
                              disabled={space.active}
                              onChange={() => toggleSpaceDeleteSelection(space.spaceId)}
                              className="mt-1 h-4 w-4 accent-rose-400 disabled:opacity-35"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="truncate font-semibold text-white">{space.label}</p>
                                {space.active && (
                                  <span className="rounded-full border border-emerald-300/35 bg-emerald-400/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-emerald-200">
                                    Activo
                                  </span>
                                )}
                              </div>
                              <p className="mt-1 break-all text-xs text-white/50">{space.spaceId}</p>
                              <p className="mt-1 text-xs text-white/45">
                                Usuario: {space.displayName || space.ownerUserId} · Tamaño: {space.sizeMB.toFixed(2)} MB
                              </p>
                            </div>
                            {!space.active && (
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.preventDefault();
                                  void activateInventorySpace(space);
                                }}
                                disabled={isSavingProfile}
                                className="shrink-0 rounded-md border border-purple-300/35 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-purple-100 transition hover:bg-purple-300 hover:text-[#111] disabled:cursor-wait disabled:opacity-50"
                              >
                                Usar
                              </button>
                            )}
                          </label>
                        );
                      })}
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
                      <input
                        value={spaceDeleteConfirmation}
                        onChange={(event) => setSpaceDeleteConfirmation(event.target.value)}
                        className="rounded-md border border-white/12 bg-[#1f1f1f] px-3 py-2 text-sm text-white outline-none focus:border-rose-300"
                        placeholder="Para borrar, escribe ELIMINAR"
                      />
                      <button
                        type="button"
                        onClick={() => void deleteSelectedSpaces()}
                        disabled={isDeletingSpaces || selectedSpaceIdsForDelete.length === 0 || spaceDeleteConfirmation !== "ELIMINAR"}
                        className="rounded-md border border-rose-300/45 bg-rose-500/12 px-5 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-rose-100 transition hover:bg-rose-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        {isDeletingSpaces ? "Eliminando..." : "Eliminar seleccionados"}
                      </button>
                    </div>

                    <p className="mt-3 rounded-lg border border-white/10 bg-black/18 p-3 text-sm text-white/60">
                      {spaceManagerStatus}
                    </p>
                  </div>
                </div>
              )}

              {settingsModalTab === "security" && (
                <div className="max-w-[800px] space-y-6">
                  <h3 className="text-lg font-semibold">Security</h3>
                  <div className="rounded-xl bg-[#282828] p-5">
                    <div className="flex items-center justify-between gap-4 border-b border-white/8 pb-4">
                      <div>
                        <p>Confirm destructive actions</p>
                        <p className="text-sm text-white/55">Require confirmation before deleting documents, chunks or assets.</p>
                      </div>
                      <button type="button" onClick={() => toggleUserSetting("confirmDeletes")} className={userSettings.confirmDeletes ? "h-6 w-11 rounded-full bg-[#8b5cf6] p-1" : "h-6 w-11 rounded-full bg-white/18 p-1"}>
                        <span className={userSettings.confirmDeletes ? "block h-4 w-4 translate-x-5 rounded-full bg-white transition" : "block h-4 w-4 rounded-full bg-white transition"} />
                      </button>
                    </div>
                    <p className="mt-4 text-sm text-white/55">Payload encryption: AES-256-GCM. Metadata integrity: HMAC. Physical validation: V + Anti-V.</p>
                  </div>
                </div>
              )}

              {settingsModalTab === "files" && (
                <div className="max-w-[800px] space-y-6">
                  <h3 className="text-lg font-semibold">Archivos y enlaces</h3>
                  <div className="rounded-xl bg-[#282828] p-5">
                    <p className="text-sm leading-relaxed text-white/62">
                      Q-Vault usa una carga universal: Markdown, PDF, DOCX, XLSX, imagenes, audio, ZIP y binarios pasan por el puente correspondiente sin mostrar chunks tecnicos al usuario normal.
                    </p>
                    <div className="mt-5 rounded-lg border border-white/10 bg-black/18 p-4">
                      {[
                        ["Analizar código automáticamente", "Cuando importas .ts, .tsx, .js, .jsx o .py, Q-Vault extrae imports, exports, funciones, clases y rutas simples para que la IA entienda mejor el proyecto.", "autoAnalyzeCode"],
                        ["Mostrar relaciones tecnicas en el mapa", "Genera enlaces tecnicos de dependencias detectadas. Mantener apagado evita ruido visual en mapas grandes.", "showCodeGraphRelations"],
                      ].map(([title, description, key]) => (
                        <div key={key} className="flex items-center justify-between gap-4 border-b border-white/8 py-4 first:pt-0 last:border-b-0 last:pb-0">
                          <div>
                            <p>{title}</p>
                            <p className="text-sm text-white/55">{description}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => toggleUserSetting(key as keyof typeof userSettings)}
                            className={userSettings[key as keyof typeof userSettings] ? "h-6 w-11 rounded-full bg-[#8b5cf6] p-1" : "h-6 w-11 rounded-full bg-white/18 p-1"}
                          >
                            <span className={userSettings[key as keyof typeof userSettings] ? "block h-4 w-4 translate-x-5 rounded-full bg-white transition" : "block h-4 w-4 rounded-full bg-white transition"} />
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className="mt-5 grid gap-3 sm:grid-cols-3">
                      <button
                        type="button"
                        onClick={() => omniFileInputRef.current?.click()}
                        className="rounded-md border border-cyan-300/35 px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-cyan-100 transition hover:bg-cyan-300 hover:text-[#111]"
                      >
                        Seleccionar archivo
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setIsSettingsModalOpen(false);
                          setZenSection("documents");
                        }}
                        className="rounded-md border border-white/15 px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-white/75 transition hover:border-purple-300 hover:text-purple-200"
                      >
                        Ver documentos
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setIsSettingsModalOpen(false);
                          setZenSection("assets");
                        }}
                        className="rounded-md border border-white/15 px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-white/75 transition hover:border-purple-300 hover:text-purple-200"
                      >
                        Ver assets
                      </button>
                    </div>
                    <p className="mt-4 rounded-lg border border-white/10 bg-black/18 p-3 text-sm text-white/58">{omniDropStatus}</p>
                  </div>
                </div>
              )}

              {settingsModalTab === "appearance" && (
                <div className="max-w-[800px] space-y-6">
                  <h3 className="text-lg font-semibold">Apariencia</h3>
                  <div className="rounded-xl bg-[#282828] p-5">
                    {[
                      ["Sidebar compacto", "Reduce densidad visual cuando la pantalla es pequena.", "compactSidebar"],
                      ["Pistas del mapa", "Muestra ayudas ligeras dentro de Q-Vault y el mapa de memoria.", "showGraphHints"],
                      ["Vista previa limpia", "Mantiene Q-Vault como interfaz principal para usuario normal.", "livePreview"],
                    ].map(([title, description, key]) => (
                      <div key={key} className="flex items-center justify-between gap-4 border-b border-white/8 py-4 last:border-b-0">
                        <div>
                          <p>{title}</p>
                          <p className="text-sm text-white/55">{description}</p>
                        </div>
                        <button type="button" onClick={() => toggleUserSetting(key as keyof typeof userSettings)} className={userSettings[key as keyof typeof userSettings] ? "h-6 w-11 rounded-full bg-[#8b5cf6] p-1" : "h-6 w-11 rounded-full bg-white/18 p-1"}>
                          <span className={userSettings[key as keyof typeof userSettings] ? "block h-4 w-4 translate-x-5 rounded-full bg-white transition" : "block h-4 w-4 rounded-full bg-white transition"} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {settingsModalTab === "notebooks" && (
                <div className="max-w-[800px] space-y-6">
                  <h3 className="text-lg font-semibold">Notebooks</h3>
                  <div className="rounded-xl bg-[#282828] p-5">
                    <label className="block">
                      <span className="text-xs uppercase tracking-[0.14em] text-white/40">Notebook activo</span>
                      <input
                        value={activeNotebook}
                        onChange={(event) => updateActiveNotebook(event.target.value)}
                        className="mt-2 w-full rounded-md border border-white/12 bg-[#1f1f1f] px-3 py-2 text-sm text-white outline-none focus:border-purple-300"
                        placeholder="General"
                      />
                    </label>
                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      <button
                        type="button"
                        onClick={renameActiveNotebook}
                        className="rounded-md border border-purple-300/35 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-purple-100 transition hover:bg-purple-300 hover:text-[#111]"
                      >
                        Renombrar
                      </button>
                      <button
                        type="button"
                        onClick={() => updateActiveNotebook("General")}
                        className="rounded-md border border-white/15 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-white/75 transition hover:border-cyan-300 hover:text-cyan-200"
                      >
                        Usar General
                      </button>
                      <button
                        type="button"
                        onClick={() => void clearVisibleConversation()}
                        className="rounded-md border border-rose-300/45 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-rose-100 transition hover:bg-rose-500 hover:text-white"
                      >
                        Borrar conversación
                      </button>
                    </div>
                    <p className="mt-4 rounded-lg border border-white/10 bg-black/18 p-3 text-sm text-white/58">
                      Las conversaciones y respuestas autosalvadas se agrupan por usuario y notebook. El borrado de conversación usa las confirmaciones ya existentes.
                    </p>
                  </div>
                </div>
              )}

              {settingsModalTab === "permissions" && (
                <div className="max-w-[800px] space-y-6">
                  <h3 className="text-lg font-semibold">Permisos IA</h3>
                  <div className="rounded-xl bg-[#282828] p-5">
                    {[
                      ["Guardar memoria automáticamente", "Permite registrar input y respuesta de IA en el notebook activo.", "autoSaveMemory"],
                      ["Consenso Multi-IA", "Permite consultar agentes configurados en paralelo o con revision.", "multiAiConsensus"],
                      ["Confirmar borrados", "Exige confirmación antes de eliminar documentos, assets o conversaciones.", "confirmDeletes"],
                    ].map(([title, description, key]) => (
                      <div key={key} className="flex items-center justify-between gap-4 border-b border-white/8 py-4 last:border-b-0">
                        <div>
                          <p>{title}</p>
                          <p className="text-sm text-white/55">{description}</p>
                        </div>
                        <button type="button" onClick={() => toggleUserSetting(key as keyof typeof userSettings)} className={userSettings[key as keyof typeof userSettings] ? "h-6 w-11 rounded-full bg-[#8b5cf6] p-1" : "h-6 w-11 rounded-full bg-white/18 p-1"}>
                          <span className={userSettings[key as keyof typeof userSettings] ? "block h-4 w-4 translate-x-5 rounded-full bg-white transition" : "block h-4 w-4 rounded-full bg-white transition"} />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => {
                        setIsSettingsModalOpen(false);
                        setIsZenMode(false);
                      }}
                      className="mt-5 rounded-md border border-amber-300/45 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-amber-100 transition hover:bg-amber-300 hover:text-[#111]"
                    >
                      Abrir permisos avanzados
                    </button>
                  </div>
                </div>
              )}

              {settingsModalTab === "keys" && (
                <div className="max-w-[800px] space-y-6">
                  <h3 className="text-lg font-semibold">Llaves</h3>
                  <div className="rounded-xl bg-[#282828] p-5">
                    <p className="text-sm leading-relaxed text-white/62">
                      Los payloads se cifran en reposo con AES-256-GCM. La metadata se valida con HMAC y el motor físico conserva V + Anti-V para verificación espacial.
                    </p>
                    <div className="mt-5 grid gap-3 sm:grid-cols-3">
                      <div className="rounded-lg border border-white/10 bg-black/18 p-3">
                        <p className="text-xs uppercase tracking-[0.14em] text-white/35">Cifrado</p>
                        <p className="mt-1 text-emerald-200">AES-256-GCM</p>
                      </div>
                      <div className="rounded-lg border border-white/10 bg-black/18 p-3">
                        <p className="text-xs uppercase tracking-[0.14em] text-white/35">Integridad</p>
                        <p className="mt-1 text-cyan-200">HMAC</p>
                      </div>
                      <div className="rounded-lg border border-white/10 bg-black/18 p-3">
                        <p className="text-xs uppercase tracking-[0.14em] text-white/35">Fisico</p>
                        <p className="mt-1 text-purple-200">V + Anti-V</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setIsSettingsModalOpen(false);
                        setIsZenMode(false);
                      }}
                      className="mt-5 rounded-md border border-cyan-300/35 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-cyan-100 transition hover:bg-cyan-300 hover:text-[#111]"
                    >
                      Abrir gestion avanzada de llaves
                    </button>
                  </div>
                </div>
              )}

              {settingsModalTab === "advanced" && (
                <div className="max-w-[800px] space-y-6">
                  <h3 className="text-lg font-semibold">Avanzado</h3>
                  <div className="rounded-xl bg-[#282828] p-5">
                    <p className="text-sm leading-relaxed text-white/62">
                      Q-Vault mantiene la experiencia normal limpia. El Modo Desarrollador conserva Quantum Engine, Health, AES keys, permisos profundos, Query Index, Guardian Observer, WAL, chunks, Vit y AntiVit.
                    </p>
                    <div className="mt-4 grid gap-2">
                      {developerSubsystems.map((item) => (
                        <div key={item} className="rounded-lg border border-white/10 bg-black/18 p-3 text-sm text-white/62">{item}</div>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setIsSettingsModalOpen(false);
                        setIsZenMode(false);
                      }}
                      className="mt-5 rounded-md border border-amber-300/45 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-amber-100 transition hover:bg-amber-300 hover:text-[#111]"
                    >
                      Abrir Modo Desarrollador
                    </button>
                  </div>
                </div>
              )}
            </section>
          </div>
        </div>
      )}
    </main>
  );
}

