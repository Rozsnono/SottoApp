/**
 * Helyreállító kód (Recovery Code): 32 jegyű Crockford-base32 (160 bit), 8×4 csoportban megjelenítve.
 * A kód KLIENSOLDALON generálódik; a szerver csak a belőle levezetett ellenőrző értéket (verifier) látja, a
 * mentés-kulcsot soha. Mindkettő HKDF-fel készül különböző `info` címkékkel.
 */
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { randomBytes } from "@noble/hashes/utils.js";
import { utf8 } from "@/protocol/wrap";

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const RECOVERY_CODE_LENGTH = 32;
const SALT = utf8("sotto-recovery-v1");

/** Új véletlen kód, „XXXX-XXXX-…” formában. */
export function generateRecoveryCode(): string {
  const b = randomBytes(RECOVERY_CODE_LENGTH); // 256 % 32 == 0 → a `& 31` torzításmentes
  let s = "";
  for (let i = 0; i < RECOVERY_CODE_LENGTH; i++) s += ALPHABET[b[i] & 31];
  return formatRecoveryCode(s);
}

export function formatRecoveryCode(raw: string): string {
  return raw.match(/.{1,4}/g)?.join("-") ?? raw;
}

/** Beírt kód normalizálása (kisbetű, elválasztók, O/I/L félreolvasás). `null`, ha nem érvényes. */
export function normalizeRecoveryCode(input: string): string | null {
  const s = input.toUpperCase().replace(/[^0-9A-Z]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");
  if (s.length !== RECOVERY_CODE_LENGTH) return null;
  for (const ch of s) if (!ALPHABET.includes(ch)) return null;
  return s;
}

export interface RecoveryKeys {
  /** A szervernek küldött ellenőrző érték (32 bájt). */
  verifier: Uint8Array;
  /** A kulcsmentést titkosító kulcs (32 bájt) – a szerver soha nem látja. */
  backupKey: Uint8Array;
}

export function deriveRecoveryKeys(code: string): RecoveryKeys {
  const norm = normalizeRecoveryCode(code);
  if (!norm) throw new Error("Érvénytelen helyreállító kód");
  const ikm = utf8(norm);
  return { verifier: hkdf(sha256, ikm, SALT, utf8("verifier"), 32), backupKey: hkdf(sha256, ikm, SALT, utf8("backup"), 32) };
}
