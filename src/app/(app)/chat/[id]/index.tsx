/** Beszélgetés: üzenetlista (fordított), rejtett/zárt média, olvasás-jelzés, üzenet-menü, jelentés, szerkesztő. */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, FlatList, Modal, Pressable, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as Clipboard from "expo-clipboard";
import * as ImagePicker from "expo-image-picker";
import { Ban, BellOff, Bell, Check, ChevronLeft, Copy, Eye, Flag, Lock, MoreHorizontal, Palette, ShieldAlert, Trash2, Mail, X } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Banner, Button, IconButton, Kav, Monogram, Screen, T } from "@/components/ui";
import { MessageBubble, SystemNotice } from "@/components/Bubble";
import { Composer } from "@/components/Composer";
import { acceptKeyChange, chat, deleteForAll, discardFailed, displayName, isMuted, loadPrefs, markRead, reportMessage, retrySend, sendEvent, sendMedia, sendText, setMute, type Msg } from "@/state/chat";
import { errorText } from "@/lib/errors";
import { useStore } from "@/lib/store";
import { MAX_VIDEO_DURATION_MS, type REPORT_REASONS } from "@/protocol/constants";
import { radius, size, space, useTheme } from "@/theme";
import { CHAT_THEMES, themeByKey } from "@/theme/chatThemes";
import { currentTheme, isThemeEvent, isVisible, reactionMap, REACTION_EMOJIS } from "@/lib/events";

const EMPTY: Msg[] = [];
type Reason = (typeof REPORT_REASONS)[number];
const REASONS: { key: Reason; icon: typeof Ban }[] = [{ key: "harassment", icon: Ban }, { key: "spam", icon: Mail }, { key: "illegal", icon: ShieldAlert }, { key: "other", icon: MoreHorizontal }];

function Sheet({ visible, onClose, children }: { visible: boolean; onClose: () => void; children: React.ReactNode }) {
  const { c } = useTheme();
  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: c.overlay }} onPress={onClose} accessibilityLabel="close" />
      <View style={{ backgroundColor: c.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: space[5], gap: space[4], paddingBottom: space[8] }}>{children}</View>
    </Modal>
  );
}

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c, tint, dark } = useTheme();
  const { t } = useTranslation();
  const conv = useStore(chat, (s) => s.conversations.find((x) => x.id === id));
  const prefs = useStore(chat, (s) => s.prefs);
  const stored = useStore(chat, (s) => s.messages[id]);
  const list = stored ?? EMPTY;
  const keyChanged = useStore(chat, (s) => (conv ? s.keyChanged[conv.other.id] : false));
  const [menu, setMenu] = useState<Msg | null>(null);
  const [reporting, setReporting] = useState<Msg | null>(null);
  const [reason, setReason] = useState<Reason>("harassment");
  const [understood, setUnderstood] = useState(false);
  const [picking, setPicking] = useState(false);

  useEffect(() => { if (conv) void loadPrefs(conv.other.id); }, [conv]);
  const data = useMemo(() => list.filter(isVisible).reverse(), [list]);
  const reactions = useMemo(() => reactionMap(list), [list]);
  const theme = themeByKey(currentTheme(list));
  const themeBg = (dark ? theme.bgDark : theme.bgLight) || c.bg;
  const lastMineId = useMemo(() => list.filter((m) => m.mine && m.type !== "event").at(-1)?.id, [list]);
  const name = conv ? (conv.available ? displayName(conv, prefs) : t("chats.unavailable")) : "";
  const muted = conv ? isMuted(conv) : false;
  const fail = (e: unknown) => Alert.alert(errorText(e));

  // Normál (nem rejtett) bejövő szöveg: a képernyőre kerüléskor olvasottá válik. Rejtett/média: felfedéskor/megnyitáskor.
  const onViewable = useCallback(({ viewableItems }: { viewableItems: { item: Msg }[] }) => {
    for (const { item } of viewableItems) if (!item.mine && item.type === "text" && !item.payload?.hidden && !item.broken && !item.forged) void markRead(item);
  }, []);

  const pickGallery = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images", "videos"], quality: 0.8, videoMaxDuration: 60 });
    const a = r.assets?.[0];
    if (r.canceled || !a) return;
    const isVideo = a.type === "video";
    if (isVideo && (a.duration ?? 0) > MAX_VIDEO_DURATION_MS) return Alert.alert(t("chat.videoLimit"));
    sendMedia(id, a.uri, isVideo ? "video" : "image", { mime: a.mimeType ?? (isVideo ? "video/mp4" : "image/jpeg"), width: a.width, height: a.height, durationMs: a.duration ?? undefined }, false).catch(fail);
  };

  const noticeText = (m: Msg) => {
    const ev = m.payload?.event;
    const themeName = t(`themes.${ev?.kind === "theme" ? ev.theme : "default"}`);
    return m.mine ? t("chat.youThemeChanged", { theme: themeName }) : t("chat.themeChanged", { name, theme: themeName });
  };
  const react = (m: Msg, emoji: string) => {
    const mine = reactions[m.id]?.find((r) => r.mine)?.emoji;
    setMenu(null);
    sendEvent(id, { kind: "reaction", target: m.id, emoji: mine === emoji ? null : emoji }).catch(() => Alert.alert(t("chat.reactionFailed")));
  };
  const pickTheme = (key: string) => {
    setPicking(false);
    if (key !== theme.key) sendEvent(id, { kind: "theme", theme: key }).catch((e) => fail(e));
  };

  const doDelete = (m: Msg) => Alert.alert(t("chat.deleteForAll"), t("chat.deleteConfirm"), [{ text: t("common.cancel"), style: "cancel" }, { text: t("common.delete"), style: "destructive", onPress: () => void deleteForAll(m).catch(fail) }]);

  const submitReport = async () => {
    if (!reporting) return;
    try {
      await reportMessage(reporting, reason, true);
      setReporting(null);
      setUnderstood(false);
      Alert.alert(t("report.sent"));
    } catch (e) { fail(e); }
  };

  if (!conv) return <Screen><View style={{ padding: space[4] }}><IconButton icon={ChevronLeft} label={t("common.back")} onPress={() => router.back()} /></View></Screen>;
  return (
    <Screen edges={["top", "bottom"]} style={{ backgroundColor: themeBg }}>
      <Kav>
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: space[2], gap: space[1], borderBottomWidth: 1, borderBottomColor: c.border, paddingBottom: space[2] }}>
        <IconButton icon={ChevronLeft} label={t("common.back")} onPress={() => router.back()} />
        <Pressable accessibilityRole="button" accessibilityLabel={name} onPress={() => router.push({ pathname: "/chat/[id]/profile", params: { id } })} style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: space[2] }}>
          <Monogram name={name} px={36} tint={tint(prefs[conv.other.id]?.color as never)} unavailable={!conv.available} />
          <T v="title" numberOfLines={1} style={{ flexShrink: 1 }}>{name}</T>
          <Lock size={14} color={c.textMuted} accessibilityLabel={t("chats.encrypted")} />
        </Pressable>
        <IconButton icon={Palette} label={t("chat.theme")} onPress={() => setPicking(true)} />
        <IconButton icon={muted ? BellOff : Bell} label={muted ? t("chat.unmute") : t("chat.mute")} onPress={() => void setMute(id, muted ? null : new Date(Date.now() + 8 * 3600_000).toISOString()).catch(fail)} />
      </View>
      {keyChanged ? (
        <View style={{ padding: space[2] }}>
          <Banner icon={ShieldAlert} text={t("chat.keyChanged", { name })}>
            <IconButton icon={Eye} label={t("chat.verify")} onPress={() => router.push({ pathname: "/chat/[id]/profile", params: { id } })} />
            <IconButton icon={Check} label={t("common.confirm")} onPress={() => acceptKeyChange(conv.other.id)} />
          </Banner>
        </View>
      ) : null}
      <FlatList inverted data={data} keyExtractor={(m) => m.clientMessageId} onViewableItemsChanged={onViewable} viewabilityConfig={{ itemVisiblePercentThreshold: 60 }} contentContainerStyle={{ paddingVertical: space[2] }}
        renderItem={({ item }) => isThemeEvent(item) ? (
          <SystemNotice text={noticeText(item)} />
        ) : (
          <MessageBubble m={item} tint={tint(prefs[conv.other.id]?.color as never)} outColor={theme.out} reactions={reactions[item.id]} showReceipt={item.id === lastMineId} onLongPress={setMenu}
            onOpenMedia={(m) => router.push({ pathname: "/viewer", params: { convId: id, id: m.id } })}
            onRetry={(m) => Alert.alert(t("chat.failed"), undefined, [{ text: t("chat.retry"), onPress: () => void retrySend(id, m.id) }, { text: t("common.delete"), style: "destructive", onPress: () => discardFailed(id, m.id) }, { text: t("common.cancel"), style: "cancel" }])} />
        )} />
      {conv.archived || !conv.available ? (
        <View style={{ padding: space[3] }}><Banner icon={Lock} tone="neutral" text={t("chat.archived")} /></View>
      ) : (
        <Composer onSendText={(text, hidden) => sendText(id, text, hidden).catch((e) => fail(e instanceof Error && e.message === "tooLong" ? new Error(t("chat.tooLong")) : e))}
          onCamera={() => router.push({ pathname: "/camera", params: { convId: id } })} onGallery={() => void pickGallery()} />
      )}

      <Sheet visible={!!menu} onClose={() => setMenu(null)}>
        {menu && menu.status !== "pending" && menu.status !== "failed" && !menu.broken && !menu.forged ? (
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            {REACTION_EMOJIS.map((e) => (
              <Pressable key={e} accessibilityRole="button" accessibilityLabel={`${t("chat.react")} ${e}`} onPress={() => react(menu, e)} style={{ width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: reactions[menu.id]?.some((r) => r.mine && r.emoji === e) ? c.accentSoft : c.surfaceAlt }}>
                <T style={{ fontSize: 24, lineHeight: 30 }}>{e}</T>
              </Pressable>
            ))}
          </View>
        ) : null}
        <View style={{ flexDirection: "row", gap: space[4], justifyContent: "center" }}>
          {menu?.type === "text" && menu.payload && !menu.payload.hidden ? <IconButton icon={Copy} label={t("chat.copy")} filled onPress={async () => { await Clipboard.setStringAsync(menu.payload?.text ?? ""); setMenu(null); }} /> : null}
          {menu?.mine && menu.status !== "pending" ? <IconButton icon={Trash2} label={t("chat.deleteForAll")} color={c.danger} onPress={() => { const m = menu; setMenu(null); doDelete(m); }} /> : null}
          {menu && !menu.mine ? <IconButton icon={Flag} label={t("chat.report")} onPress={() => { setReporting(menu); setMenu(null); }} /> : null}
          <IconButton icon={X} label={t("common.close")} onPress={() => setMenu(null)} />
        </View>
      </Sheet>

      <Sheet visible={picking} onClose={() => setPicking(false)}>
        <T v="h2">{t("chat.theme")}</T>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[3] }}>
          {CHAT_THEMES.map((th) => (
            <Pressable key={th.key} accessibilityRole="radio" accessibilityLabel={t(`themes.${th.key}`)} accessibilityState={{ selected: th.key === theme.key }} onPress={() => pickTheme(th.key)}
              style={{ width: size.touchMin + 8, height: size.touchMin + 8, borderRadius: radius.full, backgroundColor: th.out || c.accent, alignItems: "center", justifyContent: "center", borderWidth: th.key === theme.key ? 3 : 1, borderColor: th.key === theme.key ? c.text : c.border }}>
              {th.key === theme.key ? <Check size={size.icon} color="#fff" /> : null}
            </Pressable>
          ))}
        </View>
      </Sheet>

      <Sheet visible={!!reporting} onClose={() => setReporting(null)}>
        <T v="h2">{t("report.title")}</T>
        <View style={{ flexDirection: "row", gap: space[3] }}>
          {REASONS.map(({ key, icon: Icon }) => (
            <Pressable key={key} accessibilityRole="radio" accessibilityLabel={t(`report.${key}`)} accessibilityState={{ selected: reason === key }} onPress={() => setReason(key)}
              style={{ width: 56, height: 56, borderRadius: radius.md, alignItems: "center", justifyContent: "center", backgroundColor: reason === key ? c.accent : c.surfaceAlt }}>
              <Icon size={size.icon} color={reason === key ? c.onAccent : c.text} />
            </Pressable>
          ))}
        </View>
        <T muted>{t("report.consent")}</T>
        <Button icon={understood ? Check : undefined} variant={understood ? "primary" : "secondary"} title={t("report.understood")} onPress={() => (understood ? void submitReport() : setUnderstood(true))} />
      </Sheet>
      </Kav>
    </Screen>
  );
}
