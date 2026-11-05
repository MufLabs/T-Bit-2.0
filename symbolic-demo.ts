import { runSymbolicOperation } from "./symbolicEngine";

const samples = [
  { operation: "simplify", expression: "1*x^2 + 0", variable: "x" },
  { operation: "derive", expression: "3*x^3 + 2*x^2 + x + 7", variable: "x" },
  { operation: "integrate", expression: "3*x^2 + 2*x + 5", variable: "x" },
  { operation: "solve", expression: "2*x+4=10", variable: "x" },
] as const;

for (const sample of samples) {
  console.log(runSymbolicOperation(sample));
}
