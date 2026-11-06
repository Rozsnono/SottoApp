/** Biztonsági szám (safety number): a két identitáskulcsból közösen számolt 30 jegyű szám (6×5), amit a felek összehasonlíthatnak. */
import { sha256 } from "@noble/hashes/sha2.js";
import { fromB64, utf8 } from "@/protocol/wrap";

export function safetyNumber(pubA: string, pubB: string): string[] {
  const [a, b] = [pubA, pubB].sort();
  const pre = utf8("sotto-safety-v1");
  const ka = fromB64(a);
  const kb = fromB64(b);
  const buf = new Uint8Array(pre.length + ka.length + kb.length);
  buf.set(pre, 0);
  buf.set(ka, pre.length);
  buf.set(kb, pre.length + ka.length);
  const h = sha256(buf);
  const dv = new DataView(h.buffer, h.byteOffset);
  return Array.from({ length: 6 }, (_, i) => String(dv.getUint32(i * 4, false) % 100000).padStart(5, "0"));
}
