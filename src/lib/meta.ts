/**
 * Nem titkos, helyi metaadat (olvasottsági azonosítók, kulcs-rögzítések). Fájlban él a dokumentum-könyvtárban;
 * üzenettartalom itt SOHA nem tárolódik (az csak memóriában van).
 */
import { File, Paths } from "expo-file-system";

export interface Meta {
  /** Az általunk már „olvasottnak” jelzett bejövő üzenetek azonosítói (korlátozott méret). */
  readIds: string[];
  /** TOFU: a partner első látott kulcsai (userId → kulcsok). */
  pins: Record<string, { id: string; sig: string }>;
  /** Biztonsági szám ellenőrzöttnek jelölve (userId → rögzített kulcs-ujjlenyomat). */
  verified: Record<string, string>;
}
const empty = (): Meta => ({ readIds: [], pins: {}, verified: {} });
const file = () => new File(Paths.document, "sotto-meta.json");

export async function loadMeta(): Promise<Meta> {
  try {
    const f = file();
    if (!f.exists) return empty();
    return { ...empty(), ...(JSON.parse(await f.text()) as Partial<Meta>) };
  } catch (e) {
    console.warn("[meta] betöltés sikertelen, üres állapottal indulunk", e instanceof Error ? e.message : e);
    return empty();
  }
}

export function saveMeta(m: Meta): void {
  try {
    const f = file();
    f.create({ overwrite: true });
    f.write(JSON.stringify({ ...m, readIds: m.readIds.slice(-4000) }));
  } catch (e) {
    console.warn("[meta] mentés sikertelen", e instanceof Error ? e.message : e);
  }
}

export function wipeMeta(): void {
  try {
    const f = file();
    if (f.exists) f.delete();
  } catch {
    /* nincs mit törölni */
  }
}
