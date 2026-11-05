export type EquationVariable = {
  nombre: string;
  unidad?: string | null;
  descripcion?: string;
  valor?: number;
};

export type EquationMemory = {
  tipo: "ecuacion" | "ecuacion_avanzada";
  nombre: string;
  expresion_latex: string;
  expresion_texto?: string;
  symbolic?: string;
  variables: Record<string, EquationVariable>;
  operacion?: {
    resolver_para: string;
    formula: string;
  };
  supuestos?: string[];
  metodos?: string[];
  dimension_temporal?: Record<string, unknown>;
};

export type EquationDefinition = {
  dominio: string;
  coleccion: string;
  id_concepto: string;
  payload: EquationMemory;
};

export function buildEinsteinEnergyMassEquation(): EquationDefinition {
  return {
    dominio: "Ciencia",
    coleccion: "Relatividad",
    id_concepto: "EquivalenciaEnergiaMasa",
    payload: {
      tipo: "ecuacion",
      nombre: "Ecuacion de Einstein",
      expresion_latex: "E = mc^2",
      expresion_texto: "E igual a m por c al cuadrado",
      symbolic: "E = m * c**2",
      variables: {
        E: {
          nombre: "Energia",
          unidad: "J",
          descripcion: "Energia absoluta del sistema"
        },
        m: {
          nombre: "Masa",
          unidad: "kg",
          descripcion: "Masa del cuerpo"
        },
        c: {
          nombre: "Velocidad de la luz",
          unidad: "m/s",
          descripcion: "Velocidad de la luz en el vacio",
          valor: 299792458
        }
      },
      operacion: {
        resolver_para: "E",
        formula: "m * c ** 2"
      },
      dimension_temporal: {
        año_descubrimiento: 1905,
        contexto_historico: "Annus Mirabilis de Albert Einstein"
      }
    }
  };
}

export function inferEquationKey(command: string): string | undefined {
  const text = command.toLowerCase().normalize("NFC");

  if (
    text.includes("einstein")
    || text.includes("e=mc")
    || text.includes("e = mc")
    || text.includes("masa energia")
    || text.includes("masa-energia")
    || text.includes("energía masa")
  ) {
    return "Ciencia::Relatividad::EquivalenciaEnergiaMasa";
  }

  return undefined;
}

export function extractNumericVariable(command: string, variableName: string): number | undefined {
  const text = command.toLowerCase().normalize("NFC");
  const patterns = [
    new RegExp(`${variableName}\\s*=\\s*(-?\\d+(?:[\\.,]\\d+)?)`, "i"),
    /\bmasa\s+(?:de\s+)?(-?\d+(?:[\.,]\d+)?)\s*kg\b/i,
    /\bm\s+(?:de\s+)?(-?\d+(?:[\.,]\d+)?)\b/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);

    if (match) {
      return Number(match[1].replace(",", "."));
    }
  }

  return undefined;
}

export function evaluateEquation(
  equation: EquationMemory,
  providedVariables: Record<string, number>
): { variable: string; value: number; unit?: string | null } {
  if (!equation.operacion) {
    throw new Error("La ecuacion no tiene operacion computable.");
  }

  const variables: Record<string, number> = {};

  for (const [key, descriptor] of Object.entries(equation.variables)) {
    if (typeof descriptor.valor === "number") {
      variables[key] = descriptor.valor;
    }
  }

  for (const [key, value] of Object.entries(providedVariables)) {
    variables[key] = value;
  }

  const value = evaluateArithmeticExpression(equation.operacion.formula, variables);
  const resultDescriptor = equation.variables[equation.operacion.resolver_para];

  return {
    variable: equation.operacion.resolver_para,
    value,
    unit: resultDescriptor?.unidad
  };
}

function evaluateArithmeticExpression(expression: string, variables: Record<string, number>): number {
  const normalized = expression.replace(/\^/g, "**");

  if (!/^[\d\s+\-*/%().,_a-zA-Z*]+$/.test(normalized)) {
    throw new Error("La formula contiene caracteres no permitidos para evaluacion local.");
  }

  const variableNames = Object.keys(variables);

  for (const name of variableNames) {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
      throw new Error(`Nombre de variable invalido: ${name}`);
    }
  }

  const evaluator = new Function(...variableNames, `"use strict"; return (${normalized});`);
  const result = evaluator(...variableNames.map((name) => variables[name]));

  if (typeof result !== "number" || !Number.isFinite(result)) {
    throw new Error("La evaluacion no produjo un numero finito.");
  }

  return result;
}
