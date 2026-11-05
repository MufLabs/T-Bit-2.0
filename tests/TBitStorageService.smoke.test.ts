import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TBitStorageService, type TBitStorageConfig, type TBitWalRecord } from "../TBitStorageService";

/**
 * Fase 0 — Smoke test de la fundacion de almacenamiento.
 *
 * Verifica (TBitStorageService.ts):
 *  - Roundtrip inject -> recoverData con estado INTEGRIDAD_CONFIRMADA.
 *  - Cifrado AES-256-GCM activo en reposo (obligatorio, ver abajo).
 *  - HMAC-SHA256 sobre metadata con comparacion timing-safe; toda alteracion
 *    de metadata se detecta al leer.
 *  - WAL append-only: ninguna operacion queda PENDING sin resolucion.
 *  - startupRecovery (recover()) se ejecuta sin errores.
 *  - listKeys / collapse / injectMany / collapseMany / checksum.
 *
 * NOTA CRITICA: TBitContainer.getPayloadEncryptionStatus() siempre devuelve
 * enabled: true y requiere TBIT_ENCRYPTION_SECRET (>= 32 caracteres).
 * Sin esa variable, TODA escritura falla. El test la fija explicitamente.
 */

const HMAC_KEY_ID = "test-primary";
const ORIGINAL_ENV_SECRET = process.env.TBIT_ENCRYPTION_SECRET;
const TEST_ENCRYPTION_SECRET = "tbit-test-encryption-secret-0123456789abcdef";

let dir: string;
let metadataPath: string;
let walPath: string;
let service: TBitStorageService;

beforeAll(async () => {
  process.env.TBIT_ENCRYPTION_SECRET = TEST_ENCRYPTION_SECRET;

  dir = await mkdtemp(join(tmpdir(), "tbit-storage-smoke-"));
  metadataPath = join(dir, "smoke.tbit.meta.json");
  walPath = join(dir, "smoke.tbit.wal.jsonl");

  const config: TBitStorageConfig = {
    name: "smoke_test",
    containerPath: join(dir, "smoke.tbit"),
    metadataPath,
    walPath,
    snapshotsDir: join(dir, "snapshots"),
    replicasDir: join(dir, "replica"),
    exportsDir: join(dir, "exports"),
    lockPath: join(dir, "smoke.tbit.lock"),
    hmacSecrets: new Map([[HMAC_KEY_ID, "tbit-test-hmac-secret-0123456789abcdef"]]),
    hmacKeyId: HMAC_KEY_ID,
    containerSizeMB: 1
  };

  service = new TBitStorageService(config);
  await service.reinitializeContainer(1);
});

afterAll(async () => {
  if (ORIGINAL_ENV_SECRET === undefined) {
    delete process.env.TBIT_ENCRYPTION_SECRET;
  } else {
    process.env.TBIT_ENCRYPTION_SECRET = ORIGINAL_ENV_SECRET;
  }
  await rm(dir, { recursive: true, force: true });
});

describe("TBitStorageService — fundacion de almacenamiento", () => {
  it("roundtrip inject -> recoverData con integridad confirmada y cifrado AES-256-GCM", async () => {
    const injected = await service.inject("Fase0::Smoke::Paridad", "Contenido de prueba NFC: áéíóú");
    expect(injected).toMatchObject({
      ok: true,
      status: "ESCRITURA_FISICA_CONFIRMADA",
      clave: "Fase0::Smoke::Paridad"
    });

    const recovered = await service.recoverData("Fase0::Smoke::Paridad");
    expect(recovered).toMatchObject({
      ok: true,
      status: "INTEGRIDAD_CONFIRMADA",
      integridadValida: true,
      clave: "Fase0::Smoke::Paridad",
      dato: "Contenido de prueba NFC: áéíóú"
    });

    const metadata = JSON.parse(await readFile(metadataPath, "utf8")) as Record<string, {
      authTag: string;
      authKeyId: string;
      authVersion: number;
      encryption: string;
    }>;
    const entry = metadata["Fase0::Smoke::Paridad"];
    expect(entry).toBeDefined();
    expect(entry.authTag).toMatch(/^[0-9a-f]{64}$/);
    expect(entry.authKeyId).toBe(HMAC_KEY_ID);
    expect(entry.authVersion).toBe(2);
    expect(entry.encryption).toBe("AES-256-GCM");
  });

  it("alterar el authTag HMAC de la metadata se detecta al leer", async () => {
    const original = await readFile(metadataPath, "utf8");
    const metadata = JSON.parse(original) as Record<string, Record<string, unknown>>;
    metadata["Fase0::Smoke::Paridad"].authTag = "00";
    await writeFile(metadataPath, JSON.stringify(metadata, null, 2), "utf8");

    await expect(service.recoverData("Fase0::Smoke::Paridad")).rejects.toThrow(/firma HMAC invalida/);

    await writeFile(metadataPath, original, "utf8");
    const restored = await service.recoverData("Fase0::Smoke::Paridad");
    expect(restored.status).toBe("INTEGRIDAD_CONFIRMADA");
  });

  it("leer con un HMAC keyId no registrado falla de forma explicita", async () => {
    const original = await readFile(metadataPath, "utf8");
    const metadata = JSON.parse(original) as Record<string, Record<string, unknown>>;
    metadata["Fase0::Smoke::Paridad"].authKeyId = "otra-llave";
    await writeFile(metadataPath, JSON.stringify(metadata, null, 2), "utf8");

    await expect(service.recoverData("Fase0::Smoke::Paridad")).rejects.toThrow(
      /HMAC key 'otra-llave' no esta disponible/
    );

    await writeFile(metadataPath, original, "utf8");
  });

  it("WAL: cada operacion queda resuelta (ningun PENDING sin COMMITTED/ABORTED)", async () => {
    const walRaw = await readFile(walPath, "utf8");
    expect(walRaw.trim().length).toBeGreaterThan(0);

    const records = walRaw
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line) as TBitWalRecord);

    const statesById = new Map<string, Set<string>>();
    for (const record of records) {
      const states = statesById.get(record.id) ?? new Set<string>();
      states.add(record.state);
      statesById.set(record.id, states);
    }

    expect(statesById.size).toBeGreaterThan(0);
    for (const [id, states] of statesById) {
      expect(
        states.has("COMMITTED") || states.has("ABORTED"),
        `WAL id ${id} quedo en estado ${[...states].join("/")}`
      ).toBe(true);
    }
  });

  it("recover() (startupRecovery) se ejecuta sin errores con WAL consistente", async () => {
    await expect(service.recover()).resolves.toBeUndefined();
    const recovered = await service.recoverData("Fase0::Smoke::Paridad");
    expect(recovered.status).toBe("INTEGRIDAD_CONFIRMADA");
  });

  it("listKeys / collapse: el ciclo de vida de borrado funciona", async () => {
    await service.inject("Fase0::Smoke::Temporal", "dato temporal");
    expect((await service.listKeys()).sort()).toEqual(
      expect.arrayContaining(["Fase0::Smoke::Paridad", "Fase0::Smoke::Temporal"])
    );

    const collapsed = await service.collapse("Fase0::Smoke::Temporal");
    expect(collapsed).toMatchObject({ ok: true });

    expect(await service.listKeys()).toEqual(["Fase0::Smoke::Paridad"]);
    await expect(service.recoverData("Fase0::Smoke::Temporal")).rejects.toThrow(/Clave no registrada/);
  });

  it("injectMany / collapseMany: operaciones por lote", async () => {
    const results = await service.injectMany([
      { key: "Fase0::Lote::A", payload: "a" },
      { key: "Fase0::Lote::B", payload: "b" },
      { key: "Fase0::Lote::C", payload: "c" }
    ]);
    expect(results.length).toBe(3);

    const keys = await service.listKeys();
    expect(keys).toEqual(
      expect.arrayContaining(["Fase0::Lote::A", "Fase0::Lote::B", "Fase0::Lote::C"])
    );

    const collapsed = await service.collapseMany(["Fase0::Lote::A", "Fase0::Lote::B"]);
    expect(collapsed).toEqual([
      { key: "Fase0::Lote::A", collapsed: true },
      { key: "Fase0::Lote::B", collapsed: true }
    ]);

    expect(await service.listKeys()).toEqual(
      expect.arrayContaining(["Fase0::Lote::C", "Fase0::Smoke::Paridad"])
    );
  });

  it("checksum global expone los tres hashes del contenedor", async () => {
    const checksum = await service.checksum();
    expect(checksum).toMatchObject({
      containerHash: expect.stringMatching(/^[0-9a-f]{64}$/),
      metadataHash: expect.stringMatching(/^[0-9a-f]{64}$/),
      combinedHash: expect.stringMatching(/^[0-9a-f]{64}$/)
    });
  });
});

