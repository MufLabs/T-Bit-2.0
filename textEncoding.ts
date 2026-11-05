export function normalizeUnicodeText(value: string): string {
  return value.normalize("NFC");
}

export function normalizeTBitKey(value: string): string {
  return normalizeUnicodeText(value.trim());
}
