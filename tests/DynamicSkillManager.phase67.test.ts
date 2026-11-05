import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setActiveTBitDataDir, getActiveTBitDataDir } from "../tbitRuntimePaths";
import { DynamicSkillManager, getDynamicSkillManager } from "../src/skills/DynamicSkillManager";

/**
 * Fase 67 — Skills dinamicas: catalogo local, deteccion, instalacion con
 * permisos y ejecucion como contexto declarativo no confiable.
 * Aislado en un directorio temporal via setActiveTBitDataDir.
 */

const ORIGINAL_DATA_DIR = getActiveTBitDataDir();
let dir: string;

const SKILL_RAW = `---
name: Test Skill
id: test-skill
description: Skill de prueba para revisar rendimiento y cache.
tags: [test, cache, rendimiento]
source: local
version: 1
---

# Test Skill

Procedimiento declarativo de prueba. No ejecuta codigo.
`;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "tbit-skills-"));
  setActiveTBitDataDir(dir);
});

afterAll(async () => {
  setActiveTBitDataDir(ORIGINAL_DATA_DIR);
  await rm(dir, { recursive: true, force: true });
});

describe("DynamicSkillManager — Fase 67", () => {
  it("carga el catalogo local de skills declarativas", async () => {
    const manager = new DynamicSkillManager(join(process.cwd(), "skills"));
    const skills = await manager.loadLocalCatalog();
    expect(skills.length).toBeGreaterThanOrEqual(3);
    const ids = skills.map((skill) => skill.id);
    expect(ids).toContain("code-review-checklist");
    expect(ids).toContain("root-cause-analysis");
    expect(ids).toContain("api-design-patterns");
    for (const skill of skills) {
      expect(skill.checksum).toMatch(/^[a-f0-9]{64}$/);
    }
  });

  it("detecta skills relevantes para una tarea por terminos y tags", async () => {
    const manager = new DynamicSkillManager(join(process.cwd(), "skills"));
    await manager.loadLocalCatalog();
    const detection = manager.detectSkillNeed("Necesito hacer una revision de codigo del modulo de pagos");
    expect(detection.needed).toBe(true);
    expect(detection.candidates[0].id).toBe("code-review-checklist");
  });

  it("instala una skill con permisos y la persiste en Q-Vault", async () => {
    const manager = new DynamicSkillManager(join(process.cwd(), "skills"));
    const skill = await manager.installSkill({ raw: SKILL_RAW, source: "local", fallbackId: "test-skill" });
    expect(skill.id).toBe("test-skill");
    expect(manager.getSkill("test-skill")).toBeDefined();

    // La skill queda consultable en el Query Index como recurso de memoria.
    const { searchQueryIndex } = await import("../queryIndex");
    const search = await searchQueryIndex({ query: "Test Skill", userId: "ai" });
    expect(search.results.some((result) => result.key === "AI::Skill::test-skill")).toBe(true);
  });

  it("rechaza skills remotas sin commit fijado", async () => {
    const manager = new DynamicSkillManager(join(process.cwd(), "skills"));
    await expect(
      manager.installSkill({ raw: SKILL_RAW, source: "remote", repo: "rmaterile/agent-skills", fallbackId: "remota" }),
    ).rejects.toThrow(/commit fijado/i);
  });

  it("ejecuta una skill como contexto declarativo marcado no confiable", async () => {
    const manager = new DynamicSkillManager(join(process.cwd(), "skills"));
    await manager.installSkill({ raw: SKILL_RAW, source: "local", fallbackId: "test-skill" });
    const execution = await manager.executeSkill("test-skill", "Optimizar cache del indice");
    expect(execution.contextBlock).toContain("NO CONFIABLE");
    expect(execution.contextBlock).toContain("NUNCA prevalece");
    expect(execution.contextBlock).toContain("# Test Skill");
    expect(execution.citations).toContain("AI::Skill::test-skill");
  });

  it("detecta manipulacion de integridad al ejecutar", async () => {
    const manager = new DynamicSkillManager(join(process.cwd(), "skills"));
    await manager.installSkill({ raw: SKILL_RAW, source: "local", fallbackId: "test-skill" });
    const skill = manager.getSkill("test-skill");
    (skill as { content: string }).content = "# contenido manipulado";
    await expect(manager.executeSkill("test-skill")).rejects.toThrow(/integridad/i);
  });

  it("el gestor global carga el catalogo perezosamente", async () => {
    const manager = getDynamicSkillManager();
    await manager.loadLocalCatalog();
    expect(manager.listSkills().length).toBeGreaterThanOrEqual(3);
  });
});
