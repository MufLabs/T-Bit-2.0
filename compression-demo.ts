import { compressSemanticGravity } from "./semanticCompression";

const memory = new Map<string, string>();
memory.set("AI::Memoria::A", JSON.stringify({ texto: "Recuerdo antiguo A" }));
memory.set("AI::Memoria::B", JSON.stringify({ texto: "Recuerdo antiguo B" }));

const storage = {
  async read(key: string) {
    const value = memory.get(key);
    if (!value) throw new Error(`No existe ${key}`);
    return { dato: value };
  },
  async write(key: string, payload: string) {
    memory.set(key, payload);
    return { ok: true, key };
  },
  async destroy(key: string) {
    memory.delete(key);
    return { ok: true, key };
  },
};

async function main() {
  const report = await compressSemanticGravity(storage, {
    dominioTarget: "AI",
    candidateKeys: ["AI::Memoria::A", "AI::Memoria::B"],
  });

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
