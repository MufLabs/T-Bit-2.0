const { existsSync, readFileSync, writeFileSync } = require("fs");
const { randomBytes } = require("crypto");
const { resolve } = require("path");

const envPath = resolve(process.cwd(), ".env");

if (existsSync(envPath)) {
  const currentContent = readFileSync(envPath, "utf8");
  const additions = [];

  if (!/^TBIT_ENCRYPTION_SECRET=/m.test(currentContent)) {
    additions.push(`TBIT_ENCRYPTION_SECRET=${randomBytes(48).toString("base64url")}`);
  }

  if (!/^TBIT_ENCRYPTION_KEY_ID=/m.test(currentContent)) {
    additions.push("TBIT_ENCRYPTION_KEY_ID=primary");
  }

  if (additions.length === 0) {
    console.log(".env ya existe. No se modifico el secreto actual.");
    process.exit(0);
  }

  const separator = currentContent.endsWith("\n") ? "" : "\n";
  writeFileSync(envPath, `${currentContent}${separator}${additions.join("\n")}\n`, "utf8");
  console.log(".env ya existe. Se agrego configuracion de cifrado faltante sin modificar secretos actuales.");
  process.exit(0);
}

const secret = randomBytes(48).toString("base64url");
const encryptionSecret = randomBytes(48).toString("base64url");
const apiKey = randomBytes(32).toString("base64url");
const content = [
`TBIT_HMAC_SECRET=${secret}`,
"TBIT_HMAC_KEY_ID=primary",
`TBIT_ENCRYPTION_SECRET=${encryptionSecret}`,
"TBIT_ENCRYPTION_KEY_ID=primary",
`TBIT_API_KEY=${apiKey}`,
  `VITE_TBIT_API_KEY=${apiKey}`,
  ""
].join("\n");

writeFileSync(envPath, content, "utf8");
console.log(".env creado con secreto HMAC, cifrado de payload y API key local.");
