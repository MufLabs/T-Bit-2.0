import { TBitAiBridge } from "./TBitAiBridge";

async function main(): Promise<void> {
  const bridge = new TBitAiBridge();
  const injected = await bridge.memorizarEnVacio({
    dominio: "Usuario",
    coleccion: "Preferencias",
    id_concepto: "TemaVisual",
    payload: {
      tema: "oscuro",
      intensidad: "alta",
      origen: "ai-bridge-demo"
    }
  });
  const recovered = await bridge.consultarOraculo({
    key: "Usuario::Preferencias::TemaVisual"
  });

  console.log("Memoria guardada:", injected);
  console.log("Memoria recuperada:", recovered);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
