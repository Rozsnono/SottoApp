/**
 * Chatek listája (Messenger-szerű): nagy cím + saját monogram, kereső, ismerősök sávja (zöld pont = fent van),
 * soronként nagy monogram, név, előnézet + idő egy sorban, olvasatlan = félkövér + accent pont, saját utolsó üzenetnél pipa.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, TextInput, View } from "react-native";
import { router } from "expo-router";
import { BellOff, Check, Trash2, CheckCheck, EyeOff, Image as ImageIcon, Lock, Mic, MessageCircle, Search, ServerOff, SquarePen, Video, WifiOff, X } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Banner, EmptyState, IconButton, ListItem, Monogram, Screen, SkeletonRows, T } from "@/components/ui";
import { chat, clearConversation, displayName, isMuted, loadPrefs, pollOnce, refreshActivity, refreshLists, type Conv, type Msg } from "@/state/chat";
import { session } from "@/state/session";
import { confirmDialog } from "@/state/dialog";
import ReanimatedSwipeable from "react-native-gesture-handler/ReanimatedSwipeable";
import { useStore } from "@/lib/store";
import { clock } from "@/lib/time";
import { withEdits } from "@/lib/events";
import { radius, size, space, useTheme } from "@/theme";

/** Előnézet: szöveg (saját üzenetnél „Te: ”), média/rejtett/lezárt = ikon. Olvasatlanul félkövér. */
function Preview({ m, bold }: { m: Msg | undefined; bold?: boolean }) {
  const { c } = useTheme();
  const { t } = useTranslation();
  if (!m) return null;
  if (m.broken || m.forged) return <Lock size={14} color={c.textMuted} />;
  if (m.type === "image") return <ImageIcon size={14} color={c.textMuted} />;
  if (m.type === "video") return <Video size={14} color={c.textMuted} />;
  if (m.type === "audio") return <Mic size={14} color={c.textMuted} />;
  if (m.payload?.hidden && !m.mine) return <EyeOff size={14} color={c.textMuted} />;
  return <T v="bodySm" muted={!bold} numberOfLines={1} style={[{ flexShrink: 1 }, bold ? { fontWeight: "700", color: c.text } : null]}>{m.mine ? `${t("chat.you")}: ` : ""}{m.payload?.text}</T>;
}

function Row({ conv }: { conv: Conv }) {
  const { c, tint } = useTheme();
  const { t } = useTranslation();
  const prefs = useStore(chat, (s) => s.prefs);
  const list = useStore(chat, (s) => s.messages[conv.id]);
  const readIds = useStore(chat, (s) => s.readIds);
  const online = useStore(chat, (s) => !!s.activity[conv.other.id]?.online);
  useEffect(() => { void loadPrefs(conv.other.id); }, [conv.other.id]);
  const last = useMemo(() => withEdits(list ?? []).findLast((m) => m.type !== "event"), [list]);
  const unread = (list ?? []).filter((m) => !m.mine && m.type !== "event" && !readIds[m.id]).length;
  const name = conv.available ? displayName(conv, prefs) : t("chats.unavailable");
  const muted = isMuted(conv);
  const askDelete = (close: () => void) => {
    close();
    confirmDialog({ title: t("chats.deleteTitle"), message: t("chats.deleteConfirm"), icon: Trash2, destructive: true, confirmLabel: t("common.delete"), onConfirm: () => clearConversation(conv.id) });
  };
  // Jobbra húzásra a bal oldalon megjelenik a törlés ikon; megerősítés után törlődik.
  return (
    <ReanimatedSwipeable overshootLeft={false} renderLeftActions={(_p, _t, m) => (
      <Pressable accessibilityRole="button" accessibilityLabel={t("common.delete")} onPress={() => askDelete(() => m.close())} style={{ width: 84, backgroundColor: c.danger, alignItems: "center", justifyContent: "center" }}>
        <Trash2 size={size.icon} color="#fff" />
      </Pressable>
    )}>
    <View style={{ backgroundColor: c.bg }}>
    <ListItem label={name} onPress={() => router.push({ pathname: "/chat/[id]", params: { id: conv.id } })}
      left={<Monogram name={name} px={56} tint={tint(prefs[conv.other.id]?.color as never)} unavailable={!conv.available} online={online} />}
      title={
        <View style={{ gap: 2 }}>
          <T v="title" numberOfLines={1} style={unread > 0 ? { fontWeight: "800" } : undefined}>{name}</T>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Preview m={last} bold={unread > 0} />
            {last ? <T v="bodySm" muted style={{ flexShrink: 0 }}>· {clock(last.createdAt)}</T> : null}
          </View>
        </View>
      }
      right={
        <View style={{ alignItems: "center", gap: 6 }}>
          {muted ? <BellOff size={14} color={c.textMuted} /> : null}
          {unread > 0 ? <View accessibilityLabel={String(unread)} style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: c.accent }} />
            : last?.mine ? (last.status === "read" ? <CheckCheck size={16} color={c.accent} /> : last.status === "sent" ? <Check size={16} color={c.textMuted} /> : null) : null}
        </View>
      } />
    </View>
    </ReanimatedSwipeable>
  );
}

/** Ismerősök sávja: aki fent van, elöl, zöld ponttal; koppintásra megnyílik a chat. */
function Strip({ convs }: { convs: Conv[] }) {
  const { t } = useTranslation();
  const { tint } = useTheme();
  const activity = useStore(chat, (s) => s.activity);
  const prefs = useStore(chat, (s) => s.prefs);
  const items = convs.filter((c) => c.available && !c.archived).sort((a, b) => Number(!!activity[b.other.id]?.online) - Number(!!activity[a.other.id]?.online));
  if (!items.length) return null;
  return (
    <View accessibilityLabel={t("activity.strip")}>
      <FlatList horizontal data={items} keyExtractor={(c) => c.id} showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: space[4], paddingVertical: space[2], gap: space[4] }}
        renderItem={({ item }) => {
          const name = displayName(item, prefs);
          return (
            <Pressable accessibilityRole="button" accessibilityLabel={name} onPress={() => router.push({ pathname: "/chat/[id]", params: { id: item.id } })} style={{ alignItems: "center", gap: 4, width: 64 }}>
              <Monogram name={name} px={60} tint={tint(prefs[item.other.id]?.color as never)} online={!!activity[item.other.id]?.online} />
              <T v="caption" numberOfLines={1}>{name}</T>
            </Pressable>
          );
        }} />
    </View>
  );
}

export default function Chats() {
  const { t } = useTranslation();
  const { c } = useTheme();
  const me = useStore(session, (s) => s.me);
  const convs = useStore(chat, (s) => s.conversations);
  const online = useStore(chat, (s) => s.online);
  const ready = useStore(chat, (s) => s.ready);
  const messages = useStore(chat, (s) => s.messages);
  const prefs = useStore(chat, (s) => s.prefs);
  const cleared = useStore(chat, (s) => s.cleared);
  const [refreshing, setRefreshing] = useState(false);
  const [q, setQ] = useState("");
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await Promise.all([refreshLists(), pollOnce(), refreshActivity()]); } finally { setRefreshing(false); }
  }, []);
  const sorted = useMemo(() => {
    const ts = (cv: Conv) => messages[cv.id]?.findLast((m) => m.type !== "event")?.createdAt ?? 0;
    const needle = q.trim().toLowerCase();
    return [...convs].filter((cv) => !(cleared[cv.id] !== undefined && !messages[cv.id]?.length)).filter((cv) => !needle || displayName(cv, prefs).toLowerCase().includes(needle)).sort((a, b) => ts(b) - ts(a));
  }, [convs, messages, prefs, q, cleared]);
  return (
    <Screen edges={["top"]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space[3], paddingHorizontal: space[4], paddingTop: space[2] }}>
        <Monogram name={me?.username ?? "?"} px={40} />
        <T v="h1" style={{ flex: 1 }}>{t("chats.title")}</T>
        <View style={{ borderRadius: radius.full, backgroundColor: c.surfaceAlt }}><IconButton icon={SquarePen} label={t("chats.newChat")} onPress={() => router.push("/add-friend")} /></View>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space[2], marginHorizontal: space[4], marginVertical: space[3], paddingHorizontal: space[3], height: 44, borderRadius: radius.full, backgroundColor: c.surfaceAlt }}>
        <Search size={size.iconSm} color={c.textMuted} />
        <TextInput value={q} onChangeText={setQ} placeholder={t("chats.search")} placeholderTextColor={c.textMuted} accessibilityLabel={t("chats.search")} autoCapitalize="none" autoCorrect={false} style={{ flex: 1, color: c.text, fontSize: 16 }} />
        {q ? <Pressable accessibilityRole="button" accessibilityLabel={t("common.close")} hitSlop={10} onPress={() => setQ("")}><X size={size.iconSm} color={c.textMuted} /></Pressable> : null}
      </View>
      {!online ? <View style={{ padding: space[3] }}><Banner icon={WifiOff} tone="neutral" text={t("common.offline")}><ServerOff size={size.iconSm} color="#888" /></Banner></View> : null}
      {!ready ? <SkeletonRows /> : (
        <FlatList data={sorted} keyExtractor={(cv) => cv.id} keyboardShouldPersistTaps="handled" ListHeaderComponent={q ? undefined : <Strip convs={convs} />}
          renderItem={({ item }) => <Row conv={item} />} ListEmptyComponent={<EmptyState icon={MessageCircle} text={t("chats.empty")} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} />} />
      )}
    </Screen>
  );
}
