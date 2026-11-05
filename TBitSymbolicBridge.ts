import { TBitStorageService } from "./TBitStorageService";
import { inferEquationKey } from "./computableMemory";
import { runSymbolicOperation, SymbolicOperation, SymbolicResult } from "./symbolicEngine";
import { normalizeTBitKey } from "./textEncoding";

export type SymbolicOracleRequest = {
  key?: string;
  text?: string;
  operation: SymbolicOperation;
  variable?: string;
};

export type SymbolicOracleResponse = SymbolicResult & {
  key?: string;
  source?: "stored_equation" | "direct_expression";
};

export const tbitSymbolicTools = [
  {
    name: "operar_simbolicamente",
    description:
      "Opera simbolicamente sobre una expresion matematica directa o sobre una ecuacion almacenada en T-BIT.",
    parameters: {
      type: "object",
      properties: {
        key: {
          type: "string",
          description:
            "Clave jerarquica opcional de una ecuacion almacenada, por ejemplo Ciencia::Relatividad::EquivalenciaEnergiaMasa.",
        },
        text: {
          type: "string",
          description:
            "Expresion matematica directa cuando no se usa una clave almacenada, por ejemplo 3*x^3 + 2*x.",
        },
        operation: {
          type: "string",
          enum: ["simplify", "derive", "integrate", "solve"],
          description: "Operacion simbolica solicitada.",
        },
        variable: {
          type: "string",
          description: "Variable principal de la operacion, por ejemplo x, m o t.",
        },
      },
      required: ["operation"],
    },
  },
];

const symbolicOperations = new Set<SymbolicOperation>(["simplify", "derive", "integrate", "solve"]);

type DynamicStorage = {
  read?: (key: string) => Promise<unknown>;
  recover?: (key: string) => Promise<unknown>;
  recuperar?: (key: string) => Promise<unknown>;
  oracle?: (key: string) => Promise<unknown>;
};

function extractPayloadText(recovered: unknown): string {
  if (typeof recovered === "string") return recovered;
  if (!recovered || typeof recovered !== "object") {
    throw new Error("El Oraculo simbolico no recibio un payload valido.");
  }

  const record = recovered as Record<string, unknown>;
  const candidates = [record.dato, record.data, record.payload, record.contenido, record.texto];
  const direct = candidates.find((value) => typeof value === "string");
  if (typeof direct === "string") return direct;

  throw new Error("La respuesta recuperada no contiene texto JSON legible.");
}

async function recoverFromStorage(storage: TBitStorageService, key: string): Promise<string> {
  const dynamicStorage = storage as unknown as DynamicStorage;
  const recover =
    dynamicStorage.read ??
    dynamicStorage.recover ??
    dynamicStorage.recuperar ??
    dynamicStorage.oracle;

  if (!recover) {
    throw new Error("TBitStorageService no expone un metodo de recuperacion compatible.");
  }

  return extractPayloadText(await recover.call(dynamicStorage, key));
}

function extractEquationExpression(payloadText: string): string {
  const equation = JSON.parse(payloadText) as Record<string, unknown>;
  const expression =
    equation.formula ??
    equation.expresion_latex ??
    equation.expression ??
    equation.expresion ??
    equation.latex;

  if (typeof expression !== "string" || expression.trim().length === 0) {
    throw new Error("La memoria recuperada no contiene una formula o expresion simbolica.");
  }

  return expression;
}

export async function operarSimbolicamente(
  storage: TBitStorageService,
  request: SymbolicOracleRequest,
): Promise<SymbolicOracleResponse> {
  if (!symbolicOperations.has(request.operation)) {
    return {
      ok: false,
      operation: request.operation,
      expression: request.text ?? request.key ?? "",
      variable: request.variable,
      error: "Operacion simbolica no soportada. Usa simplify, derive, integrate o solve.",
    };
  }

  const inferredKey = request.key ?? (request.text ? inferEquationKey(request.text) : undefined);

  if (inferredKey) {
    const key = normalizeTBitKey(inferredKey);
    const payloadText = await recoverFromStorage(storage, key);
    const expression = extractEquationExpression(payloadText);
    return {
      ...runSymbolicOperation({
        operation: request.operation,
        expression,
        variable: request.variable,
      }),
      key,
      source: "stored_equation",
    };
  }

  if (!request.text) {
    return {
      ok: false,
      operation: request.operation,
      expression: "",
      variable: request.variable,
      error: "No se recibio una expresion directa ni una clave de ecuacion almacenada.",
    };
  }

  return {
    ...runSymbolicOperation({
      operation: request.operation,
      expression: request.text,
      variable: request.variable,
    }),
    source: "direct_expression",
  };
}
