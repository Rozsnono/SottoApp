/**
 * Push értesítések (Expo). A tartalom soha nem megy a push-ban (csak feladó neve + „Új üzenet”); az értesítés
 * ébresztő jel: megérkezésekor azonnal szinkronizálunk. Hiba esetén nem omlik össze, csak logol.
 */
import * as Notifications from "expo-notifications";
import { AndroidImportance } from "expo-notifications";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { api } from "@/lib/api";
import { pollOnce } from "@/state/chat";

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

let sub: Notifications.EventSubscription | null = null;

/** Engedélykérés + token regisztrálása a szerveren. `false`, ha nem sikerült/nincs engedély. */
export async function registerPush(): Promise<boolean> {
  try {
    if (Platform.OS === "android") await Notifications.setNotificationChannelAsync("messages", { name: "Messages", importance: AndroidImportance.HIGH });
    let st = (await Notifications.getPermissionsAsync()).status;
    if (st !== "granted") st = (await Notifications.requestPermissionsAsync()).status;
    if (st !== "granted") return false;
    const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ?? Constants.easConfig?.projectId;
    const token = (await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined)).data;
    await api("/api/devices/push", { method: "PUT", body: { pushToken: token, notificationsEnabled: true } });
    sub ??= Notifications.addNotificationReceivedListener(() => void pollOnce());
    return true;
  } catch (e) {
    console.warn("[push] regisztráció sikertelen:", e instanceof Error ? e.message : e);
    return false;
  }
}

export async function disablePush(): Promise<void> {
  try {
    await api("/api/devices/push", { method: "PUT", body: { pushToken: null, notificationsEnabled: false } });
  } catch (e) {
    console.warn("[push] kikapcsolás sikertelen:", e instanceof Error ? e.message : e);
  }
}
