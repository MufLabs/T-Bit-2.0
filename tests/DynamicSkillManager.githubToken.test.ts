import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { DynamicSkillManager } from "../src/skills/DynamicSkillManager";
import { getActiveTBitDataDir, setActiveTBitDataDir } from "../tbitRuntimePaths";

/**
 * Tests SIN RED (fetch simulado) para la autenticacion opcional con
 * GITHUB_TOKEN en las consultas de skills a la API de GitHub.
 *
 * Verifica:
 *  1. Con GITHUB_TOKEN presente se envia Authorization: Bearer SOLO a los
 *     hosts permitidos (api.github.com y raw.githubusercontent.com).
 *  2. Sin token no se envia ninguna cabecera Authorization.
 *  3. El token NUNCA aparece en los mensajes de error, que en cambio exponen
 *     el mensaje de GitHub y las cabeceras x-ratelimit-* cuando existen.
 *  4. El token no viaja en redirecciones a hosts no permitidos.
 *
 * No toca la red real: todo fetch esta simulado. La instalacion y la
 * verificacion sha256 del contenido se mantienen intactas.
 */

const TEST_TOKEN = "tbit-test-token-NO-SECRETO-solo-para-tests";

type RecordedRequest = { url: string; headers: Record<string, string> };

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

function stubFetch(handler: (url: string) => Response): RecordedRequest[] {
  const calls: RecordedRequest[] = [];
  const mock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((value, key) => {
      headers[key] = value;
    });
    calls.push({ url: String(input), headers });
    return handler(String(input));
  });
  vi.stubGlobal("fetch", mock);
  return calls;
}

const TREE_BODY = {
  sha: "301b02b12bff98e4688e6984af6556802322bbde",
  tree: [
    { type: "blob", path: "skills/verification-before-completion/SKILL.md", size: 1200 },
    { type: "blob", path: "skills/test-driven-development/SKILL.md", size: 900 },
    { type: "tree", path: "skills" },
  ],
};

const ORIGINAL_TOKEN = process.env.GITHUB_TOKEN;
const ORIGINAL_DATA_DIR = getActiveTBitDataDir();
let dataDir: string;
let skillsDir: string;

function restoreToken(): void {
  if (ORIGINAL_TOKEN === undefined) delete process.env.GITHUB_TOKEN;
  else process.env.GITHUB_TOKEN = ORIGINAL_TOKEN;
}

beforeAll(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "tbit-skills-token-data-"));
  skillsDir = await mkdtemp(join(tmpdir(), "tbit-skills-token-catalog-"));
  setActiveTBitDataDir(dataDir);
});

afterEach(() => {
  vi.unstubAllGlobals();
  restoreToken();
});

afterAll(async () => {
  setActiveTBitDataDir(ORIGINAL_DATA_DIR);
  await rm(dataDir, { recursive: true, force: true });
  await rm(skillsDir, { recursive: true, force: true });
});

describe("DynamicSkillManager — autenticacion opcional GITHUB_TOKEN (sin red, fetch simulado)", () => {
  it("con GITHUB_TOKEN envia Authorization: Bearer a api.github.com al indexar el catalogo", async () => {
    process.env.GITHUB_TOKEN = TEST_TOKEN;
    const calls = stubFetch(() => jsonResponse(200, TREE_BODY));
    const manager = new DynamicSkillManager();
    const entries = await manager.listRemoteCatalog("rmaterile/agent-skills");

    expect(calls.length).toBe(1);
    expect(calls[0].url).toBe("https://api.github.com/repos/rmaterile/agent-skills/git/trees/HEAD?recursive=1");
    expect(calls[0].headers.authorization).toBe(`Bearer ${TEST_TOKEN}`);
    expect(entries.length).toBe(2);
    expect(entries[0].commit).toBe(TREE_BODY.sha);
  });

  it("sin GITHUB_TOKEN no se envia ninguna cabecera Authorization", async () => {
    delete process.env.GITHUB_TOKEN;
    const calls = stubFetch(() => jsonResponse(200, TREE_BODY));
    const manager = new DynamicSkillManager();
    await manager.listRemoteCatalog("rmaterile/agent-skills");

    expect(calls.length).toBe(1);
    expect(calls[0].headers.authorization).toBeUndefined();
    expect(Object.keys(calls[0].headers)).not.toContain("authorization");
  });

  it("el token NUNCA aparece en el mensaje de error, que expone mensaje de GitHub y cabeceras x-ratelimit-*", async () => {
    process.env.GITHUB_TOKEN = TEST_TOKEN;
    stubFetch(() =>
      jsonResponse(
        403,
        { message: "API rate limit exceeded for 10.1.2.3.", documentation_url: "https://docs.github.com/rate-limit" },
        { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "1893456000" },
      ),
    );
    const manager = new DynamicSkillManager();

    const error = await manager.listRemoteCatalog("rmaterile/agent-skills").catch((reason: Error) => reason);
    expect(error).toBeInstanceOf(Error);
    const message = (error as Error).message;
    expect(message).toContain("No se pudo indexar el catalogo de rmaterile/agent-skills (HTTP 403)");
    expect(message).toContain('mensaje de GitHub: "API rate limit exceeded for 10.1.2.3."');
    expect(message).toContain("x-ratelimit-remaining: 0");
    expect(message).toContain("x-ratelimit-reset: 1893456000");
    // El token jamas se filtra en mensajes de error, logs ni informes.
    expect(message).not.toContain(TEST_TOKEN);
  });

  it("el token no viaja en redirecciones a hosts no permitidos", async () => {
    process.env.GITHUB_TOKEN = TEST_TOKEN;
    const calls = stubFetch((url) => {
      if (url.startsWith("https://api.github.com/")) {
        return new Response(null, {
          status: 302,
          headers: { location: "https://host-no-permitido.example.com/arbol" },
        });
      }
      return jsonResponse(200, TREE_BODY);
    });
    const manager = new DynamicSkillManager();
    const entries = await manager.listRemoteCatalog("rmaterile/agent-skills");

    expect(calls.length).toBe(2);
    expect(calls[0].url).toContain("api.github.com");
    expect(calls[0].headers.authorization).toBe(`Bearer ${TEST_TOKEN}`);
    expect(calls[1].url).toContain("host-no-permitido.example.com");
    expect(calls[1].headers.authorization).toBeUndefined();
    expect(entries.length).toBe(2);
  });

  it("con GITHUB_TOKEN envia Authorization: Bearer a raw.githubusercontent.com al instalar desde el catalogo", async () => {
    process.env.GITHUB_TOKEN = TEST_TOKEN;
    const content = "---\nname: Skill de prueba\ndescription: skill simulada para el test de token\n---\n\nCuerpo declarativo.";
    const sha256 = createHash("sha256").update(content, "utf8").digest("hex");
    const manifest = {
      version: "remote-catalog-v1",
      skills: [
        {
          id: "skill-de-prueba",
          repo: "rmaterile/agent-skills",
          commit: "301b02b12bff98e4688e6984af6556802322bbde",
          path: "skills/skill-de-prueba/SKILL.md",
          sha256,
          bytes: Buffer.byteLength(content, "utf8"),
          name: "Skill de prueba",
          description: "skill simulada para el test de token",
        },
      ],
    };
    await writeFile(join(skillsDir, "remote-catalog.json"), JSON.stringify(manifest), "utf8");

    const calls = stubFetch(() => new Response(content, { status: 200 }));
    const manager = new DynamicSkillManager(skillsDir);
    const skill = await manager.installFromCatalog("skill-de-prueba", "test-user");

    expect(calls.length).toBe(1);
    expect(calls[0].url).toBe(
      "https://raw.githubusercontent.com/rmaterile/agent-skills/301b02b12bff98e4688e6984af6556802322bbde/skills/skill-de-prueba/SKILL.md",
    );
    expect(calls[0].headers.authorization).toBe(`Bearer ${TEST_TOKEN}`);
    // La instalacion y su verificacion de integridad siguen intactas.
    expect(skill.source).toBe("remote");
    expect(skill.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(skill.checksum).toBe(sha256);
  });
});

