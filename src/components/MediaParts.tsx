/**
 * Média-elemek a buborékokhoz: egyszeri megtekintés jelvény, kis csempe, több képes rács (Messenger-szerű) és hangüzenet.
 * A média itt is zárt: nincs előnézet, a tartalom csak megnyitáskor (visszafejtve) látszik.
 */
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } from "expo-audio";
import { EyeOff, Image as ImageIcon, Pause, Play, Video } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { T } from "@/components/ui";
import { chat, markRead, type Msg } from "@/state/chat";
import { downloadAndDecrypt, releaseTemp } from "@/services/media";
import { useStore } from "@/lib/store";
import { toast } from "@/state/toast";
import { radius, size, space, useTheme } from "@/theme";

const fmt = (ms?: number) => (ms ? `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}` : "0:00");

/** Az egyszeri média „elfogyott”-e: kapottnál ha már megnyitottuk, küldöttnél ha a másik fél megnyitotta. */
export function useSpent(m: Msg, openedIds?: Set<string>): boolean {
  const consumed = useStore(chat, (s) => !!s.consumed[m.id]);
  return !!m.payload?.once && (m.mine ? !!openedIds?.has(m.id) : consumed);
}

export function OnceBadge({ color, bg }: { color: string; bg: string }) {
  return (
    <View accessibilityLabel="1" style={{ position: "absolute", top: 8, left: 8, width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: color, backgroundColor: bg, alignItems: "center", justifyContent: "center" }}>
      <T v="caption" color={color} style={{ fontSize: 11, lineHeight: 14, fontWeight: "700" }}>1</T>
    </View>
  );
}

/** Kis négyzetes csempe a rácshoz (típusikon, feltöltés %, egyszeri jelvény, +N). */
export function MiniTile({ m, px, outColor, openedIds, onOpen, onLongPress, more }: { m: Msg; px: number; outColor: string; openedIds?: Set<string>; onOpen: (m: Msg) => void; onLongPress: (m: Msg) => void; more?: number }) {
  const { c } = useTheme();
  const { t } = useTranslation();
  const spent = useSpent(m, openedIds);
  const fg = m.mine ? c.onBubbleOut : c.text;
  const Icon = spent ? EyeOff : m.type === "video" ? Video : ImageIcon;
  const once = !!m.payload?.once;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={t("chat.openMedia")} disabled={spent || (once && m.mine)} onPress={() => onOpen(m)} onLongPress={() => onLongPress(m)} delayLongPress={350}
      style={{ width: px, height: px, borderRadius: radius.md, backgroundColor: m.mine ? outColor : c.surfaceAlt, alignItems: "center", justifyContent: "center", opacity: spent ? 0.5 : 1 }}>
      <Icon size={size.iconLg} color={fg} />
      {once ? <OnceBadge color={fg} bg="transparent" /> : null}
      {m.status === "pending" && m.progress !== undefined ? <T v="caption" color={fg} style={{ position: "absolute", bottom: 6 }}>{Math.round(m.progress * 100)}%</T> : null}
      {more ? <View style={{ position: "absolute", inset: 0, borderRadius: radius.md, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center" }}><T v="title" color="#fff">+{more}</T></View> : null}
    </Pressable>
  );
}

/** Egymást követő, azonos csoportú képek rácsa: legfeljebb 4 csempe (2×2), az utolsón „+N”. */
export function MediaGrid({ items, outColor, openedIds, onOpen, onLongPress }: { items: Msg[]; outColor: string; openedIds?: Set<string>; onOpen: (m: Msg) => void; onLongPress: (m: Msg) => void }) {
  const shown = items.slice(0, 4);
  const extra = items.length - shown.length;
  const px = 86;
  return (
    <View style={{ width: px * 2 + 4, flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
      {shown.map((m, i) => <MiniTile key={m.id} m={m} px={px} outColor={outColor} openedIds={openedIds} onOpen={onOpen} onLongPress={onLongPress} more={i === shown.length - 1 && extra > 0 ? extra + 1 : undefined} />)}
    </View>
  );
}

let audioModeSet = false;

/** Hangüzenet: lejátszás koppintásra (letöltés + visszafejtés ideiglenes fájlba, kilépéskor törlés), folyamatjelző. */
export function AudioTile({ m, outColor, onLongPress }: { m: Msg; outColor: string; onLongPress: (m: Msg) => void }) {
  const { c } = useTheme();
  const { t } = useTranslation();
  const [uri, setUri] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const player = useAudioPlayer(uri ? { uri } : null);
  const st = useAudioPlayerStatus(player);
  const fg = m.mine ? c.onBubbleOut : c.text;
  const total = (st.duration || (m.payload?.media?.durationMs ?? 0) / 1000) || 0;
  const frac = total ? Math.min(1, st.currentTime / total) : 0;

  useEffect(() => () => releaseTemp(uri), [uri]);
  // Letöltés után automatikusan indul a lejátszás.
  useEffect(() => { if (uri) { player.play(); } }, [uri, player]);

  const toggle = async () => {
    if (st.playing) return player.pause();
    if (uri) {
      if (st.didJustFinish || (total && st.currentTime >= total - 0.05)) await player.seekTo(0);
      return player.play();
    }
    const media = m.payload?.media;
    if (!m.mediaRef || !media?.key) return;
    setBusy(true);
    try {
      if (!audioModeSet) { await setAudioModeAsync({ playsInSilentMode: true }); audioModeSet = true; }
      setUri(await downloadAndDecrypt(m.mediaRef, media));
      void markRead(m);
    } catch (e) {
      console.warn("[audio] betöltés sikertelen", e instanceof Error ? e.message : e);
      toast.error(t("chat.mediaError"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Pressable accessibilityRole="button" accessibilityLabel={st.playing ? t("chat.pause") : t("chat.play")} onPress={() => void toggle()} onLongPress={() => onLongPress(m)} delayLongPress={350}
      style={{ width: 220, flexDirection: "row", alignItems: "center", gap: space[3], paddingHorizontal: space[3], paddingVertical: space[2], borderRadius: radius.bubble, backgroundColor: m.mine ? outColor : c.surfaceAlt }}>
      {busy ? <ActivityIndicator color={fg} /> : st.playing ? <Pause size={size.icon} color={fg} /> : <Play size={size.icon} color={fg} />}
      <View style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: fg + "33" }}><View style={{ width: `${frac * 100}%`, height: 4, borderRadius: 2, backgroundColor: fg }} /></View>
      <T v="caption" color={fg}>{fmt(st.playing || frac > 0 ? st.currentTime * 1000 : m.payload?.media?.durationMs)}</T>
    </Pressable>
  );
}
