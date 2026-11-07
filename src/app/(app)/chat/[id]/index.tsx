/** Beszélgetés: üzenetlista (fordított), rejtett/zárt média, olvasás-jelzés, üzenet-menü, jelentés, szerkesztő. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Modal, Pressable, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import Animated, { FadeIn, SlideInDown } from "react-native-reanimated";
import * as Clipboard from "expo-clipboard";
import * as ImagePicker from "expo-image-picker";
import { Ban, BellOff, Bell, Check, ChevronLeft, Copy, Eye, Flag, Lock, MoreHorizontal, Palette, Pencil, Timer, Reply, RotateCw, ShieldAlert, Trash2, Mail, X } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Banner, Button, IconButton, Kav, Monogram, Screen, T } from "@/components/ui";
import { MessageBubble, SystemNotice } from "@/components/Bubble";
import { activityText, dayLabel, differentDay } from "@/lib/time";
import { Composer } from "@/components/Composer";
import { acceptKeyChange, chat, setActiveConv, deleteForAll, discardFailed, displayName, isMuted, loadPrefs, markRead, reportMessage, replyRefFor, retrySend, sendEdit, sendEvent, sendMedia, sendText, setMute, type Msg } from "@/state/chat";
import { session } from "@/state/session";
import { useStore } from "@/lib/store";
import { MAX_VIDEO_DURATION_MS, type REPORT_REASONS } from "@/protocol/constants";
import { radius, size, space, useTheme } from "@/theme";
import { CHAT_THEMES, themeByKey } from "@/theme/chatThemes";
import { currentTheme, currentTtl, isNotice, isVisible, openedSet, reactionMap, REACTION_EMOJIS, withEdits } from "@/lib/events";
import { uuidv4 } from "@/crypto/keys";
import { toast } from "@/state/toast";
import { confirmDialog, showDialog } from "@/state/dialog";

const EMPTY: Msg[] = [];
/** Szerkeszthető-e még: saját, elküldött szöveg, 15 percen belül. */
const canEdit = (m: Msg) => m.mine && m.type === "text" && m.status === "sent" && Date.now() - m.createdAt < 15 * 60_000;
const TTL_OPTIONS: { ms: number | null; key: string }[] = [{ ms: null, key: "ttlOff" }, { ms: 3600_000, key: "ttlHour" }, { ms: 86_400_000, key: "ttlDay" }, { ms: 7 * 86_400_000, key: "ttlWeek" }];
const ttlKey = (ms: number | null | undefined) => (ms == null ? "ttlOff" : ms <= 3600_000 ? "ttlHour" : ms <= 86_400_000 ? "ttlDay" : "ttlWeek");
type Reason = (typeof REPORT_REASONS)[number];
const REASONS: { key: Reason; icon: typeof Ban }[] = [{ key: "harassment", icon: Ban }, { key: "spam", icon: Mail }, { key: "illegal", icon: ShieldAlert }, { key: "other", icon: MoreHorizontal }];

function Sheet({ visible, onClose, children }: { visible: boolean; onClose: () => void; children: React.ReactNode }) {
  const { c } = useTheme();
  return (
    // A háttér csak elhalványul, a lap külön csúszik be (a Modal saját „slide” animációja a hátteret is mozgatná).
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose}>
      <Animated.View entering={FadeIn.duration(180)} style={{ flex: 1, backgroundColor: c.overlay }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="close" />
      </Animated.View>
      <Animated.View entering={SlideInDown.duration(220)} style={{ position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: c.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: space[5], gap: space[4], paddingBottom: space[8] }}>{children}</Animated.View>
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
  const raw = stored ?? EMPTY;
  const list = useMemo(() => withEdits(raw), [raw]); // a szerkesztések ráégetve
  const keyChanged = useStore(chat, (s) => (conv ? s.keyChanged[conv.other.id] : false));
  const [menu, setMenu] = useState<Msg | null>(null);
  const [reporting, setReporting] = useState<Msg | null>(null);
  const [reason, setReason] = useState<Reason>("harassment");
  const [understood, setUnderstood] = useState(false);
  const [picking, setPicking] = useState(false);
  const [reactPick, setReactPick] = useState<Msg | null>(null);
  const [replyTo, setReplyTo] = useState<Msg | null>(null);
  const [editing, setEditing] = useState<Msg | null>(null);
  const [once, setOnce] = useState(false);
  const [ttlPick, setTtlPick] = useState(false);
  const listRef = useRef<FlatList<Msg>>(null);
  const [infoId, setInfoId] = useState<string | null>(null);
  const act = useStore(chat, (s) => (conv ? s.activity[conv.other.id] : undefined));

  useEffect(() => { if (conv) void loadPrefs(conv.other.id); }, [conv]);
  // Megnyitott chatben az előtérben érkező üzenet nem kelt értesítést.
  useEffect(() => { setActiveConv(id ?? null); return () => setActiveConv(null); }, [id]);
  const data = useMemo(() => list.filter(isVisible).reverse(), [list]);
  const reactions = useMemo(() => reactionMap(list), [list]);
  const theme = themeByKey(currentTheme(list));
  const ttl = useMemo(() => currentTtl(list), [list]);
  const openedIds = useMemo(() => openedSet(list), [list]);
  // Több képes küldés: az azonos (küldő, csoport) üzenetek időrendben; a legújabb a „vezető”, az jeleníti meg a rácsot.
  const groups = useMemo(() => {
    const g = new Map<string, Msg[]>();
    for (const m of [...data].reverse()) {
      const k = m.payload?.group;
      if (k && (m.type === "image" || m.type === "video") && !m.broken && !m.forged) g.set(`${m.senderId}:${k}`, [...(g.get(`${m.senderId}:${k}`) ?? []), m]);
    }
    return g;
  }, [data]);
  const membersOf = (m: Msg) => (m.payload?.group ? groups.get(`${m.senderId}:${m.payload.group}`) : undefined);
  const themeBg = (dark ? theme.bgDark : theme.bgLight) || c.bg;
  // Reakció-ikon csak a beszélgetés utolsó üzenete mellett, és csak kapott üzenetnél.
  const lastMsgId = useMemo(() => list.filter((m) => m.type !== "event").at(-1)?.id, [list]);
  const lastMineId = useMemo(() => list.filter((m) => m.mine && m.type !== "event").at(-1)?.id, [list]);
  const name = conv ? (conv.available ? displayName(conv, prefs) : t("chats.unavailable")) : "";
  const muted = conv ? isMuted(conv) : false;
  const fail = toast.fail;

  // Normál (nem rejtett) bejövő szöveg: a képernyőre kerüléskor olvasottá válik. Rejtett/média: felfedéskor/megnyitáskor.
  const onViewable = useCallback(({ viewableItems }: { viewableItems: { item: Msg }[] }) => {
    for (const { item } of viewableItems) if (!item.mine && item.type === "text" && !item.payload?.hidden && !item.broken && !item.forged) void markRead(item);
  }, []);

  const pickGallery = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images", "videos"], quality: 0.8, videoMaxDuration: 60, allowsMultipleSelection: true, selectionLimit: 10 });
    if (r.canceled || !r.assets?.length) return;
    const group = r.assets.length > 1 ? uuidv4() : undefined; // több elem: rácsként jelenik meg
    const useOnce = once;
    setOnce(false);
    for (const a of r.assets) {
      const isVideo = a.type === "video";
      if (isVideo && (a.duration ?? 0) > MAX_VIDEO_DURATION_MS) { toast.error(t("chat.videoLimit")); continue; }
      await sendMedia(id, a.uri, isVideo ? "video" : "image", { mime: a.mimeType ?? (isVideo ? "video/mp4" : "image/jpeg"), width: a.width, height: a.height, durationMs: a.duration ?? undefined }, false, { group, once: useOnce }).catch(fail);
    }
  };

  const noticeText = (m: Msg) => {
    const ev = m.payload?.event;
    if (ev?.kind === "ttl") {
      const time = t(`chat.${ttlKey(ev.ms)}`);
      return m.mine ? t("chat.youTtlSet", { time }) : t("chat.ttlSet", { name, time });
    }
    const themeName = t(`themes.${ev?.kind === "theme" ? ev.theme : "default"}`);
    return m.mine ? t("chat.youThemeChanged", { theme: themeName }) : t("chat.themeChanged", { name, theme: themeName });
  };
  const meId = session.get().me?.id;
  const nameOf = (senderId: string) => (senderId === meId ? t("chat.you") : name);
  const startReply = useCallback((m: Msg) => { if (replyRefFor(m)) setReplyTo(m); }, []);
  const scrollToMsg = (mid: string) => {
    const i = data.findIndex((x) => x.id === mid);
    if (i >= 0) listRef.current?.scrollToIndex({ index: i, animated: true, viewPosition: 0.5 });
  };
  const react = (m: Msg, emoji: string) => {
    const mine = reactions[m.id]?.find((r) => r.mine)?.emoji;
    setMenu(null);
    setReactPick(null);
    sendEvent(id, { kind: "reaction", target: m.id, emoji: mine === emoji ? null : emoji }).catch(() => toast.error(t("chat.reactionFailed")));
  };
  const pickTtl = (ms: number | null) => {
    setTtlPick(false);
    if (ms !== ttl) sendEvent(id, { kind: "ttl", ms }).catch((e) => fail(e));
  };
  const pickTheme = (key: string) => {
    setPicking(false);
    if (key !== theme.key) sendEvent(id, { kind: "theme", theme: key }).catch((e) => fail(e));
  };

  const doDelete = (m: Msg) => confirmDialog({ title: t("chat.deleteForAll"), message: t("chat.deleteConfirm"), icon: Trash2, confirmLabel: t("common.delete"), destructive: true, onConfirm: () => void deleteForAll(m).catch(fail) });

  const submitReport = async () => {
    if (!reporting) return;
    try {
      await reportMessage(reporting, reason, true);
      setReporting(null);
      setUnderstood(false);
      toast.success(t("report.sent"));
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
          <View style={{ flexShrink: 1 }}>
            <T v="title" numberOfLines={1}>{name}</T>
            {activityText(act) ? <T v="caption" color={act?.online ? c.success : c.textMuted}>{activityText(act)}</T> : null}
          </View>
          <Lock size={14} color={c.textMuted} accessibilityLabel={t("chats.encrypted")} />
        </Pressable>
        <IconButton icon={Timer} label={t("chat.ttl")} color={ttl ? c.accent : undefined} onPress={() => setTtlPick(true)} />
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
      <FlatList ref={listRef} inverted data={data} extraData={infoId} onScrollToIndexFailed={() => undefined} keyExtractor={(m) => m.clientMessageId} onViewableItemsChanged={onViewable} viewabilityConfig={{ itemVisiblePercentThreshold: 60 }} contentContainerStyle={{ paddingVertical: space[2] }}
        renderItem={({ item, index }) => {
          const sep = index === data.length - 1 || differentDay(item.createdAt, data[index + 1].createdAt) ? <View style={{ alignItems: "center", paddingVertical: space[2] }}><T v="caption" muted>{dayLabel(item.createdAt)}</T></View> : null;
          const members = membersOf(item);
          // Rácsban csak a legújabb elem jelenik meg (az viszi a többit is); a többi üres, de a napválasztót megtartja.
          if (members && members.length > 1 && members[members.length - 1].id !== item.id) return sep;
          return (
            <>
              {sep}
              {isNotice(item) ? <SystemNotice text={noticeText(item)} /> : (
                <MessageBubble m={item} group={members && members.length > 1 ? members : undefined} openedIds={openedIds} tint={tint(prefs[conv.other.id]?.color as never)} outColor={theme.out} reactions={reactions[item.id]} showReactButton={!item.mine && item.id === lastMsgId} replyName={item.payload?.reply ? nameOf(item.payload.reply.senderId) : undefined} onReactPress={setReactPick} onReply={startReply} onQuotePress={scrollToMsg} showReceipt={item.id === lastMineId} onLongPress={setMenu}
                  onOpenMedia={(m) => router.push({ pathname: "/viewer", params: { convId: id, id: m.id, ...(members && members.length > 1 ? { ids: members.map((x) => x.id).join(",") } : {}) } })}
                  infoOpen={infoId === item.id} onTap={(m) => setInfoId((x) => (x === m.id ? null : m.id))} onRetry={(m) => showDialog({ title: t("chat.failed"), icon: RotateCw, actions: [{ label: t("common.cancel"), style: "cancel" }, { label: t("common.delete"), style: "destructive", onPress: () => discardFailed(id, m.id) }, { label: t("chat.retry"), onPress: () => void retrySend(id, m.id) }] })} />
              )}
            </>
          );
        }} />
      {conv.archived || !conv.available ? (
        <View style={{ padding: space[3] }}><Banner icon={Lock} tone="neutral" text={t("chat.archived")} /></View>
      ) : (
        <Composer key={editing?.id ?? "c"} editing={editing ? { text: editing.payload?.text ?? "" } : null} onCancelEdit={() => setEditing(null)} onSubmitEdit={(text) => { const e = editing; setEditing(null); if (e) sendEdit(id, e.id, text).catch(fail); }} once={once} onToggleOnce={() => setOnce((v) => !v)} onSendVoice={(uri, ms) => sendMedia(id, uri, "audio", { mime: "audio/mp4", durationMs: ms }, false).catch(fail)} reply={replyTo ? replyRefFor(replyTo) : null} replyName={replyTo ? nameOf(replyTo.senderId) : undefined} onCancelReply={() => setReplyTo(null)} onSendText={(text, hidden) => { const rp = replyTo ? replyRefFor(replyTo) : null; setReplyTo(null); return sendText(id, text, hidden, rp).catch((e) => e instanceof Error && e.message === "tooLong" ? toast.error(t("chat.tooLong")) : fail(e)); }}
          onCamera={() => router.push({ pathname: "/camera", params: { convId: id, once: once ? "1" : "0" } })} onGallery={() => void pickGallery()} />
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
          {menu && replyRefFor(menu) ? <IconButton icon={Reply} label={t("chat.reply")} onPress={() => { startReply(menu); setMenu(null); }} /> : null}
          {menu?.type === "text" && menu.payload && !menu.payload.hidden ? <IconButton icon={Copy} label={t("chat.copy")} filled onPress={async () => { await Clipboard.setStringAsync(menu.payload?.text ?? ""); setMenu(null); }} /> : null}
          {menu && canEdit(menu) ? <IconButton icon={Pencil} label={t("chat.edit")} onPress={() => { setEditing(menu); setMenu(null); }} /> : null}
          {menu?.mine && menu.status !== "pending" ? <IconButton icon={Trash2} label={t("chat.deleteForAll")} color={c.danger} onPress={() => { const m = menu; setMenu(null); doDelete(m); }} /> : null}
          {menu && !menu.mine ? <IconButton icon={Flag} label={t("chat.report")} onPress={() => { setReporting(menu); setMenu(null); }} /> : null}
          <IconButton icon={X} label={t("common.close")} onPress={() => setMenu(null)} />
        </View>
      </Sheet>

      <Sheet visible={!!reactPick} onClose={() => setReactPick(null)}>
        {reactPick ? (
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            {REACTION_EMOJIS.map((e) => (
              <Pressable key={e} accessibilityRole="button" accessibilityLabel={`${t("chat.react")} ${e}`} onPress={() => react(reactPick, e)} style={{ width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: reactions[reactPick.id]?.some((r) => r.mine && r.emoji === e) ? c.accentSoft : c.surfaceAlt }}>
                <T style={{ fontSize: 24, lineHeight: 30 }}>{e}</T>
              </Pressable>
            ))}
          </View>
        ) : null}
      </Sheet>

      <Sheet visible={ttlPick} onClose={() => setTtlPick(false)}>
        <T v="h2">{t("chat.ttl")}</T>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[3] }}>
          {TTL_OPTIONS.map((o) => (
            <Pressable key={o.key} accessibilityRole="radio" accessibilityLabel={t(`chat.${o.key}`)} accessibilityState={{ selected: (o.ms ?? null) === (ttl ?? null) }} onPress={() => pickTtl(o.ms)}
              style={{ paddingHorizontal: space[4], height: size.touchMin, borderRadius: radius.full, alignItems: "center", justifyContent: "center", backgroundColor: (o.ms ?? null) === (ttl ?? null) ? c.accent : c.surfaceAlt }}>
              <T color={(o.ms ?? null) === (ttl ?? null) ? c.onAccent : c.text}>{t(`chat.${o.key}`)}</T>
            </Pressable>
          ))}
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
