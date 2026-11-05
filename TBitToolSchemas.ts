import { AiToolSchema } from "./AiProvider";
import { tbitSymbolicTools } from "./TBitSymbolicBridge";

export const tbitCoreTools: AiToolSchema[] = [
  {
    type: "function",
    function: {
      name: "memorizar_en_vacio",
      description: "Guarda un hecho, documento o memoria persistente en el contenedor .tbit.",
      parameters: {
        type: "object",
        properties: {
          key: {
            type: "string",
            description: "Clave jerarquica Dominio::Coleccion::ID.",
          },
          payload: {
            type: "object",
            description: "Objeto JSON semantico que sera persistido fisicamente.",
          },
        },
        required: ["key", "payload"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "consultar_oraculo",
      description: "Recupera una memoria persistente desde una clave jerarquica T-BIT.",
      parameters: {
        type: "object",
        properties: {
          key: {
            type: "string",
            description: "Clave jerarquica Dominio::Coleccion::ID.",
          },
        },
        required: ["key"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "buscar_indice_tbit",
      description: "Busca memorias T-BIT eficientemente por texto, usuario, tipo, tags, documento o atributo JSON sin conocer una clave exacta.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Texto a buscar. Ej: Petius, cumpleanos, tema visual." },
          userId: { type: "string", description: "Usuario propietario de la memoria." },
          source: { type: "string", description: "Tipo/fuente: markdown, markdown-chunk, ai, demo." },
          tags: {
            type: "array",
            items: { type: "string" },
            description: "Tags a filtrar.",
          },
          attribute: { type: "string", description: "Nombre de atributo JSON a buscar." },
          value: { type: "string", description: "Valor opcional que debe aparecer en el texto o atributo." },
          limit: { type: "number", description: "Maximo de resultados." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "investigar_web",
      description: "Investiga una URL web con extraccion semantica segura. No envia HTML crudo: elimina scripts, CSS, tracking, navegacion repetida y limita tokens antes de entregar contexto.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "URL http/https a investigar." },
          query: { type: "string", description: "Pregunta o enfoque del analisis." },
          maxTextChars: { type: "number", description: "Maximo de caracteres utiles extraidos. Default 12000." },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "resolver_ecuacion",
      description: "Evalua numericamente una ecuacion computable almacenada en T-BIT.",
      parameters: {
        type: "object",
        properties: {
          key: { type: "string", description: "Clave de la ecuacion almacenada." },
          variables: {
            type: "object",
            description: "Valores numericos para las variables de la formula.",
          },
        },
        required: ["key", "variables"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "eliminar_memoria",
      description: "Borra una memoria exacta del vacio T-BIT solo si la politica local permite borrado IA y existe confirmacion humana.",
      parameters: {
        type: "object",
        properties: {
          key: {
            type: "string",
            description: "Clave exacta a borrar. No adivines claves para borrado.",
          },
          confirmacion_humana: {
            type: "boolean",
            description: "Debe ser true solo si el usuario confirmo explicitamente el borrado definitivo.",
          },
        },
        required: ["key", "confirmacion_humana"],
      },
    },
  },
  ...(tbitSymbolicTools.map((tool) => ({
    type: "function" as const,
    function: tool,
  })) satisfies AiToolSchema[]),
  {
    type: "function",
    function: {
      name: "buscar_skill",
      description: "Busca en el catalogo de Skills T-BIT habilidades declarativas relevantes para una tarea.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Tarea o tematica para encontrar skills relevantes." },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "ejecutar_skill",
      description: "Carga una Skill declarativa instalada y devuelve su contenido como contexto de referencia (no ejecuta codigo).",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "Id de la skill instalada." },
          task: { type: "string", description: "Tarea donde se aplicara la skill." },
        },
        required: ["id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "instalar_skill",
      description: "Instala una skill declarativa (.md/.json) desde contenido local o desde un repositorio de referencia con commit fijado. Pasa por la politica de permisos IA.",
      parameters: {
        type: "object",
        properties: {
          contenido: { type: "string", description: "Contenido declarativo completo de la skill (con frontmatter name/id/description/tags)." },
          repo: { type: "string", description: "Repositorio origen (owner/repo) si es remota." },
          ruta: { type: "string", description: "Ruta del archivo dentro del repo si es remota." },
          commit: { type: "string", description: "Commit fijado (obligatorio para skills remotas)." },
        },
        required: ["contenido"],
      },
    },
  },
];

