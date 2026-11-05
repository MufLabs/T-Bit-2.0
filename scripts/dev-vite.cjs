const { spawn } = require("node:child_process");
const path = require("node:path");

const port = process.env.VITE_PORT || "5173";
const viteBin = path.join(
  __dirname,
  "..",
  "node_modules",
  "vite",
  "bin",
  "vite.js",
);
const child = spawn(
  process.execPath,
  [viteBin, "--host", "127.0.0.1", "--port", port],
  {
    stdio: "inherit",
    shell: false,
  },
);

child.on("exit", (code) => {
  process.exitCode = code ?? 0;
});
