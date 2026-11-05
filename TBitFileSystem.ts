import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import {
  closeSync,
  createWriteStream,
  existsSync,
  ftruncateSync,
  fsyncSync,
  openSync,
  promises as fs,
  readSync,
  writeSync
} from "fs";
import { getActiveEncryptionKey, getEncryptionKeyById, getEncryptionKeyRing, getEncryptionKeyStatus } from "./EncryptionKeyManager";
import { normalizeTBitKey, normalizeUnicodeText } from "./textEncoding";

const SYSTEM_MAGIC = Buffer.from("TBITFS1\0", "ascii");
const FRAME_MAGIC = Buffer.from("TBIT", "ascii");
const ENCRYPTED_PAYLOAD_MAGIC = Buffer.from("TBENC1\0\0", "ascii");
const SALT_SIZE = 32;
const SYSTEM_HEADER_SIZE = SYSTEM_MAGIC.length + SALT_SIZE;
const FRAME_HEADER_SIZE = FRAME_MAGIC.length + 4;
const LEGACY_ENCRYPTED_PAYLOAD_VERSION = 1;
const ENCRYPTED_PAYLOAD_VERSION = 2;
const GCM_NONCE_SIZE = 12;
const GCM_AUTH_TAG_SIZE = 16;
const LEGACY_ENCRYPTED_PAYLOAD_OVERHEAD = ENCRYPTED_PAYLOAD_MAGIC.length + 1 + GCM_NONCE_SIZE + GCM_AUTH_TAG_SIZE;
const MIN_ENCRYPTED_PAYLOAD_OVERHEAD = ENCRYPTED_PAYLOAD_MAGIC.length + 1 + 1 + GCM_NONCE_SIZE + GCM_AUTH_TAG_SIZE;
const FAST_ALLOCATE_THRESHOLD_MB = 128;
const OPEN_RETRY_ATTEMPTS = 12;
const OPEN_RETRY_DELAY_MS = 150;
const PI_SCALED = BigInt("314159265358979323846264338327950288419716939937510");
const PI_SCALE = BigInt("100000000000000000000000000000000000000000000000000");

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export interface TBitOffsets {
  offsetV: number;
  offsetAntiV: number;
}

export interface TBitProjection extends TBitOffsets {
  coordinates: [number, number, number];
  antiCoordinates: [number, number, number];
}

type FrameInfo = {
  length: number;
  totalLength: number;
};

export class TBitContainer {
  private sizeInBytes = 0;
  private addressSalt?: Buffer;

  constructor(private readonly filePath: string) {}

  async reloadFromDisk(): Promise<void> {
    this.sizeInBytes = 0;
    this.addressSalt = undefined;
    await this.ensureSizeLoaded();
  }

  async initContainer(sizeInMB: number): Promise<void> {
    if (!Number.isInteger(sizeInMB) || sizeInMB <= 0) {
      throw new Error("El tamano del contenedor debe ser un entero positivo en MB.");
    }

    this.sizeInBytes = sizeInMB * 1024 * 1024;

    if (this.usableSizeInBytes() <= 0) {
      throw new Error("El contenedor es demasiado pequeno para el encabezado T-BIT.");
    }

    if (sizeInMB > FAST_ALLOCATE_THRESHOLD_MB) {
      const fd = await this.openFileWithRetry("w+", "recrear el contenedor");

      try {
        ftruncateSync(fd, this.sizeInBytes);
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }

      this.addressSalt = randomBytes(SALT_SIZE);
      this.writeSystemHeader();
      return;
    }

    const chunkSize = 1024 * 1024;
    const nullChunk = Buffer.alloc(chunkSize, 0x00);
    const stream = createWriteStream(this.filePath, { flags: "w" });

    try {
      let remaining = this.sizeInBytes;

      while (remaining > 0) {
        const bytesToWrite = Math.min(chunkSize, remaining);
        const chunk = bytesToWrite === chunkSize ? nullChunk : Buffer.alloc(bytesToWrite, 0x00);

        if (!stream.write(chunk)) {
          await new Promise<void>((resolve) => stream.once("drain", resolve));
        }

        remaining -= bytesToWrite;
      }
    } finally {
      await new Promise<void>((resolve, reject) => {
        stream.end(() => resolve());
        stream.once("error", reject);
      });
    }

    this.addressSalt = randomBytes(SALT_SIZE);
    this.writeSystemHeader();
  }

  async write(clave: string, dataText: string): Promise<void> {
    await this.ensureSizeLoaded();
    const { offsetV, offsetAntiV } = this.calculateOffsets(clave);
    await this.writeAtOffsets(offsetV, offsetAntiV, dataText);
  }

  async writeAtOffsets(offsetV: number, offsetAntiV: number, dataText: string): Promise<void> {
    await this.ensureSizeLoaded();

    const dataBuffer = Buffer.from(normalizeUnicodeText(dataText), "utf8");
    const storageBuffer = this.encryptPayloadIfEnabled(dataBuffer);
    const dataFrame = this.buildFrame(storageBuffer);
    const antiFrame = this.buildFrame(this.createAntiBuffer(storageBuffer));

    this.ensureDataFits(dataFrame.length);
    this.ensureDualSegmentsDoNotOverlap(offsetV, offsetAntiV, dataFrame.length);

    const fd = openSync(this.filePath, "r+");

    try {
      this.writeCircular(fd, dataFrame, offsetV);
      this.writeCircular(fd, antiFrame, offsetAntiV);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
  }

  async writeManyAtOffsets(items: Array<{ offsetV: number; offsetAntiV: number; dataText: string }>): Promise<void> {
    await this.ensureSizeLoaded();

    if (items.length === 0) return;

    const frames = items.map((item) => {
      const dataBuffer = Buffer.from(normalizeUnicodeText(item.dataText), "utf8");
      const storageBuffer = this.encryptPayloadIfEnabled(dataBuffer);
      const dataFrame = this.buildFrame(storageBuffer);
      const antiFrame = this.buildFrame(this.createAntiBuffer(storageBuffer));

      this.ensureDataFits(dataFrame.length);
      this.ensureDualSegmentsDoNotOverlap(item.offsetV, item.offsetAntiV, dataFrame.length);

      return {
        offsetV: item.offsetV,
        offsetAntiV: item.offsetAntiV,
        dataFrame,
        antiFrame,
      };
    });

    const fd = openSync(this.filePath, "r+");

    try {
      for (const frame of frames) {
        this.writeCircular(fd, frame.dataFrame, frame.offsetV);
        this.writeCircular(fd, frame.antiFrame, frame.offsetAntiV);
      }
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
  }

  async read(clave: string, expectedLength?: number): Promise<string> {
    await this.ensureSizeLoaded();
    const { offsetV, offsetAntiV } = this.calculateOffsets(clave);
    return this.readAtOffsets(offsetV, offsetAntiV, expectedLength);
  }

  async readAtOffsets(offsetV: number, offsetAntiV: number, expectedLength?: number): Promise<string> {
    await this.ensureSizeLoaded();

    const frameInfo = this.readFrameInfo(offsetV);
    const antiFrameInfo = this.readFrameInfo(offsetAntiV);

    if (frameInfo.length !== antiFrameInfo.length) {
      throw new Error("CORRUPCION DE INTEGRIDAD: encabezados V/Anti-V inconsistentes.");
    }

    this.ensureDataFits(frameInfo.totalLength);
    this.ensureDualSegmentsDoNotOverlap(offsetV, offsetAntiV, frameInfo.totalLength);

    const dataBuffer = Buffer.alloc(frameInfo.length);
    const antiBuffer = Buffer.alloc(frameInfo.length);
    const fd = openSync(this.filePath, "r");

    try {
      this.readCircular(fd, dataBuffer, offsetV + FRAME_HEADER_SIZE);
      this.readCircular(fd, antiBuffer, offsetAntiV + FRAME_HEADER_SIZE);
    } finally {
      closeSync(fd);
    }

    this.validateZeroSum(dataBuffer, antiBuffer);
    const plainBuffer = this.decryptPayloadIfNeeded(dataBuffer);

    if (expectedLength !== undefined && expectedLength !== plainBuffer.length && expectedLength !== frameInfo.length) {
      throw new Error("CORRUPCION DE INTEGRIDAD: longitud solicitada no coincide con el frame fisico.");
    }

    return plainBuffer.toString("utf8");
  }

  async destroy(clave: string, expectedLength?: number): Promise<void> {
    await this.ensureSizeLoaded();
    const { offsetV, offsetAntiV } = this.calculateOffsets(clave);
    await this.destroyAtOffsets(offsetV, offsetAntiV, expectedLength);
  }

  async destroyAtOffsets(offsetV: number, offsetAntiV: number, expectedLength?: number): Promise<void> {
    await this.ensureSizeLoaded();

    const frameInfo = this.readFrameInfo(offsetV);

    if (expectedLength !== undefined && !this.expectedLengthMatchesFrame(expectedLength, frameInfo.length)) {
      throw new Error("La longitud de destruccion no coincide con el frame fisico.");
    }

    this.ensureDataFits(frameInfo.totalLength);
    this.ensureDualSegmentsDoNotOverlap(offsetV, offsetAntiV, frameInfo.totalLength);

    const nullBuffer = Buffer.alloc(frameInfo.totalLength, 0x00);
    const fd = openSync(this.filePath, "r+");

    try {
      this.writeCircular(fd, nullBuffer, offsetV);
      this.writeCircular(fd, nullBuffer, offsetAntiV);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
  }

  async destroyManyAtOffsets(items: Array<{ offsetV: number; offsetAntiV: number; expectedLength?: number }>): Promise<void> {
    await this.ensureSizeLoaded();

    if (items.length === 0) return;

    const frames = items.map((item) => {
      const frameInfo = this.readFrameInfo(item.offsetV);

      if (item.expectedLength !== undefined && !this.expectedLengthMatchesFrame(item.expectedLength, frameInfo.length)) {
        throw new Error("La longitud de destruccion no coincide con el frame fisico.");
      }

      this.ensureDataFits(frameInfo.totalLength);
      this.ensureDualSegmentsDoNotOverlap(item.offsetV, item.offsetAntiV, frameInfo.totalLength);

      return {
        offsetV: item.offsetV,
        offsetAntiV: item.offsetAntiV,
        nullBuffer: Buffer.alloc(frameInfo.totalLength, 0x00),
      };
    });

    const fd = openSync(this.filePath, "r+");

    try {
      for (const frame of frames) {
        this.writeCircular(fd, frame.nullBuffer, frame.offsetV);
        this.writeCircular(fd, frame.nullBuffer, frame.offsetAntiV);
      }
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
  }

  async zeroFillAtOffsets(offsetV: number, offsetAntiV: number, physicalLength: number): Promise<void> {
    await this.ensureSizeLoaded();
    this.ensureDataFits(physicalLength);
    this.ensureDualSegmentsDoNotOverlap(offsetV, offsetAntiV, physicalLength);

    const nullBuffer = Buffer.alloc(physicalLength, 0x00);
    const fd = openSync(this.filePath, "r+");

    try {
      this.writeCircular(fd, nullBuffer, offsetV);
      this.writeCircular(fd, nullBuffer, offsetAntiV);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
  }

  calculateOffsets(clave: string): TBitOffsets {
    if (this.sizeInBytes <= 0 || !this.addressSalt) {
      throw new Error("El contenedor no tiene encabezado fisico cargado.");
    }

    const hash = createHash("sha256")
      .update(this.addressSalt)
      .update(normalizeTBitKey(clave))
      .digest("hex");

    const hashBigInt = BigInt(`0x${hash}`);
    const scaledProduct = hashBigInt * PI_SCALED;
    const usableSize = BigInt(this.usableSizeInBytes());
    const offsetBigInt = (scaledProduct / PI_SCALE) % usableSize;
    const offsetV = SYSTEM_HEADER_SIZE + Number(offsetBigInt);
    const offsetAntiV = SYSTEM_HEADER_SIZE + ((this.usableSizeInBytes() - Number(offsetBigInt)) % this.usableSizeInBytes());

    return { offsetV, offsetAntiV };
  }

  async calculateProjection(clave: string): Promise<TBitProjection> {
    await this.ensureSizeLoaded();

    const offsets = this.calculateOffsets(clave);
    return this.calculateProjectionFromOffsets(offsets.offsetV, offsets.offsetAntiV);
  }

  async calculateProjectionFromOffsets(offsetV: number, offsetAntiV: number): Promise<TBitProjection> {
    await this.ensureSizeLoaded();

    const coordinates = this.offsetToCoordinates(offsetV);
    const antiCoordinates = coordinates.map((value) => -value) as [number, number, number];

    return {
      offsetV,
      offsetAntiV,
      coordinates,
      antiCoordinates
    };
  }

  calculateStorageLength(dataText: string): number {
    const dataLength = Buffer.byteLength(normalizeUnicodeText(dataText), "utf8");
    const payloadLength = dataLength + this.currentEncryptedPayloadOverhead();
    return FRAME_HEADER_SIZE + payloadLength;
  }

  getPayloadEncryptionStatus(): { enabled: boolean; algorithm: string; mode: string; activeKeyId: string; previousKeyIds: string[]; keyCount: number } {
    const status = getEncryptionKeyStatus();
    return {
      enabled: true,
      algorithm: status.algorithm,
      mode: "encrypted-at-rest",
      activeKeyId: status.activeKeyId,
      previousKeyIds: status.previousKeyIds,
      keyCount: status.keyCount
    };
  }

  private buildFrame(buffer: Buffer): Buffer {
    const header = Buffer.alloc(FRAME_HEADER_SIZE);
    FRAME_MAGIC.copy(header, 0);
    header.writeUInt32LE(buffer.length, FRAME_MAGIC.length);
    return Buffer.concat([header, buffer]);
  }

  private readFrameInfo(offset: number): FrameInfo {
    const header = Buffer.alloc(FRAME_HEADER_SIZE);
    const fd = openSync(this.filePath, "r");

    try {
      this.readCircular(fd, header, offset);
    } finally {
      closeSync(fd);
    }

    if (!header.subarray(0, FRAME_MAGIC.length).equals(FRAME_MAGIC)) {
      throw new Error("FRAME T-BIT NO ENCONTRADO");
    }

    const length = header.readUInt32LE(FRAME_MAGIC.length);

    if (length <= 0) {
      throw new Error("FRAME T-BIT CON LONGITUD INVALIDA");
    }

    return {
      length,
      totalLength: FRAME_HEADER_SIZE + length
    };
  }

  private createAntiBuffer(buffer: Buffer): Buffer {
    return Buffer.from(buffer.map((byte) => ~byte & 0xff));
  }

  private encryptPayloadIfEnabled(plainBuffer: Buffer): Buffer {
    const activeKey = getActiveEncryptionKey();
    const keyIdBuffer = Buffer.from(activeKey.id, "utf8");
    if (keyIdBuffer.length <= 0 || keyIdBuffer.length > 255) {
      throw new Error("CIFRADO_KEY_ID_INVALIDO: TBIT_ENCRYPTION_KEY_ID debe ocupar entre 1 y 255 bytes UTF-8.");
    }
    const nonce = randomBytes(GCM_NONCE_SIZE);
    const header = Buffer.concat([
      ENCRYPTED_PAYLOAD_MAGIC,
      Buffer.from([ENCRYPTED_PAYLOAD_VERSION, keyIdBuffer.length]),
      keyIdBuffer,
      nonce
    ]);
    const cipher = createCipheriv("aes-256-gcm", activeKey.key, nonce);
    cipher.setAAD(header);
    const ciphertext = Buffer.concat([cipher.update(plainBuffer), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return Buffer.concat([
      header,
      authTag,
      ciphertext
    ]);
  }

  private decryptPayloadIfNeeded(storageBuffer: Buffer): Buffer {
    if (!this.isEncryptedPayload(storageBuffer)) {
      throw new Error("CIFRADO_REQUERIDO: el payload fisico no contiene encabezado cifrado T-BIT.");
    }

    const versionOffset = ENCRYPTED_PAYLOAD_MAGIC.length;
    const version = storageBuffer[versionOffset];

    if (version === LEGACY_ENCRYPTED_PAYLOAD_VERSION) {
      return this.decryptLegacyPayload(storageBuffer, versionOffset);
    }

    if (version !== ENCRYPTED_PAYLOAD_VERSION) {
      throw new Error(`CIFRADO_NO_SOPORTADO: version de payload ${version}.`);
    }

    const keyIdLengthOffset = versionOffset + 1;
    const keyIdLength = storageBuffer[keyIdLengthOffset];
    if (!keyIdLength) {
      throw new Error("CIFRADO_KEY_ID_INVALIDO: payload sin identificador de llave.");
    }

    const keyIdStart = keyIdLengthOffset + 1;
    const nonceStart = keyIdStart + keyIdLength;
    const authTagStart = nonceStart + GCM_NONCE_SIZE;
    const ciphertextStart = authTagStart + GCM_AUTH_TAG_SIZE;
    if (storageBuffer.length <= ciphertextStart) {
      throw new Error("CIFRADO_PAYLOAD_INVALIDO: payload cifrado incompleto.");
    }

    const keyId = storageBuffer.subarray(keyIdStart, nonceStart).toString("utf8");
    const nonce = storageBuffer.subarray(nonceStart, authTagStart);
    const authTag = storageBuffer.subarray(authTagStart, ciphertextStart);
    const ciphertext = storageBuffer.subarray(ciphertextStart);
    const key = getEncryptionKeyById(keyId);
    const header = storageBuffer.subarray(0, authTagStart);
    const decipher = createDecipheriv("aes-256-gcm", key.key, nonce);

    decipher.setAAD(header);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  }

  private isEncryptedPayload(buffer: Buffer): boolean {
    return buffer.length > LEGACY_ENCRYPTED_PAYLOAD_OVERHEAD
      && buffer.subarray(0, ENCRYPTED_PAYLOAD_MAGIC.length).equals(ENCRYPTED_PAYLOAD_MAGIC);
  }

  private decryptLegacyPayload(storageBuffer: Buffer, versionOffset: number): Buffer {
    const nonceStart = versionOffset + 1;
    const authTagStart = nonceStart + GCM_NONCE_SIZE;
    const ciphertextStart = authTagStart + GCM_AUTH_TAG_SIZE;
    const nonce = storageBuffer.subarray(nonceStart, authTagStart);
    const authTag = storageBuffer.subarray(authTagStart, ciphertextStart);
    const ciphertext = storageBuffer.subarray(ciphertextStart);
    let lastError: unknown;

    for (const key of getEncryptionKeyRing()) {
      try {
        const decipher = createDecipheriv("aes-256-gcm", key.key, nonce);
        decipher.setAuthTag(authTag);
        return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError instanceof Error ? lastError : new Error("CIFRADO_LEGACY_NO_DESCIFRABLE.");
  }

  private currentEncryptedPayloadOverhead(): number {
    const keyIdBytes = Buffer.byteLength(getActiveEncryptionKey().id, "utf8");
    return MIN_ENCRYPTED_PAYLOAD_OVERHEAD + keyIdBytes;
  }

  private expectedLengthMatchesFrame(expectedLength: number, framePayloadLength: number): boolean {
    return expectedLength === framePayloadLength
      || expectedLength + LEGACY_ENCRYPTED_PAYLOAD_OVERHEAD === framePayloadLength
      || framePayloadLength >= expectedLength + MIN_ENCRYPTED_PAYLOAD_OVERHEAD;
  }

  private validateZeroSum(dataBuffer: Buffer, antiBuffer: Buffer): void {
    for (let i = 0; i < dataBuffer.length; i += 1) {
      if (((dataBuffer[i] + antiBuffer[i] + 1) & 0xff) !== 0x00) {
        throw new Error("CORRUPCION DE INTEGRIDAD");
      }
    }
  }

  private writeCircular(fd: number, buffer: Buffer, startOffset: number): void {
    let written = 0;

    while (written < buffer.length) {
      const physicalOffset = this.normalizePhysicalOffset(startOffset + written);
      const writableUntilEnd = this.sizeInBytes - physicalOffset;
      const bytesToWrite = Math.min(writableUntilEnd, buffer.length - written);
      const bytesWritten = writeSync(fd, buffer, written, bytesToWrite, physicalOffset);

      if (bytesWritten !== bytesToWrite) {
        throw new Error("ESCRITURA FISICA INCOMPLETA");
      }

      written += bytesWritten;
    }
  }

  private readCircular(fd: number, targetBuffer: Buffer, startOffset: number): void {
    let read = 0;

    while (read < targetBuffer.length) {
      const physicalOffset = this.normalizePhysicalOffset(startOffset + read);
      const readableUntilEnd = this.sizeInBytes - physicalOffset;
      const bytesToRead = Math.min(readableUntilEnd, targetBuffer.length - read);
      const bytesRead = readSync(fd, targetBuffer, read, bytesToRead, physicalOffset);

      if (bytesRead !== bytesToRead) {
        throw new Error("LECTURA FISICA INCOMPLETA");
      }

      read += bytesRead;
    }
  }

  private ensureDualSegmentsDoNotOverlap(offsetV: number, offsetAntiV: number, length: number): void {
    const dataIntervals = this.circularIntervals(offsetV, length);
    const antiIntervals = this.circularIntervals(offsetAntiV, length);
    const overlaps = dataIntervals.some(([dataStart, dataEnd]) => (
      antiIntervals.some(([antiStart, antiEnd]) => (
        Math.max(dataStart, antiStart) < Math.min(dataEnd, antiEnd)
      ))
    ));

    if (overlaps) {
      throw new Error("COLISION FISICA: el dato y anti-dato se superponen en el contenedor.");
    }
  }

  private circularIntervals(startOffset: number, length: number): Array<[number, number]> {
    const normalizedStart = this.normalizePhysicalOffset(startOffset);
    const endOffset = normalizedStart + length;

    if (endOffset <= this.sizeInBytes) {
      return [[normalizedStart, endOffset]];
    }

    return [
      [normalizedStart, this.sizeInBytes],
      [SYSTEM_HEADER_SIZE, SYSTEM_HEADER_SIZE + ((endOffset - SYSTEM_HEADER_SIZE) % this.usableSizeInBytes())]
    ];
  }

  private ensureDataFits(length: number): void {
    if (length > this.usableSizeInBytes()) {
      throw new Error("El dato no cabe dentro del contenedor.");
    }
  }

  private async ensureSizeLoaded(): Promise<void> {
    if (!existsSync(this.filePath)) {
      throw new Error("El contenedor T-BIT no existe. Ejecuta initContainer primero.");
    }

    if (this.sizeInBytes <= 0) {
      const stat = await fs.stat(this.filePath);
      this.sizeInBytes = stat.size;
    }

    this.loadOrCreateSystemHeader();
  }

  private loadOrCreateSystemHeader(): void {
    const fd = openSync(this.filePath, "r+");
    const header = Buffer.alloc(SYSTEM_HEADER_SIZE);

    try {
      readSync(fd, header, 0, header.length, 0);

      if (header.subarray(0, SYSTEM_MAGIC.length).equals(SYSTEM_MAGIC)) {
        this.addressSalt = Buffer.from(header.subarray(SYSTEM_MAGIC.length, SYSTEM_HEADER_SIZE));
        return;
      }

      this.addressSalt = randomBytes(SALT_SIZE);
      const newHeader = Buffer.concat([SYSTEM_MAGIC, this.addressSalt]);
      writeSync(fd, newHeader, 0, newHeader.length, 0);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
  }

  private writeSystemHeader(): void {
    if (!this.addressSalt) {
      throw new Error("No existe salt de direccionamiento para escribir encabezado.");
    }

    const fd = openSync(this.filePath, "r+");
    const header = Buffer.concat([SYSTEM_MAGIC, this.addressSalt]);

    try {
      writeSync(fd, header, 0, header.length, 0);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
  }

  private async openFileWithRetry(flags: string, purpose: string): Promise<number> {
    let lastError: unknown;

    for (let attempt = 0; attempt < OPEN_RETRY_ATTEMPTS; attempt += 1) {
      try {
        return openSync(this.filePath, flags);
      } catch (error) {
        lastError = error;

        if (!this.isRetriableOpenError(error)) {
          break;
        }

        await delay(OPEN_RETRY_DELAY_MS);
      }
    }

    const code = (lastError as NodeJS.ErrnoException | undefined)?.code ?? "UNKNOWN";
    throw new Error(
      `CONTENEDOR_BLOQUEADO: no se pudo abrir '${this.filePath}' para ${purpose}. ` +
      "Cierra otros servidores T-BIT, espera a que terminen importaciones/borrados activos y vuelve a intentar. " +
      `Codigo del sistema: ${code}.`
    );
  }

  private isRetriableOpenError(error: unknown): boolean {
    const code = (error as NodeJS.ErrnoException | undefined)?.code ?? "UNKNOWN";
    return ["UNKNOWN", "EBUSY", "EPERM", "EACCES"].includes(code);
  }

  private usableSizeInBytes(): number {
    return this.sizeInBytes - SYSTEM_HEADER_SIZE;
  }

  private normalizePhysicalOffset(offset: number): number {
    if (offset < SYSTEM_HEADER_SIZE) {
      return SYSTEM_HEADER_SIZE + (offset % this.usableSizeInBytes());
    }

    return SYSTEM_HEADER_SIZE + ((offset - SYSTEM_HEADER_SIZE) % this.usableSizeInBytes());
  }

  private offsetToCoordinates(offset: number): [number, number, number] {
    const radius = 9;
    const ratio = (offset - SYSTEM_HEADER_SIZE) / this.usableSizeInBytes();
    const theta = ratio * Math.PI * 2;
    const height = Math.sin(ratio * Math.PI * 6) * radius * 0.62;
    const radial = Math.sqrt(Math.max(radius * radius - height * height, 0));

    return [
      Number((Math.cos(theta) * radial).toFixed(3)),
      Number(height.toFixed(3)),
      Number((Math.sin(theta) * radial).toFixed(3))
    ];
  }
}
