/**
 * Biometrikus zár: naponta egyszer kell feloldani (az emlékezés 24 óra), a feloldás időbélyege a SecureStore-ban él.
 * Zároláskor a memóriabeli nyílt tartalom és az ideiglenes fájlok törlődnek.
 */
import { AppState } from "react-native";
import * as LocalAuthentication from "expo-local-authentication";
import { createStore } from "@/lib/store";
import { secureGet, secureSet } from "@/lib/secure";
import { UNLOCK_REMEMBER_MS } from "@/config";
import { dropPlaintext, pausePolling, pollOnce } from "./chat";
import i18n from "@/i18n";

interface LockState {
  enabled: boolean;
  locked: boolean;
  /** Az eszköz biometrikus módja a megfelelő ikonhoz. */
  mode: "fingerprint" | "face";
  available: boolean;
}
export const lock = createStore<LockState>({ enabled: false, locked: false, mode: "fingerprint", available: false });
const KEY = "sotto.lock";
let unlockedAt = 0;
let sub: { remove(): void } | null = null;

export async function initLock(): Promise<void> {
  const [saved, hasHw, enrolled, types] = await Promise.all([secureGet<{ enabled: boolean; unlockedAt: number }>(KEY), LocalAuthentication.hasHardwareAsync(), LocalAuthentication.isEnrolledAsync(), LocalAuthentication.supportedAuthenticationTypesAsync()]);
  const T = LocalAuthentication.AuthenticationType;
  const mode = types.includes(T.FINGERPRINT) ? "fingerprint" : types.includes(T.FACIAL_RECOGNITION) ? "face" : "fingerprint";
  unlockedAt = saved?.unlockedAt ?? 0;
  const enabled = !!saved?.enabled;
  const locked = enabled && Date.now() - unlockedAt > UNLOCK_REMEMBER_MS;
  pausePolling(locked);
  lock.set({ enabled, available: hasHw && enrolled, mode, locked });
  sub ??= AppState.addEventListener("change", (st) => { if (st === "active") evaluate(); });
}

/** Lejárt-e az emlékezés – ha igen, zárol és a nyílt tartalmat törli. */
export function evaluate(): void {
  const s = lock.get();
  if (s.enabled && !s.locked && Date.now() - unlockedAt > UNLOCK_REMEMBER_MS) {
    pausePolling(true);
    dropPlaintext();
    lock.set({ locked: true });
  }
}

export async function unlock(): Promise<boolean> {
  const r = await LocalAuthentication.authenticateAsync({ promptMessage: i18n.t("lock.biometricReason"), cancelLabel: i18n.t("common.cancel"), disableDeviceFallback: false });
  if (!r.success) return false;
  unlockedAt = Date.now();
  await secureSet(KEY, { enabled: true, unlockedAt });
  lock.set({ locked: false });
  pausePolling(false);
  void pollOnce();
  return true;
}

/** Be-/kikapcsolás; bekapcsoláskor azonnal hitelesíteni kell. */
export async function setLockEnabled(on: boolean): Promise<boolean> {
  if (on) {
    const r = await LocalAuthentication.authenticateAsync({ promptMessage: i18n.t("lock.biometricReason") });
    if (!r.success) return false;
    unlockedAt = Date.now();
  }
  await secureSet(KEY, { enabled: on, unlockedAt });
  pausePolling(false);
  lock.set({ enabled: on, locked: false });
  return true;
}
