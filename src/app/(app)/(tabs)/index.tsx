/** Chatek listája: egy soros előnézet (média = ikon, rejtett = EyeOff, lezárt = lakat), némítás-jel, olvasatlan-jelvény. */
import { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, RefreshControl, View } from "react-native";
import { router } from "expo-router";
import { BellOff, EyeOff, Image as ImageIcon, Lock, MessageCircle, ServerOff, SquarePen, Video, WifiOff } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Banner, EmptyState, IconButton, ListItem, Monogram, Screen, SkeletonRows, T } from "@/components/ui";
import { chat, displayName, isMuted, loadPrefs, pollOnce, refreshActivity, refreshLists, type Conv, type Msg } from "@/state/chat";
import { useStore } from "@/lib/store";
import { clock } from "@/lib/time";
import { size, space, useTheme } from "@/theme";

function Preview({ m, bold }: { m: Msg | undefined; bold?: boolean }) {
  const { c } = useTheme();
  const { t } = useTranslation();
  if (!m) return null;
  if (m.broken || m.forged) return <Lock size={14} color={c.textMuted} />;
  if (m.type === "image") return <ImageIcon size={14} color={c.textMuted} />;
  if (m.type === "video") return <Video size={14} color={c.textMuted} />;
  if (m.payload?.hidden && !m.mine) return <EyeOff size={14} color={c.textMuted} />;
  return <T v="bodySm" muted={!bold} numberOfLines={1} style={bold ? { fontWeight: "700" } : undefined}>{m.mine ? `${t("chat.you")}: ` : ""}{m.payload?.text}</T>;
}

function Row({ conv }: { conv: Conv }) {
  const { c, tint } = useTheme();
  const { t } = useTranslation();
  const prefs = useStore(chat, (s) => s.prefs);
  const list = useStore(chat, (s) => s.messages[conv.id]);
  const readIds = useStore(chat, (s) => s.readIds);
  useEffect(() => { void loadPrefs(conv.other.id); }, [conv.other.id]);
  const last = list?.findLast((m) => m.type !== "event");
  const unread = (list ?? []).filter((m) => !m.mine && m.type !== "event" && !readIds[m.id]).length;
  const name = conv.available ? displayName(conv, prefs) : t("chats.unavailable");
  const muted = isMuted(conv);
  const online = useStore(chat, (s) => !!s.activity[conv.other.id]?.online);
  return (
    <ListItem label={name} onPress={() => router.push({ pathname: "/chat/[id]", params: { id: conv.id } })}
      left={<Monogram name={name} tint={tint(prefs[conv.other.id]?.color as never)} unavailable={!conv.available} online={online} />}
      title={<View style={{ gap: 2 }}><T v="title" numberOfLines={1} style={unread > 0 ? { fontWeight: "800" } : undefined}>{name}</T><View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}><Preview m={last} bold={unread > 0} /></View></View>}
      right={<View style={{ alignItems: "flex-end", gap: 4 }}>{last ? <T v="caption" muted>{clock(last.createdAt)}</T> : null}{muted ? <BellOff size={14} color={c.textMuted} /> : null}{unread > 0 ? <View style={{ minWidth: 22, height: 22, borderRadius: 11, backgroundColor: c.accent, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 }}><T v="caption" color={c.onAccent}>{unread}</T></View> : null}</View>} />
  );
}

/** Fent lévő ismerősök sávja (Messenger-szerű): kerek monogram zöld ponttal, koppintásra megnyílik a chat. */
function ActiveStrip() {
  const { t } = useTranslation();
  const { tint } = useTheme();
  const convs = useStore(chat, (s) => s.conversations);
  const activity = useStore(chat, (s) => s.activity);
  const prefs = useStore(chat, (s) => s.prefs);
  const online = convs.filter((c) => c.available && !c.archived && activity[c.other.id]?.online);
  if (!online.length) return null;
  return (
    <View accessibilityLabel={t("activity.strip")}>
      <FlatList horizontal data={online} keyExtractor={(c) => c.id} showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: space[4], paddingVertical: space[2], gap: space[4] }}
        renderItem={({ item }) => {
          const name = displayName(item, prefs);
          return (
            <Pressable accessibilityRole="button" accessibilityLabel={name} onPress={() => router.push({ pathname: "/chat/[id]", params: { id: item.id } })} style={{ alignItems: "center", gap: 4, width: 60 }}>
              <Monogram name={name} px={56} tint={tint(prefs[item.other.id]?.color as never)} online />
              <T v="caption" numberOfLines={1}>{name}</T>
            </Pressable>
          );
        }} />
    </View>
  );
}

export default function Chats() {
  const { t } = useTranslation();
  const convs = useStore(chat, (s) => s.conversations);
  const online = useStore(chat, (s) => s.online);
  const ready = useStore(chat, (s) => s.ready);
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await Promise.all([refreshLists(), pollOnce(), refreshActivity()]); } finally { setRefreshing(false); }
  }, []);
  const messages = useStore(chat, (s) => s.messages);
  const ts = (c: Conv) => messages[c.id]?.findLast((m) => m.type !== "event")?.createdAt ?? 0;
  const sorted = [...convs].sort((a, b) => ts(b) - ts(a));
  return (
    <Screen edges={["top"]}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: space[4], paddingTop: space[2] }}>
        <T v="h1">Sotto</T>
        <IconButton icon={SquarePen} label={t("chats.newChat")} onPress={() => router.push("/add-friend")} />
      </View>
      {!online ? <View style={{ padding: space[3] }}><Banner icon={WifiOff} tone="neutral" text={t("common.offline")}><ServerOff size={size.iconSm} color="#888" /></Banner></View> : null}
      {!ready ? <SkeletonRows /> : (
        <FlatList data={sorted} keyExtractor={(c) => c.id} ListHeaderComponent={<ActiveStrip />} renderItem={({ item }) => <Row conv={item} />} ListEmptyComponent={<EmptyState icon={MessageCircle} text={t("chats.empty")} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} />} />
      )}
    </Screen>
  );
}
