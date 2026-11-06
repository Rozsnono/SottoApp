/**
 * Munkamenet és kulcsok. Titkos adat (tokenek, privát kulcsok) csak a SecureStore-ban él és a memóriában.
 * Állapotok: loading → anon (nincs belépve) → needs-keys (belépve, de az identitáskulcs még nincs ezen az eszközön) → ready.
 */
import { createStore } from "@/lib/store";
import { api, ApiError, configureAuth, type Tokens } from "@/lib/api";
import { secureDel, secureGet, secureSet } from "@/lib/secure";
import { fromB64, toB64 } from "@/protocol/wrap";
import { normalizeUsername } from "@/protocol/schemas";
import { createBackup, devicePublic, generateDeviceKey, generateIdentity, identityPublic, openBackup, uuidv4, type IdentityKeys } from "@/crypto/keys";
import { deriveRecoveryKeys, generateRecoveryCode } from "@/crypto/recovery";
import { Platform } from "react-native";
import * as Device from "expo-device";

export interface Me {
  id: string;
  username: string;
  identityPublicKey: string;
  identitySigningPublicKey: string;
  discoverability: "everyone" | "friends_only" | "hidden";
  friendRequestPolicy: "everyone" | "friends_only";
}
export interface Keys extends IdentityKeys {
  devPriv: Uint8Array;
  deviceId: string;
}
interface SessionState {
  status: "loading" | "anon" | "needs-keys" | "ready";
  me: Me | null;
  keys: Keys | null;
  /** Regisztráció után egyszer mutatott kód; megjelenítés után törlődik a memóriából. */
  recoveryCodeToShow: string | null;
}

export const session = createStore<SessionState>({ status: "loading", me: null, keys: null, recoveryCodeToShow: null });

const K_TOKENS = "sotto.tokens";
const K_ME = "sotto.me";
const K_IDENTITY = "sotto.identity";
const K_DEVICE = "sotto.device";
/** Kinek a kulcsai vannak az eszközön (kilépés után is megmaradnak, hogy ugyanazzal a fiókkal újra belépve ne kelljen kód). */
const K_OWNER = "sotto.owner";
let tokens: Tokens | null = null;
/** Hívás a munkamenet végén (a chat motor leállítása, memória törlése) – a chat modul köti be. */
let onEnded: (() => void) | null = null;
export const setSessionEndedHandler = (f: () => void) => { onEnded = f; };

configureAuth({
  getTokens: () => tokens,
  setTokens: async (t) => { tokens = t; await secureSet(K_TOKENS, t); },
  onAuthLost: () => { void clearLocal(); },
});

/**
 * Munkamenet törlése. `wipeKeys=false` (kilépés, lejárt munkamenet): a kulcsok a SecureStore-ban maradnak, így a
 * mentett fiókkal ugyanazon az eszközön újra belépve nincs szükség a helyreállító kódra.
 * `wipeKeys=true` (fiók törlése): minden titok törlődik.
 */
async function clearLocal(wipeKeys = false) {
  tokens = null;
  await Promise.all([K_TOKENS, K_ME, ...(wipeKeys ? [K_IDENTITY, K_DEVICE, K_OWNER] : [])].map(secureDel));
  onEnded?.();
  session.set({ status: "anon", me: null, keys: null, recoveryCodeToShow: null });
}

const deviceName = () => (Device.deviceName || Device.modelName || `${Platform.OS}`).slice(0, 60);
const b64Keys = (k: IdentityKeys) => ({ idPriv: toB64(k.idPriv), sigPriv: toB64(k.sigPriv) });

/** Indításkor: a tárolt munkamenet betöltése. */
export async function loadSession(): Promise<void> {
  const [t, me, ident, dev] = await Promise.all([secureGet<Tokens>(K_TOKENS), secureGet<Me>(K_ME), secureGet<{ idPriv: string; sigPriv: string }>(K_IDENTITY), secureGet<{ deviceId: string; devPriv: string }>(K_DEVICE)]);
  if (!t || !me || !dev) return void session.set({ status: "anon" });
  tokens = t;
  if (!ident) return void session.set({ status: "needs-keys", me });
  session.set({ status: "ready", me, keys: { idPriv: fromB64(ident.idPriv), sigPriv: fromB64(ident.sigPriv), devPriv: fromB64(dev.devPriv), deviceId: dev.deviceId } });
}

async function persistAuth(me: Me, t: Tokens, dev: { deviceId: string; devPriv: Uint8Array }) {
  tokens = t;
  await Promise.all([secureSet(K_TOKENS, t), secureSet(K_ME, me), secureSet(K_DEVICE, { deviceId: dev.deviceId, devPriv: toB64(dev.devPriv) })]);
}

/** Regisztráció: a kulcsok és a helyreállító kód a készüléken készülnek; a szerver csak publikus kulcsot, verifier-t és titkosított mentést kap. */
export async function register(username: string, password: string): Promise<void> {
  const identity = generateIdentity();
  const code = generateRecoveryCode();
  const rk = deriveRecoveryKeys(code);
  const devPriv = generateDeviceKey();
  const deviceId = uuidv4();
  const pub = identityPublic(identity);
  const res = await api<{ user: Me; tokens: Tokens }>("/api/auth/register", {
    method: "POST",
    auth: false,
    body: { username, password, ...pub, recoveryVerifier: toB64(rk.verifier), backup: createBackup(identity, rk.backupKey), device: { deviceId, deviceName: deviceName(), devicePublicKey: devicePublic(devPriv) } },
  });
  await persistAuth(res.user, res.tokens, { deviceId, devPriv });
  await secureSet(K_IDENTITY, b64Keys(identity));
  await secureSet(K_OWNER, { userId: res.user.id, username: normalizeUsername(res.user.username) });
  session.set({ status: "ready", me: res.user, keys: { ...identity, devPriv, deviceId }, recoveryCodeToShow: code });
}

/**
 * Belépés. Ha ezen az eszközön ugyanennek a fiókénak a kulcsai megvannak (előző kilépés után is megmaradnak),
 * a kulcsokkal azonnal `ready` állapotba lép. Egyébként új eszközként `needs-keys` (helyreállító kód kell).
 */
export async function login(username: string, password: string): Promise<void> {
  const [owner, ident, saved] = await Promise.all([secureGet<{ userId: string; username: string }>(K_OWNER), secureGet<{ idPriv: string; sigPriv: string }>(K_IDENTITY), secureGet<{ deviceId: string; devPriv: string }>(K_DEVICE)]);
  const canReuse = !!(owner && ident && saved && owner.username === normalizeUsername(username));
  const attempt = async (deviceId: string, devPriv: Uint8Array) => api<{ user: Me; tokens: Tokens }>("/api/auth/login", { method: "POST", auth: false, body: { username, password, device: { deviceId, deviceName: deviceName(), devicePublicKey: devicePublic(devPriv) } } });

  if (canReuse) {
    const devPriv = fromB64(saved!.devPriv);
    try {
      const res = await attempt(saved!.deviceId, devPriv);
      const idk: IdentityKeys = { idPriv: fromB64(ident!.idPriv), sigPriv: fromB64(ident!.sigPriv) };
      const pub = identityPublic(idk);
      if (res.user.id === owner!.userId && pub.identityPublicKey === res.user.identityPublicKey && pub.identitySigningPublicKey === res.user.identitySigningPublicKey) {
        await persistAuth(res.user, res.tokens, { deviceId: saved!.deviceId, devPriv });
        return void session.set({ status: "ready", me: res.user, keys: { ...idk, devPriv, deviceId: saved!.deviceId } });
      }
      // A mentett kulcs nem egyezik a fiókkal: eldobjuk, és a helyreállító kód kell (az eszköz már regisztrált).
      await secureDel(K_IDENTITY);
      await persistAuth(res.user, res.tokens, { deviceId: saved!.deviceId, devPriv });
      return void session.set({ status: "needs-keys", me: res.user, keys: null });
    } catch (e) {
      // Visszavont/ütköző eszköz: új eszközként próbáljuk; minden más hiba (pl. rossz jelszó) továbbmegy.
      if (!(e instanceof ApiError && (e.code === "FORBIDDEN" || e.code === "CONFLICT"))) throw e;
    }
  }
  const devPriv = generateDeviceKey();
  const deviceId = uuidv4();
  const res = await attempt(deviceId, devPriv);
  await secureDel(K_IDENTITY); // másik fiók/új eszköz: a régi kulcs nem használható
  await persistAuth(res.user, res.tokens, { deviceId, devPriv });
  session.set({ status: "needs-keys", me: res.user, keys: null });
}

/** Helyreállító kód megadása: a mentés visszafejtése; sikertelen (rossz kód) esetén kivételt dob. */
export async function restoreKeys(code: string): Promise<void> {
  const st = session.get();
  const dev = await secureGet<{ deviceId: string; devPriv: string }>(K_DEVICE);
  if (!st.me || !dev) throw new Error("Nincs munkamenet");
  const backup = await api<{ encryptedKeyBackup: string; backupNonce: string; identityPublicKey: string; identitySigningPublicKey: string }>("/api/keys/backup");
  const identity = openBackup(backup, deriveRecoveryKeys(code).backupKey);
  const pub = identityPublic(identity);
  if (pub.identityPublicKey !== backup.identityPublicKey || pub.identitySigningPublicKey !== backup.identitySigningPublicKey) throw new Error("A mentés nem egyezik a fiókkal");
  await secureSet(K_IDENTITY, b64Keys(identity));
  await secureSet(K_OWNER, { userId: st.me.id, username: normalizeUsername(st.me.username) });
  session.set({ status: "ready", keys: { ...identity, devPriv: fromB64(dev.devPriv), deviceId: dev.deviceId } });
}

export function ackRecoveryCode() {
  session.set({ recoveryCodeToShow: null });
}

export async function logout(): Promise<void> {
  const t = tokens;
  try {
    if (t) await api("/api/auth/logout", { method: "POST", body: { refreshToken: t.refreshToken } });
  } catch (e) {
    console.warn("[session] szerver-oldali kilépés sikertelen (helyben törlünk):", e instanceof Error ? e.message : e);
  }
  await clearLocal(false); // a kulcsok az eszközön maradnak
}

/** Fiók törlése jelszóval (30 napig visszaállítható). */
export async function deleteAccount(password: string): Promise<void> {
  await api("/api/account", { method: "DELETE", body: { password } });
  await clearLocal(true);
}
