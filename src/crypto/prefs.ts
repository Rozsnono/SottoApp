/** Becenév/szín titkosítása a saját identitás-kulcsból levezetett kulccsal (a szerver csak a blobot látja). */
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import { randomBytes } from "@noble/hashes/utils.js";
import { fromB64, toB64, utf8 } from "@/protocol/wrap";

export interface ContactPrefs {
  nickname?: string;
  color?: string;
}

const key = (idPriv: Uint8Array) => hkdf(sha256, idPriv, utf8("sotto-prefs"), utf8("contact-prefs-v1"), 32);

export function encryptPrefs(idPriv: Uint8Array, p: ContactPrefs): { valueEncrypted: string; nonce: string } {
  const nonce = randomBytes(24);
  return { valueEncrypted: toB64(xchacha20poly1305(key(idPriv), nonce).encrypt(utf8(JSON.stringify(p)))), nonce: toB64(nonce) };
}

export function decryptPrefs(idPriv: Uint8Array, blob: { valueEncrypted: string; nonce: string }): ContactPrefs {
  try {
    return JSON.parse(new TextDecoder().decode(xchacha20poly1305(key(idPriv), fromB64(blob.nonce)).decrypt(fromB64(blob.valueEncrypted)))) as ContactPrefs;
  } catch {
    return {};
  }
}
