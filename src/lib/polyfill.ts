/**
 * Véletlenszám-forrás az @noble/* könyvtáraknak: a Hermes nem mindig ad `crypto.getRandomValues`-t,
 * ezért az `expo-crypto` natív (CSPRNG) megvalósítását kötjük be. Az app belépési pontján ELSŐKÉNT importáljuk.
 */
import * as ExpoCrypto from "expo-crypto";

const g = globalThis as unknown as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } };
if (!g.crypto) g.crypto = {};
if (typeof g.crypto.getRandomValues !== "function") {
  g.crypto.getRandomValues = (a: Uint8Array) => ExpoCrypto.getRandomValues(a as never) as unknown as Uint8Array;
}
