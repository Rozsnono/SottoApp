/** Titkos adatok tárolása az OS kulcstárolójában (iOS Keychain / Android Keystore), csak feloldott, eszközhöz kötött módon. */
import * as SecureStore from "expo-secure-store";

const opts: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

export async function secureGet<T>(key: string): Promise<T | null> {
  try {
    const v = await SecureStore.getItemAsync(key, opts);
    return v ? (JSON.parse(v) as T) : null;
  } catch (e) {
    console.warn("[secure] olvasás sikertelen:", key, e instanceof Error ? e.message : e);
    return null;
  }
}
export async function secureSet(key: string, value: unknown): Promise<void> {
  await SecureStore.setItemAsync(key, JSON.stringify(value), opts);
}
export async function secureDel(key: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(key, opts);
  } catch (e) {
    console.warn("[secure] törlés sikertelen:", key, e instanceof Error ? e.message : e);
  }
}
