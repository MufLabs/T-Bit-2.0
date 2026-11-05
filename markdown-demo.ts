import { importMarkdownDocument } from "./markdownBridge";

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
  const result = await importMarkdownDocument(storage, {
    userId: "andres",
    filename: "Plan T-BIT.md",
    content: `---
tags: [proyecto, urgente]
title: Plan T-BIT
---

# Plan T-BIT

Este proyecto conecta [[Usuario::Perfil::Andres]] con [[Proyecto::TBit::Core]].
`,
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
