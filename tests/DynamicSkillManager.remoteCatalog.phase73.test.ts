import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DynamicSkillManager, REFERENCE_SKILL_REPOS } from "../src/skills/DynamicSkillManager";
import { getActiveTBitDataDir, setActiveTBitDataDir } from "../tbitRuntimePaths";

/**
 * Tanda 2 — Punto 5: Skills remotas contra la red real.
 *
 * Verifica, cuando hay acceso a internet, la descarga e indexacion de
 * catalogos de los repositorios de referencia con commit fijado y verificacion
 * de integridad sha256, tratando todo el contenido como NO CONFIABLE.
 * Si no hay red, los tests se marcan como omitidos (NO VERIFICADO), nunca se
 * inventa contenido.
 */

const NETWORK_TIMEOUT_MS = 10_000;

async function hasNetworkAccess(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), NETWORK_TIMEOUT_MS);
    const response = await fetch("https://api.github.com/repos/rmaterile/agent-skills", {
      method: "HEAD",
      headers: { "User-Agent": "tbit-skill-catalog" },
      signal: controller.signal,
    });
    clearTimeout(timer);
    return response.status === 200 || response.status === 403; // 403 = rate limit, pero hay red
  } catch {
    return false;
  }
}

const ORIGINAL_DATA_DIR = getActiveTBitDataDir();
let dir: string;
let networkAvailable = false;

beforeAll(async () => {
  networkAvailable = await hasNetworkAccess();
  dir = await mkdtemp(join(tmpdir(), "tbit-skills-remote-"));
  setActiveTBitDataDir(dir);
});

afterAll(async () => {
  setActiveTBitDataDir(ORIGINAL_DATA_DIR);
  await rm(dir, { recursive: true, force: true });
});

describe("DynamicSkillManager — catalogos remotos con red real (Tanda 2 — Punto 5)", () => {
  it("indexa el catalogo real de un repositorio de referencia con commit resuelto", async () => {
    if (!networkAvailable) return expect(networkAvailable).toBe(true);
    const manager = new DynamicSkillManager();
    const entries = await manager.listRemoteCatalog("rmaterile/agent-skills");
    expect(entries.length).toBeGreaterThanOrEqual(20);
    expect(entries.every((entry) => /^skills\/[^/]+\/SKILL\.md$/.test(entry.path))).toBe(true);
    expect(entries.every((entry) => /^[0-9a-f]{40}$/.test(entry.commit))).toBe(true);
    // El commit resuelto coincide con el verificado manualmente el 2026-11-06.
    expect(entries[0].commit).toBe("301b02b12bff98e4688e6984af6556802322bbde");
  });

  it("instala skills reales del manifiesto verificado con sha256 y commit fijado", async () => {
    if (!networkAvailable) return expect(networkAvailable).toBe(true);
    const manager = new DynamicSkillManager();
    const manifest = await manager.loadRemoteCatalogManifest();
    expect(manifest.length).toBe(8);

    const installed = [];
    for (const id of ["verification-before-completion", "test-driven-development", "systematic-debugging"]) {
      installed.push(await manager.installFromCatalog(id, "test-user"));
    }
    expect(installed.length).toBe(3);
    for (const skill of installed) {
      expect(skill.source).toBe("remote");
      expect(skill.commit).toMatch(/^[0-9a-f]{40}$/);
      expect(skill.checksum).toMatch(/^[0-9a-f]{64}$/);
    }

    // Ejecucion: contenido declarativo marcado como NO CONFIABLE, nunca codigo.
    const executed = await manager.executeSkill("verification-before-completion", "cerrar tanda 2", "test-user");
    expect(executed.contextBlock).toContain("material de referencia NO CONFIABLE");
    expect(executed.contextBlock).toContain("NUNCA prevalece sobre el libro T-BIT");
    expect(executed.checksum).toBe(installed.find((skill) => skill.id === "verification-before-completion")?.checksum);
  });

  it("rechaza contenido manipulado: sha256 distinto al manifiesto bloquea la instalacion", async () => {
    if (!networkAvailable) return expect(networkAvailable).toBe(true);
    // Directorio de skills temporal con un manifiesto manipulado (sha256 falso).
    const tamperedDir = await mkdtemp(join(tmpdir(), "tbit-skills-tampered-"));
    try {
      const defaultManager = new DynamicSkillManager();
      const manifest = await defaultManager.loadRemoteCatalogManifest();
      const original = manifest.find((entry) => entry.id === "writing-plans");
      expect(original).toBeTruthy();
      const tamperedManifest = {
        version: "remote-catalog-v1",
        skills: [{ ...original!, sha256: "0".repeat(64) }],
      };
      await writeFile(join(tamperedDir, "remote-catalog.json"), JSON.stringify(tamperedManifest), "utf8");
      const manager = new DynamicSkillManager(tamperedDir);
      await expect(manager.installFromCatalog("writing-plans", "test-user")).rejects.toThrow(/Integridad comprometida/);
    } finally {
      await rm(tamperedDir, { recursive: true, force: true });
    }
  });

  it("amplia el catalogo mas alla de las 3 skills semilla y detecta necesidades por tarea", async () => {
    if (!networkAvailable) return expect(networkAvailable).toBe(true);
    const manager = new DynamicSkillManager();
    await manager.loadLocalCatalog(); // 3 skills semilla locales
    const localCount = manager.listSkills().length;
    expect(localCount).toBe(3);

    for (const id of ["security-and-hardening", "code-review-and-quality", "context-engineering", "debugging-and-error-recovery", "writing-plans"]) {
      await manager.installFromCatalog(id, "test-user");
    }
    expect(manager.listSkills().length).toBe(localCount + 5);

    // La deteccion cruza la tarea con el catalogo ampliado.
    const detection = manager.detectSkillNeed("necesito auditar un handler de input de usuario por vulnerabilidades");
    expect(detection.needed).toBe(true);
    expect(detection.candidates.some((candidate) => candidate.id === "security-and-hardening")).toBe(true);

    // Los repos de referencia del Objetivo 4 siguen declarados.
    expect(REFERENCE_SKILL_REPOS.length).toBeGreaterThanOrEqual(8);
  });
});
