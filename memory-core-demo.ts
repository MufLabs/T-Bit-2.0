import { getMemoryContext, getMemoryLinks, recallMemory, rememberMemory } from "./memoryCore";

const memory = new Map<string, string>();

const storage = {
  async write(key: string, payload: string) {
    memory.set(key, payload);
    return { ok: true, key };
  },
  async read(key: string) {
    const payload = memory.get(key);
    if (!payload) throw new Error(`No existe ${key}`);
    return { dato: payload };
  },
};

async function main() {
  const profile = await rememberMemory(storage, {
    userId: "andres",
    key: "Usuario::Perfil::Andres",
    text: "Andres trabaja en [[Proyecto::TBit::Core]] y prefiere interfaces visuales.",
    tags: ["perfil", "usuario"],
    source: "demo",
  });

  const project = await rememberMemory(storage, {
    userId: "andres",
    key: "Proyecto::TBit::Core",
    text: "T-BIT es el cerebro persistente para IA. Relacionado con [[Usuario::Perfil::Andres]].",
    tags: ["proyecto", "ai"],
    source: "demo",
  });

  const context = await getMemoryContext("andres", "interfaces visuales proyecto");
  const links = await getMemoryLinks("Proyecto::TBit::Core");
  const recalled = await recallMemory(storage, profile.key);

  console.log(JSON.stringify({ profile, project, context, links, recalled }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
