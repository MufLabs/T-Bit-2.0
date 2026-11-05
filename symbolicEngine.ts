export type SymbolicOperation = "simplify" | "derive" | "integrate" | "solve";

export type SymbolicRequest = {
  operation: SymbolicOperation;
  expression: string;
  variable?: string;
};

export type SymbolicResult = {
  ok: boolean;
  operation: SymbolicOperation;
  expression: string;
  variable?: string;
  result?: string;
  error?: string;
};

type ParserToken =
  | { type: "number"; value: string }
  | { type: "identifier"; value: string }
  | { type: "operator"; value: string }
  | { type: "paren"; value: "(" | ")" };

const supportedIdentifier = /^[A-Za-z_][A-Za-z0-9_]*$/;

function tokenize(expression: string): ParserToken[] {
  const tokens: ParserToken[] = [];
  let i = 0;
  while (i < expression.length) {
    const ch = expression[i];
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      let value = ch;
      i += 1;
      while (i < expression.length && /[0-9.]/.test(expression[i])) {
        value += expression[i];
        i += 1;
      }
      tokens.push({ type: "number", value });
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      let value = ch;
      i += 1;
      while (i < expression.length && /[A-Za-z0-9_]/.test(expression[i])) {
        value += expression[i];
        i += 1;
      }
      tokens.push({ type: "identifier", value });
      continue;
    }
    if (ch === "(" || ch === ")") {
      tokens.push({ type: "paren", value: ch });
      i += 1;
      continue;
    }
    if ("+-*/^=".includes(ch)) {
      tokens.push({ type: "operator", value: ch });
      i += 1;
      continue;
    }
    throw new Error(`Caracter no soportado en expresion simbolica: ${ch}`);
  }
  return tokens;
}

function normalizeExpression(expression: string): string {
  return expression
    .normalize("NFC")
    .replace(/\*\*/g, "^")
    .replace(/\s+/g, " ")
    .trim();
}

function validateExpression(expression: string): void {
  const tokens = tokenize(expression);
  if (tokens.length === 0) {
    throw new Error("La expresion simbolica esta vacia.");
  }
  for (const token of tokens) {
    if (token.type === "identifier" && !supportedIdentifier.test(token.value)) {
      throw new Error(`Identificador invalido: ${token.value}`);
    }
  }
}

function simplifyPolynomialLike(expression: string): string {
  const normalized = normalizeExpression(expression);
  validateExpression(normalized);
  return normalized.replace(/\s+/g, "")
    .replace(/\+\s*0\b/g, "")
    .replace(/\b0\s*\+/g, "")
    .replace(/\*\s*1\b/g, "")
    .replace(/\b1\s*\*/g, "")
    .replace(/\b0\s*\*\s*[A-Za-z_][A-Za-z0-9_]*/g, "0")
    .replace(/[A-Za-z_][A-Za-z0-9_]*\s*\*\s*0\b/g, "0")
    .replace(/\s+/g, " ")
    .trim();
}

function deriveSimpleTerm(term: string, variable: string): string {
  const clean = term.trim();
  if (!clean.includes(variable)) return "0";
  if (clean === variable) return "1";

  const powerMatch = clean.match(new RegExp(`^${variable}\\^(\\d+)$`));
  if (powerMatch) {
    const power = Number(powerMatch[1]);
    if (power === 0) return "0";
    if (power === 1) return "1";
    if (power === 2) return `2*${variable}`;
    return `${power}*${variable}^${power - 1}`;
  }

  const coefficientPowerMatch = clean.match(new RegExp(`^([+-]?\\d+(?:\\.\\d+)?)\\*?${variable}\\^(\\d+)$`));
  if (coefficientPowerMatch) {
    const coefficient = Number(coefficientPowerMatch[1]);
    const power = Number(coefficientPowerMatch[2]);
    const nextCoefficient = coefficient * power;
    if (power === 1) return `${nextCoefficient}`;
    if (power === 2) return `${nextCoefficient}*${variable}`;
    return `${nextCoefficient}*${variable}^${power - 1}`;
  }

  const coefficientMatch = clean.match(new RegExp(`^([+-]?\\d+(?:\\.\\d+)?)\\*?${variable}$`));
  if (coefficientMatch) return coefficientMatch[1];

  if (clean === `sin(${variable})`) return `cos(${variable})`;
  if (clean === `cos(${variable})`) return `-sin(${variable})`;
  if (clean === `exp(${variable})`) return `exp(${variable})`;
  if (clean === `ln(${variable})`) return `1/${variable}`;

  throw new Error("Derivacion simbolica limitada: usa polinomios simples, sin(x), cos(x), exp(x) o ln(x).");
}

function splitAdditiveTerms(expression: string): string[] {
  return normalizeExpression(expression)
    .replace(/\s+/g, "")
    .replace(/-/g, "+-")
    .split("+")
    .map((term) => term.trim())
    .filter(Boolean);
}

function derive(expression: string, variable = "x"): string {
  validateExpression(expression);
  const terms = splitAdditiveTerms(expression);
  return terms
    .map((term) => deriveSimpleTerm(term, variable))
    .filter((term) => term !== "0")
    .join(" + ")
    .replace(/\+ -/g, "- ") || "0";
}

function integrateSimpleTerm(term: string, variable: string): string {
  const clean = term.trim();
  if (!clean.includes(variable)) return `${clean}*${variable}`;
  if (clean === variable) return `${variable}^2/2`;

  const powerMatch = clean.match(new RegExp(`^${variable}\\^(\\d+)$`));
  if (powerMatch) {
    const power = Number(powerMatch[1]);
    return `${variable}^${power + 1}/${power + 1}`;
  }

  const coefficientPowerMatch = clean.match(new RegExp(`^([+-]?\\d+(?:\\.\\d+)?)\\*?${variable}\\^(\\d+)$`));
  if (coefficientPowerMatch) {
    const coefficient = Number(coefficientPowerMatch[1]);
    const power = Number(coefficientPowerMatch[2]);
    return `${coefficient}*${variable}^${power + 1}/${power + 1}`;
  }

  const coefficientMatch = clean.match(new RegExp(`^([+-]?\\d+(?:\\.\\d+)?)\\*?${variable}$`));
  if (coefficientMatch) return `${coefficientMatch[1]}*${variable}^2/2`;

  if (clean === `sin(${variable})`) return `-cos(${variable})`;
  if (clean === `cos(${variable})`) return `sin(${variable})`;
  if (clean === `exp(${variable})`) return `exp(${variable})`;
  if (clean === `1/${variable}`) return `ln(${variable})`;

  throw new Error("Integracion simbolica limitada: usa polinomios simples, sin(x), cos(x), exp(x) o 1/x.");
}

function integrate(expression: string, variable = "x"): string {
  validateExpression(expression);
  const terms = splitAdditiveTerms(expression);
  return `${terms.map((term) => integrateSimpleTerm(term, variable)).join(" + ").replace(/\+ -/g, "- ")} + C`;
}

function solveLinear(expression: string, variable = "x"): string {
  const normalized = normalizeExpression(expression).replace(/\s+/g, "");
  validateExpression(normalized);
  const sides = normalized.split("=");
  if (sides.length !== 2) {
    throw new Error("La resolucion simbolica actual requiere una ecuacion con '='.");
  }
  const [left, right] = sides;
  const linear = left.match(new RegExp(`^([+-]?\\d+(?:\\.\\d+)?)\\*?${variable}([+-]\\d+(?:\\.\\d+)?)?$`));
  const constantRight = Number(right);
  if (!linear || Number.isNaN(constantRight)) {
    throw new Error("Resolucion limitada a ecuaciones lineales tipo ax+b=c.");
  }
  const a = Number(linear[1]);
  const b = linear[2] ? Number(linear[2]) : 0;
  return `${variable} = ${(constantRight - b) / a}`;
}

export function runSymbolicOperation(request: SymbolicRequest): SymbolicResult {
  try {
    const expression = normalizeExpression(request.expression);
    const variable = request.variable?.normalize("NFC").trim() || "x";
    let result: string;
    if (request.operation === "simplify") result = simplifyPolynomialLike(expression);
    else if (request.operation === "derive") result = derive(expression, variable);
    else if (request.operation === "integrate") result = integrate(expression, variable);
    else result = solveLinear(expression, variable);

    return { ok: true, operation: request.operation, expression, variable, result };
  } catch (error) {
    return {
      ok: false,
      operation: request.operation,
      expression: request.expression,
      variable: request.variable,
      error: error instanceof Error ? error.message : "Error simbolico desconocido.",
    };
  }
}
