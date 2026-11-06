/**
 * Értesítések megjelenítése. A tartalom soha nem szerepel bennük: csak a feladó neve + „Új üzenet”.
 * - Előtérben (nem az adott chatben): saját toast felül.
 * - Háttérben: helyi (lokális) rendszerértesítés; koppintásra megnyílik a chat.
 * A szerveres push (Expo) ugyanide vezet a koppintáskor (`data.conversationId`). Háttérben a lekérdezés nem megbízható,
 * ott a push a fő jelzés (EAS projectId + FCM kulcs kell hozzá).
 */
import * as Notifications from "expo-notifications";
import { AppState } from "react-native";
import { router } from "expo-router";
import i18n from "i18next";
import { setIncomingHandler, type Incoming } from "@/state/chat";
import { toast } from "@/state/toast";

function openChat(data: unknown) {
  const d = (data ?? {}) as { conversationId?: unknown; convId?: unknown };
  const id = typeof d.conversationId === "string" ? d.conversationId : typeof d.convId === "string" ? d.convId : null;
  if (id) router.push({ pathname: "/chat/[id]", params: { id } });
}

function show(e: Incoming) {
  const body = e.kind === "message" ? i18n.t("notify.newMessage") : i18n.t("notify.friendRequest");
  if (AppState.currentState === "active") {
    toast.info(`${e.name} · ${body}`);
    return;
  }
  Notifications.scheduleNotificationAsync({
    content: { title: e.name, body, sound: "default", data: e.kind === "message" ? { conversationId: e.convId } : {} },
    trigger: { channelId: "messages" },
  }).catch((err) => console.warn("[notify] helyi értesítés sikertelen:", err instanceof Error ? err.message : err));
}

let sub: Notifications.EventSubscription | null = null;

/** Belépés után hívandó: bekötjük az eseményeket és a koppintás-kezelőt. */
export function initNotify(): void {
  setIncomingHandler(show);
  sub ??= Notifications.addNotificationResponseReceivedListener((r) => openChat(r.notification.request.content.data));
  // Hidegindításkor az értesítésre koppintva nyitott app is a chatre ugorjon.
  const last = Notifications.getLastNotificationResponse();
  if (last) openChat(last.notification.request.content.data);
}

export function stopNotify(): void {
  setIncomingHandler(null);
  sub?.remove();
  sub = null;
}
