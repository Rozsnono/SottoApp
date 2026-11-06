/**
 * Médiafájl STREAM-szerű titkosítása: 64 KiB-os nyílt chunkok, mindegyik XChaCha20-Poly1305-tel;
 * nonce = alap-nonce(19) ‖ számláló(4, BE) ‖ utolsó-chunk-jelző(1). A jelző megakadályozza a csonkolást,
 * a számláló az átrendezést. A titkosított chunk mérete: nyílt + 16.
 */
import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";

export const STREAM_CHUNK = 64 * 1024;
export const TAG_BYTES = 16;
export const BASE_NONCE_BYTES = 19;

function chunkNonce(base: Uint8Array, index: number, last: boolean): Uint8Array {
  if (base.length !== BASE_NONCE_BYTES) throw new Error("Érvénytelen alap-nonce");
  const n = new Uint8Array(24);
  n.set(base, 0);
  new DataView(n.buffer).setUint32(19, index, false);
  n[23] = last ? 1 : 0;
  return n;
}

export const encryptedSize = (plainSize: number) => plainSize + Math.max(1, Math.ceil(plainSize / STREAM_CHUNK)) * TAG_BYTES;

export function encryptChunk(key: Uint8Array, base: Uint8Array, index: number, last: boolean, plain: Uint8Array): Uint8Array {
  return xchacha20poly1305(key, chunkNonce(base, index, last)).encrypt(plain);
}
export function decryptChunk(key: Uint8Array, base: Uint8Array, index: number, last: boolean, cipher: Uint8Array): Uint8Array {
  return xchacha20poly1305(key, chunkNonce(base, index, last)).decrypt(cipher);
}

/** Memóriabeli segédek (tesztekhez és kis fájlokhoz). */
export function encryptBuffer(key: Uint8Array, base: Uint8Array, data: Uint8Array): Uint8Array {
  const count = Math.max(1, Math.ceil(data.length / STREAM_CHUNK));
  const out = new Uint8Array(encryptedSize(data.length));
  let o = 0;
  for (let i = 0; i < count; i++) {
    const enc = encryptChunk(key, base, i, i === count - 1, data.subarray(i * STREAM_CHUNK, (i + 1) * STREAM_CHUNK));
    out.set(enc, o);
    o += enc.length;
  }
  return out;
}
export function decryptBuffer(key: Uint8Array, base: Uint8Array, data: Uint8Array): Uint8Array {
  const step = STREAM_CHUNK + TAG_BYTES;
  const count = Math.max(1, Math.ceil(data.length / step));
  const parts: Uint8Array[] = [];
  for (let i = 0; i < count; i++) parts.push(decryptChunk(key, base, i, i === count - 1, data.subarray(i * step, (i + 1) * step)));
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
