/** Fiók-áthelyezés QR-ral: a régi telefon a helyreállító kódot mutatja QR-ként, az új beolvassa (a jelszó továbbra is kell). */
import { normalizeRecoveryCode } from "@/crypto/recovery";

export const TRANSFER_PREFIX = "sotto:xfer1:";
export const transferPayload = (code: string): string => `${TRANSFER_PREFIX}${code}`;

/** A beolvasott szövegből a normalizált helyreállító kód, vagy `null`, ha nem Sotto áthelyezési kód. */
export function parseTransferPayload(text: string): string | null {
  const t = text.trim();
  if (!t.startsWith(TRANSFER_PREFIX)) return null;
  return normalizeRecoveryCode(t.slice(TRANSFER_PREFIX.length));
}
