import { TBitAiBridge } from "./TBitAiBridge";

async function main(): Promise<void> {
  const bridge = new TBitAiBridge();
  const stored = await bridge.memorizarEcuacionEinstein();
  const solved = await bridge.resolverEcuacion("Ciencia::Relatividad::EquivalenciaEnergiaMasa", {
    m: 5
  });

  console.log("Ecuacion guardada:", stored);
  console.log("Ecuacion resuelta:", solved);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
