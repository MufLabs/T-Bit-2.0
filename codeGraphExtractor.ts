export type CodeGraphAnalysis = {
  language: string;
  imports: string[];
  exports: string[];
  functions: string[];
  classes: string[];
  routes: string[];
  tags: string[];
};

export type CodeGraphSummary = {
  language: string;
  imports: number;
  exports: number;
  functions: number;
  classes: number;
  routes: number;
  topImports: string[];
  topFunctions: string[];
  topClasses: string[];
};

type BuildCodeDocumentRequest = {
  userId: string;
  filename: string;
  content: string;
  includeTechnicalLinks?: boolean;
};

type BuildCodeDocumentResult = {
  content: string;
  analysis: CodeGraphAnalysis;
};

const CODE_EXTENSIONS = new Map<string, string>([
  [".ts", "typescript"],
  [".tsx", "typescript-react"],
  [".js", "javascript"],
  [".jsx", "javascript-react"],
  [".mjs", "javascript"],
  [".cjs", "javascript"],
  [".py", "python"],
  [".java", "java"],
  [".cs", "csharp"],
  [".go", "go"],
  [".rs", "rust"],
  [".php", "php"],
  [".rb", "ruby"],
  [".c", "c"],
  [".cpp", "cpp"],
  [".h", "c-header"],
  [".hpp", "cpp-header"],
  [".html", "html"],
  [".css", "css"],
  [".scss", "scss"],
]);

const CODE_MIME_HINTS = new Set([
  "application/javascript",
  "application/typescript",
  "text/javascript",
  "text/typescript",
  "text/x-python",
  "text/x-java-source",
  "text/x-c",
  "text/x-c++",
  "text/css",
  "text/html",
]);

function extensionOf(filename: string): string {
  const match = filename.toLowerCase().match(/\.[^.]+$/);
  return match?.[0] ?? "";
}

function titleFromFilename(filename: string): string {
  return filename.replace(/\.[^.]+$/, "").trim() || "CodigoFuente";
}

function yamlQuote(value: string): string {
  return JSON.stringify(value.normalize("NFC"));
}

function keySegment(value: string): string {
  return value
    .normalize("NFC")
    .trim()
    .replace(/[^A-Za-z0-9_:-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80) || "modulo";
}

function unique(values: Iterable<string>, limit = 80): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = value.normalize("NFC").trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
    if (result.length >= limit) break;
  }
  return result;
}

function matches(pattern: RegExp, content: string, group = 1): string[] {
  return unique([...content.matchAll(pattern)].map((match) => match[group] ?? ""));
}

function extractImports(language: string, content: string): string[] {
  const imports: string[] = [];

  if (language.includes("typescript") || language.includes("javascript")) {
    imports.push(...matches(/\bimport\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/g, content));
    imports.push(...matches(/\bexport\s+[\s\S]*?\s+from\s+["']([^"']+)["']/g, content));
    imports.push(...matches(/\brequire\(\s*["']([^"']+)["']\s*\)/g, content));
  } else if (language === "python") {
    imports.push(...matches(/^\s*from\s+([A-Za-z0-9_.]+)\s+import\s+/gm, content));
    for (const raw of matches(/^\s*import\s+([A-Za-z0-9_.,\s]+)/gm, content)) {
      imports.push(...raw.split(",").map((item) => item.trim().split(/\s+as\s+/i)[0] ?? ""));
    }
  } else if (language === "go") {
    imports.push(...matches(/^\s*import\s+"([^"]+)"/gm, content));
    imports.push(...matches(/^\s*"([^"]+)"\s*$/gm, content));
  } else if (language === "rust") {
    imports.push(...matches(/^\s*use\s+([^;]+);/gm, content));
  } else if (language === "java" || language === "csharp") {
    imports.push(...matches(/^\s*(?:import|using)\s+([^;]+);/gm, content));
  } else if (language === "php") {
    imports.push(...matches(/^\s*(?:use|require_once|include_once|require|include)\s+['"]?([^;'"]+)/gm, content));
  } else if (language === "ruby") {
    imports.push(...matches(/^\s*require(?:_relative)?\s+["']([^"']+)["']/gm, content));
  }

  return unique(imports);
}

function extractExports(language: string, content: string): string[] {
  if (!(language.includes("typescript") || language.includes("javascript"))) return [];
  return unique([
    ...matches(/\bexport\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g, content),
    ...matches(/\bexport\s+class\s+([A-Za-z_$][\w$]*)/g, content),
    ...matches(/\bexport\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g, content),
    ...matches(/\bexport\s+default\s+([A-Za-z_$][\w$]*)/g, content),
  ]);
}

function extractFunctions(language: string, content: string): string[] {
  if (language.includes("typescript") || language.includes("javascript")) {
    return unique([
      ...matches(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g, content),
      ...matches(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/g, content),
    ], 120);
  }
  if (language === "python") return matches(/^\s*def\s+([A-Za-z_]\w*)\s*\(/gm, content, 1);
  if (language === "go") return matches(/^\s*func\s+(?:\([^)]*\)\s*)?([A-Za-z_]\w*)\s*\(/gm, content);
  if (language === "rust") return matches(/^\s*(?:pub\s+)?fn\s+([A-Za-z_]\w*)\s*\(/gm, content);
  if (language === "ruby") return matches(/^\s*def\s+([A-Za-z_]\w*[!?=]?)\s*/gm, content);
  if (language === "php") return matches(/\bfunction\s+([A-Za-z_]\w*)\s*\(/g, content);
  return matches(/\b(?:public|private|protected|static|async|\s)+[A-Za-z_<>,\[\]?]+\s+([A-Za-z_]\w*)\s*\(/g, content, 1);
}

function extractClasses(language: string, content: string): string[] {
  if (language === "go" || language === "rust") return [];
  return matches(/\b(?:class|interface|enum|struct)\s+([A-Za-z_$][\w$]*)/g, content);
}

function extractRoutes(content: string): string[] {
  return unique([
    ...matches(/\b(?:app|router)\.(?:get|post|put|patch|delete)\(\s*["']([^"']+)["']/g, content),
    ...matches(/@(Get|Post|Put|Patch|Delete|Controller)\(\s*["']?([^"')]+)["']?\s*\)/g, content, 2),
  ]);
}

function codeFenceLanguage(language: string): string {
  if (language.includes("typescript")) return "ts";
  if (language.includes("javascript")) return "js";
  if (language === "python") return "python";
  if (language === "csharp") return "csharp";
  if (language === "cpp") return "cpp";
  return language;
}

function listSection(title: string, values: string[]): string[] {
  if (!values.length) return [`- ${title}: ninguno detectado.`];
  return [`- ${title}:`, ...values.slice(0, 40).map((value) => `  - ${value}`)];
}

function technicalLinkSection(userId: string, analysis: CodeGraphAnalysis): string[] {
  const moduleLinks = analysis.imports.slice(0, 40).map((value) => {
    const targetKey = `CodeModule::${keySegment(userId)}::${keySegment(value)}`;
    return `- Depende de [[${targetKey}]]`;
  });
  if (!moduleLinks.length) return [];
  return ["", "## Relaciones tecnicas", "", ...moduleLinks];
}

function escapeFence(content: string): string {
  return content.replace(/```/g, "`\u200b``");
}

export function isSourceCodeFile(filename: string, mimeType?: string): boolean {
  const ext = extensionOf(filename);
  const normalizedMime = (mimeType ?? "").toLowerCase().split(";")[0]?.trim() ?? "";
  return CODE_EXTENSIONS.has(ext) || CODE_MIME_HINTS.has(normalizedMime);
}

export function analyzeSourceCode(filename: string, content: string): CodeGraphAnalysis {
  const language = CODE_EXTENSIONS.get(extensionOf(filename)) ?? "code";
  const imports = extractImports(language, content);
  const exports = extractExports(language, content);
  const functions = extractFunctions(language, content);
  const classes = extractClasses(language, content);
  const routes = extractRoutes(content);
  const tags = unique([
    "code",
    `language-${language}`,
    imports.length ? "imports" : "",
    exports.length ? "exports" : "",
    functions.length ? "functions" : "",
    classes.length ? "classes" : "",
    routes.length ? "api-routes" : "",
  ]);

  return { language, imports, exports, functions, classes, routes, tags };
}

export function summarizeCodeGraph(analysis: CodeGraphAnalysis): CodeGraphSummary {
  return {
    language: analysis.language,
    imports: analysis.imports.length,
    exports: analysis.exports.length,
    functions: analysis.functions.length,
    classes: analysis.classes.length,
    routes: analysis.routes.length,
    topImports: analysis.imports.slice(0, 8),
    topFunctions: analysis.functions.slice(0, 8),
    topClasses: analysis.classes.slice(0, 8),
  };
}

export function buildCodeMarkdownDocument(request: BuildCodeDocumentRequest): BuildCodeDocumentResult {
  const analysis = analyzeSourceCode(request.filename, request.content);
  const title = titleFromFilename(request.filename);
  const frontmatter = [
    "---",
    `title: ${yamlQuote(title)}`,
    `tags: [${analysis.tags.map(yamlQuote).join(", ")}]`,
    "source_kind: code",
    `language: ${yamlQuote(analysis.language)}`,
    `code_file: ${yamlQuote(request.filename)}`,
    `code_import_count: ${analysis.imports.length}`,
    `code_export_count: ${analysis.exports.length}`,
    `code_function_count: ${analysis.functions.length}`,
    `code_class_count: ${analysis.classes.length}`,
    "---",
    "",
  ];
  const summary = [
    `# ${title}`,
    "",
    "## T-BIT Code Graph Extract",
    "",
    `- Archivo: ${request.filename}`,
    `- Usuario: ${request.userId}`,
    `- Lenguaje: ${analysis.language}`,
    ...listSection("Imports", analysis.imports),
    ...listSection("Exports", analysis.exports),
    ...listSection("Funciones", analysis.functions),
    ...listSection("Clases", analysis.classes),
    ...listSection("Rutas API", analysis.routes),
    ...(request.includeTechnicalLinks ? technicalLinkSection(request.userId, analysis) : []),
    "",
    "## Codigo fuente",
    "",
    `\`\`\`${codeFenceLanguage(analysis.language)}`,
    escapeFence(request.content.normalize("NFC")),
    "```",
  ];

  return {
    content: [...frontmatter, ...summary].join("\n"),
    analysis,
  };
}
