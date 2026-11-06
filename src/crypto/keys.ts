/** Identitás- és eszközkulcsok, valamint a titkosított kulcsmentés. */
import { x25519, ed25519 } from "@noble/curves/ed25519.js";
import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import { randomBytes } from "@noble/hashes/utils.js";
import { fromB64, toB64 } from "@/protocol/wrap";
import { KDF_ID } from "@/protocol/constants";

export interface IdentityKeys {
  /** X25519 identitás privát kulcs (a `identity:<userId>` borítékok nyitásához). */
  idPriv: Uint8Array;
  /** Ed25519 aláíró privát kulcs. */
  sigPriv: Uint8Array;
}
export interface DeviceKeys {
  deviceId: string;
  devPriv: Uint8Array;
}

export function generateIdentity(): IdentityKeys {
  return { idPriv: randomBytes(32), sigPriv: randomBytes(32) };
}
export function generateDeviceKey(): Uint8Array {
  return randomBytes(32);
}
export function identityPublic(k: IdentityKeys) {
  return { identityPublicKey: toB64(x25519.getPublicKey(k.idPriv)), identitySigningPublicKey: toB64(ed25519.getPublicKey(k.sigPriv)) };
}
export const devicePublic = (devPriv: Uint8Array) => toB64(x25519.getPublicKey(devPriv));

/** RFC4122 v4 UUID (a deviceId-hoz és clientMessageId-hoz). */
export function uuidv4(): string {
  const b = randomBytes(16);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export interface KeyBackup {
  encryptedKeyBackup: string;
  backupNonce: string;
  kdfParams: { kdf: typeof KDF_ID };
}

/** Az identitás privát kulcsainak titkosítása a helyreállító kódból levezetett kulccsal. */
export function createBackup(keys: IdentityKeys, backupKey: Uint8Array): KeyBackup {
  const plain = new Uint8Array(64);
  plain.set(keys.idPriv, 0);
  plain.set(keys.sigPriv, 32);
  const nonce = randomBytes(24);
  return { encryptedKeyBackup: toB64(xchacha20poly1305(backupKey, nonce).encrypt(plain)), backupNonce: toB64(nonce), kdfParams: { kdf: KDF_ID } };
}

/** Visszafejtés; hibás kódnál (hitelesítési hiba) kivételt dob. */
export function openBackup(b: Pick<KeyBackup, "encryptedKeyBackup" | "backupNonce">, backupKey: Uint8Array): IdentityKeys {
  const plain = xchacha20poly1305(backupKey, fromB64(b.backupNonce)).decrypt(fromB64(b.encryptedKeyBackup));
  if (plain.length !== 64) throw new Error("Sérült kulcsmentés");
  return { idPriv: plain.slice(0, 32), sigPriv: plain.slice(32) };
}
