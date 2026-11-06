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
import { deriveRecoveryKeys, formatRecoveryCode, generateRecoveryCode, normalizeRecoveryCode } from "@/crypto/recovery";
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
/** Függő belépés eszközkulcsa (amíg a helyreállító kód még nincs megadva). */
const K_DEVICE = "sotto.device";
/** Régi, egyfiókos tárolás (migrálandó). */
const K_IDENTITY = "sotto.identity";
const K_OWNER = "sotto.owner";

/**
 * Fiókonkénti kulcstár: minden fiókhoz saját bejegyzés (identitás- és eszközkulcs + ha ismert, a helyreállító kód).
 * Kilépés után is megmarad, így ugyanazzal a fiókkal újra belépve – akár több fiók váltogatása mellett – nem kell kód.
 * A SecureStore kulcsnév nem tartalmazhat szimbólumokat, ezért a felhasználónév hexa kódolva szerepel benne.
 */
interface KeyEntry {
  userId: string;
  idPriv: string;
  sigPriv: string;
  deviceId: string;
  devPriv: string;
  /** A helyreállító kód (formázva), ha ezen az eszközön ismert (regisztráció / megadás). */
  recoveryCode?: string;
}
const entryKey = (username: string) => "sotto.k." + Array.from(new TextEncoder().encode(normalizeUsername(username)), (b) => b.toString(16).padStart(2, "0")).join("");
const loadEntry = (username: string) => secureGet<KeyEntry>(entryKey(username));
const saveEntry = (username: string, e: KeyEntry) => secureSet(entryKey(username), e);

/** Régi egyfiókos kulcstár átvitele a fiókonkéntibe (egyszeri, ha van mit). */
async function migrateLegacy(): Promise<void> {
  const [owner, ident, dev] = await Promise.all([secureGet<{ userId: string; username: string }>(K_OWNER), secureGet<{ idPriv: string; sigPriv: string }>(K_IDENTITY), secureGet<{ deviceId: string; devPriv: string }>(K_DEVICE)]);
  if (!owner || !ident || !dev) return;
  if (!(await loadEntry(owner.username))) await saveEntry(owner.username, { userId: owner.userId, ...ident, ...dev });
  await Promise.all([K_IDENTITY, K_OWNER, K_DEVICE].map(secureDel));
}

let tokens: Tokens | null = null;
/** Hívás a munkamenet végén (a chat motor leállítása, memória törlése) – a chat modul köti be. */
let onEnded: (() => void) | null = null;
export const setSessionEndedHandler = (f: () => void) => { onEnded = f; };

configureAuth({
  getTokens: () => tokens,
  setTokens: async (t) => { tokens = t; await secureSet(K_TOKENS, t); },
  onAuthLost: () => { void clearLocal(); },
});

/** Munkamenet törlése. A fiókonkénti kulcstár érintetlen marad (kivéve fióktörlésnél, lásd `deleteAccount`). */
async function clearLocal() {
  tokens = null;
  await Promise.all([K_TOKENS, K_ME, K_DEVICE].map(secureDel));
  onEnded?.();
  session.set({ status: "anon", me: null, keys: null, recoveryCodeToShow: null });
}

const deviceName = () => (Device.deviceName || Device.modelName || `${Platform.OS}`).slice(0, 60);
const toKeys = (e: KeyEntry): Keys => ({ idPriv: fromB64(e.idPriv), sigPriv: fromB64(e.sigPriv), devPriv: fromB64(e.devPriv), deviceId: e.deviceId });
const matchesAccount = (e: KeyEntry, me: Me) => {
  const pub = identityPublic({ idPriv: fromB64(e.idPriv), sigPriv: fromB64(e.sigPriv) });
  return e.userId === me.id && pub.identityPublicKey === me.identityPublicKey && pub.identitySigningPublicKey === me.identitySigningPublicKey;
};

/** Indításkor: a tárolt munkamenet betöltése. */
export async function loadSession(): Promise<void> {
  await migrateLegacy();
  const [t, me] = await Promise.all([secureGet<Tokens>(K_TOKENS), secureGet<Me>(K_ME)]);
  if (!t || !me) return void session.set({ status: "anon" });
  tokens = t;
  const entry = await loadEntry(me.username);
  if (entry && matchesAccount(entry, me)) return void session.set({ status: "ready", me, keys: toKeys(entry) });
  session.set({ status: "needs-keys", me });
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
  tokens = res.tokens;
  await Promise.all([secureSet(K_TOKENS, res.tokens), secureSet(K_ME, res.user)]);
  await saveEntry(res.user.username, { userId: res.user.id, idPriv: toB64(identity.idPriv), sigPriv: toB64(identity.sigPriv), deviceId, devPriv: toB64(devPriv), recoveryCode: code });
  session.set({ status: "ready", me: res.user, keys: { ...identity, devPriv, deviceId }, recoveryCodeToShow: code });
}

/**
 * Belépés. Ha ezen az eszközön ennek a fióknak a kulcsai megvannak (a fiókonkénti kulcstárban), azonnal `ready`.
 * Egyébként új eszközként `needs-keys` (helyreállító kód kell, amit utána a kulcstár megőriz).
 */
export async function login(username: string, password: string): Promise<void> {
  await migrateLegacy();
  const entry = await loadEntry(username);
  const attempt = (deviceId: string, devPriv: Uint8Array) => api<{ user: Me; tokens: Tokens }>("/api/auth/login", { method: "POST", auth: false, body: { username, password, device: { deviceId, deviceName: deviceName(), devicePublicKey: devicePublic(devPriv) } } });

  if (entry) {
    try {
      const res = await attempt(entry.deviceId, fromB64(entry.devPriv));
      tokens = res.tokens;
      await Promise.all([secureSet(K_TOKENS, res.tokens), secureSet(K_ME, res.user)]);
      if (matchesAccount(entry, res.user)) return void session.set({ status: "ready", me: res.user, keys: toKeys(entry) });
      // A mentett kulcs nem egyezik a fiókkal (pl. a fiók újra létrejött): a bejegyzés érvénytelen, kód kell.
      await secureDel(entryKey(username));
      await secureSet(K_DEVICE, { deviceId: entry.deviceId, devPriv: entry.devPriv });
      return void session.set({ status: "needs-keys", me: res.user, keys: null });
    } catch (e) {
      // Visszavont/ütköző eszköz: új eszközként próbáljuk; minden más hiba (pl. rossz jelszó) továbbmegy.
      if (!(e instanceof ApiError && (e.code === "FORBIDDEN" || e.code === "CONFLICT"))) throw e;
    }
  }
  const devPriv = generateDeviceKey();
  const deviceId = uuidv4();
  const res = await attempt(deviceId, devPriv);
  tokens = res.tokens;
  await Promise.all([secureSet(K_TOKENS, res.tokens), secureSet(K_ME, res.user), secureSet(K_DEVICE, { deviceId, devPriv: toB64(devPriv) })]);
  session.set({ status: "needs-keys", me: res.user, keys: null });
}

/** Helyreállító kód megadása: a mentés visszafejtése; sikertelen (rossz kód) esetén kivételt dob. A kód a kulcstárba kerül. */
export async function restoreKeys(code: string): Promise<void> {
  const st = session.get();
  const dev = await secureGet<{ deviceId: string; devPriv: string }>(K_DEVICE);
  if (!st.me || !dev) throw new Error("Nincs munkamenet");
  const backup = await api<{ encryptedKeyBackup: string; backupNonce: string; identityPublicKey: string; identitySigningPublicKey: string }>("/api/keys/backup");
  const identity = openBackup(backup, deriveRecoveryKeys(code).backupKey);
  const pub = identityPublic(identity);
  if (pub.identityPublicKey !== backup.identityPublicKey || pub.identitySigningPublicKey !== backup.identitySigningPublicKey) throw new Error("A mentés nem egyezik a fiókkal");
  const norm = normalizeRecoveryCode(code)!;
  await saveEntry(st.me.username, { userId: st.me.id, idPriv: toB64(identity.idPriv), sigPriv: toB64(identity.sigPriv), deviceId: dev.deviceId, devPriv: dev.devPriv, recoveryCode: formatRecoveryCode(norm) });
  await secureDel(K_DEVICE);
  session.set({ status: "ready", keys: { ...identity, devPriv: fromB64(dev.devPriv), deviceId: dev.deviceId } });
}

/** Az ezen az eszközön elmentett helyreállító kód (ha ismert) – a Fiók beállításokban megtekinthető. */
export async function savedRecoveryCode(): Promise<string | null> {
  const me = session.get().me;
  return me ? ((await loadEntry(me.username))?.recoveryCode ?? null) : null;
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
  await clearLocal(); // a fiók kulcsai az eszközön maradnak
}

/** Fiók törlése jelszóval (30 napig visszaállítható): a fiók helyi kulcstár-bejegyzése is törlődik. */
export async function deleteAccount(password: string): Promise<void> {
  const username = session.get().me?.username;
  await api("/api/account", { method: "DELETE", body: { password } });
  if (username) await secureDel(entryKey(username));
  await clearLocal();
}
