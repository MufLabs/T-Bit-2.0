import {
  compareNetworkState,
  exportNetworkRecord,
  getNetworkState,
  importNetworkRecord,
} from "./networkSync";

const sourceMemory = new Map<string, string>();
const targetMemory = new Map<string, string>();

sourceMemory.set("Usuario::Perfil::Andres", JSON.stringify({ nombre: "Andres", rol: "Arquitecto" }));

const sourceStorage = {
  async read(key: string) {
    const value = sourceMemory.get(key);
    if (!value) throw new Error(`No existe ${key}`);
    return { dato: value };
  },
  async write(key: string, payload: string) {
    sourceMemory.set(key, payload);
    return { ok: true, key };
  },
};

const targetStorage = {
  async read(key: string) {
    const value = targetMemory.get(key);
    if (!value) throw new Error(`No existe ${key}`);
    return { dato: value };
  },
  async write(key: string, payload: string) {
    targetMemory.set(key, payload);
    return { ok: true, key };
  },
};

async function main() {
  const exported = await exportNetworkRecord(sourceStorage, "Usuario::Perfil::Andres");
  const imported = await importNetworkRecord(targetStorage, exported);
  const localState = await getNetworkState();
  const comparison = await compareNetworkState(localState);

  console.log(
    JSON.stringify(
      {
        exported,
        imported,
        comparison,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
