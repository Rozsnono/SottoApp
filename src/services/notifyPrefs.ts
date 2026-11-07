/**
 * Értesítés-adatvédelem: „feladó elrejtése”. Ha be van kapcsolva, sem a helyi értesítés, sem a szerveres push nem
 * tartalmazza a feladó nevét (csak „Sotto” + általános szöveg). Eszközönként tárolt; a szerver is megkapja (push címe).
 */
import { api } from "@/lib/api";
import { secureGet, secureSet } from "@/lib/secure";

const KEY = "sotto.notif.hideSender";
let hide = false;

export async function loadNotifPrefs(): Promise<void> {
  hide = (await secureGet<boolean>(KEY)) === true;
}
export const getHideSender = (): boolean => hide;

/** Beállítás mentése helyben és a szerveren; a szerveres hiba nem dobódik tovább (a helyi érték így is érvényes). */
export async function setHideSender(v: boolean): Promise<void> {
  hide = v;
  await secureSet(KEY, v);
  try {
    await api("/api/devices/push", { method: "PUT", body: { notificationDetail: v ? "hidden" : "name" } });
  } catch (e) {
    console.warn("[notify] a szerver beállítás sikertelen:", e instanceof Error ? e.message : e);
  }
}
