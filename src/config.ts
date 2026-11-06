/**
 * Környezetfüggő konfiguráció. Az API URL a `EXPO_PUBLIC_API_URL` változóból (vagy az app.json `extra.apiUrl`-ből) jön;
 * titkos érték itt nincs (a média API kulcsot az eszköz-kulcsra zárva kapjuk a szervertől).
 */
import Constants from "expo-constants";

export const API_URL: string = (process.env.EXPO_PUBLIC_API_URL || (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl || "http://localhost:3002").replace(/\/+$/, "");

/** Szinkron-lekérdezés ritkasága előtérben (ms). A push az elsődleges jelzés, ez csak kiegészítés. */
export const SYNC_INTERVAL_MS = 8000;
/** Biometrikus feloldás emlékezése (ms): naponta 1×. */
export const UNLOCK_REMEMBER_MS = 24 * 60 * 60 * 1000;
/** Média: kép- és videókorlát a protokollból (lásd src/protocol/constants). */
export const MEDIA_CHUNK_BYTES = 64 * 1024;
