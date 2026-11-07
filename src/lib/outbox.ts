/**
 * Kimenő sor tartós tárolása: az el nem küldött SZÖVEGES üzenetek az eszközön titkosítva (XChaCha20-Poly1305, az
 * identitáskulcsból HKDF-fel levezetett kulccsal) maradnak meg, így az app újraindítása után is elmennek.
 * Nyílt szöveg sosem kerül lemezre. Média nem perzisztált (a nyílt másolat lemezen maradna). Fiókonként külön fájl.
 */
import { File, Paths } from "expo-file-system";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import { randomBytes } from "@noble/hashes/utils.js";
import { fromB64, toB64, utf8 } from "@/protocol/wrap";

export interface OutboxEntry {
  convId: string;
  clientMessageId: string;
  createdAt: number;
  /** A már összeállított (titkosítatlan) hasznos teher: szöveg, rejtett jelző, válasz-hivatkozás. */
  payload: unknown;
}

const key = (idPriv: Uint8Array) => hkdf(sha256, idPriv, utf8("sotto-outbox"), utf8("outbox-v1"), 32);
const file = (userId: string) => new File(Paths.document, `sotto-outbox-${userId}.json`);

export function saveOutbox(userId: string, idPriv: Uint8Array, entries: OutboxEntry[]): void {
  try {
    const f = file(userId);
    if (!entries.length) {
      if (f.exists) f.delete();
      return;
    }
    const nonce = randomBytes(24);
    const ct = xchacha20poly1305(key(idPriv), nonce).encrypt(utf8(JSON.stringify(entries)));
    f.create({ overwrite: true });
    f.write(JSON.stringify({ v: 1, nonce: toB64(nonce), ct: toB64(ct) }));
  } catch (e) {
    console.warn("[outbox] mentés sikertelen", e instanceof Error ? e.message : e);
  }
}

export async function loadOutbox(userId: string, idPriv: Uint8Array): Promise<OutboxEntry[]> {
  try {
    const f = file(userId);
    if (!f.exists) return [];
    const j = JSON.parse(await f.text()) as { nonce: string; ct: string };
    return JSON.parse(new TextDecoder().decode(xchacha20poly1305(key(idPriv), fromB64(j.nonce)).decrypt(fromB64(j.ct)))) as OutboxEntry[];
  } catch (e) {
    console.warn("[outbox] betöltés sikertelen, a sor üresnek számít", e instanceof Error ? e.message : e);
    return [];
  }
}

export function wipeOutbox(userId: string): void {
  try {
    const f = file(userId);
    if (f.exists) f.delete();
  } catch {
    /* nincs mit törölni */
  }
}
