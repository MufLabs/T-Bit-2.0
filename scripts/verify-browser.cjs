#!/usr/bin/env node
/**
 * verify-browser.cjs — Tanda 4 (Fase 79): verificacion en navegador real.
 *
 * Abre la URL indicada en Chrome/Edge del sistema (playwright-core NO descarga
 * navegadores: usa el canal "chrome"/"msedge" ya instalado; por eso no se
 * incluye en CI, donde no hay navegador de sistema garantizado) y comprueba:
 *   1. La pagina carga y #root dibuja contenido (no pantalla negra/vacia).
 *   2. Aparece la pantalla de primer arranque "Configura tu Q-Vault OS".
 *   3. No hay excepciones no capturadas (pageerror).
 *   4. Lista los errores de consola (los 401 de la API sin clave se informan
 *      pero no hacen fallar la verificacion de renderizado).
 *
 * Uso: node scripts/verify-browser.cjs <url> [texto-esperado]
 */
const { chromium } = require("playwright-core");

const url = process.argv[2];
const expectedText = process.argv[3] ?? "Configura tu Q-Vault OS";

if (!url) {
  console.error("Uso: node scripts/verify-browser.cjs <url> [texto-esperado]");
  process.exit(2);
}

(async () => {
  let browser;
  try {
    browser = await chromium.launch({ channel: "chrome", headless: true });
  } catch (error) {
    try {
      browser = await chromium.launch({ channel: "msedge", headless: true });
    } catch (edgeError) {
      console.error("[verify:browser] NO VERIFICADO: no hay Chrome ni Edge del sistema disponible.");
      console.error(String(error));
      process.exit(3);
    }
  }

  const page = await browser.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(String(error)));

  const problems = [];
  try {
    await page.goto(url, { waitUntil: "load", timeout: 30000 });
    await page.waitForSelector("#root *", { timeout: 15000 });
    const rootChildren = await page.locator("#root *").count();
    if (rootChildren === 0) {
      problems.push("#root existe pero no dibuja ningun elemento (pantalla negra).");
    }
    const bodyText = await page.locator("body").innerText();
    if (!bodyText.includes(expectedText)) {
      problems.push(`No se encontro el texto esperado '${expectedText}' en la pagina.`);
    }
  } catch (error) {
    problems.push(`Fallo cargando ${url}: ${String(error).split("\n")[0]}`);
  }

  for (const error of pageErrors) {
    problems.push(`Excepcion no capturada en la pagina: ${error.split("\n")[0]}`);
  }

  console.log(`[verify:browser] URL: ${url}`);
  console.log(`[verify:browser] Errores de consola: ${consoleErrors.length}`);
  for (const message of consoleErrors.slice(0, 10)) {
    console.log(`  [consola] ${message.split("\n")[0]}`);
  }

  if (problems.length > 0) {
    console.error("[verify:browser] FALLO:");
    for (const problem of problems) {
      console.error("  - " + problem);
    }
    await browser.close();
    process.exit(1);
  }

  console.log("[verify:browser] OK: la interfaz se dibuja y muestra la pantalla de primer arranque.");
  await browser.close();
})();
