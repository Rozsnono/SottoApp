/**
 * Teljes képernyős média-nézet: letöltés + visszafejtés ideiglenes fájlba, megjelenítés, bezáráskor törlés.
 * Bezárás: ×, koppintás (kép) vagy lefelé húzás. A megnyitás olvasási visszaigazolást küld.
 */
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, PanResponder, Pressable, View, Animated } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Image } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import { Asset, requestPermissionsAsync } from "expo-media-library";
import { Download, RotateCw, TriangleAlert, X } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { IconButton, T } from "@/components/ui";
import { chat, consumeOnce, markRead } from "@/state/chat";
import { usePreventScreenCapture } from "expo-screen-capture";
import { downloadAndDecrypt, releaseTemp } from "@/services/media";
import { useStore } from "@/lib/store";
import { space } from "@/theme";
import { toast } from "@/state/toast";
import { confirmDialog } from "@/state/dialog";

/** Képernyőfelvétel/-kép tiltása, amíg az egyszeri média látszik (Androidon FLAG_SECURE; iOS-en a felvételt feketíti). */
function NoCapture() {
  usePreventScreenCapture("sotto-once");
  return null;
}

function VideoBox({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => { p.play(); });
  return <VideoView player={player} style={{ flex: 1 }} contentFit="contain" nativeControls />;
}

export default function Viewer() {
  const { convId, id: startId, ids } = useLocalSearchParams<{ convId: string; id: string; ids?: string }>();
  // Több képes csoport: balra/jobbra húzással lapozható; elemváltáskor a törzs újraépül (tiszta állapot).
  const order = useMemo(() => (ids ? ids.split(",") : [startId]), [ids, startId]);
  const [pos, setPos] = useState(() => Math.max(0, order.indexOf(startId)));
  return <ViewerBody key={order[pos]} convId={convId} id={order[pos] ?? startId} count={order.length} onNav={(d) => setPos((p) => Math.max(0, Math.min(order.length - 1, p + d)))} />;
}

function ViewerBody({ convId, id, count, onNav }: { convId: string; id: string; count: number; onNav: (delta: number) => void }) {
  const { t } = useTranslation();
  const msg = useStore(chat, (s) => s.messages[convId]?.find((m) => m.id === id));
  const once = !!msg?.payload?.once && !msg.mine;
  const [uri, setUri] = useState<string | null>(null);
  // Egyszeri média, amit már megnyitottunk: nem töltjük le újra.
  const [spentAtOpen] = useState(() => !!chat.get().consumed[id]);
  const [loadState, setState] = useState<"loading" | "ready" | "error">(spentAtOpen && !!chat.get().messages[convId]?.find((m) => m.id === id)?.payload?.once ? "error" : "loading");
  const hasMedia = !!msg?.mediaRef && !!msg.payload?.media?.key;
  const state = hasMedia ? loadState : "error";
  const [attempt, setAttempt] = useState(0);
  const [dy] = useState(() => new Animated.Value(0));

  useEffect(() => {
    let cancelled = false;
    let local: string | null = null;
    const media = msg?.payload?.media;
    if (!msg || !msg.mediaRef || !media?.key) return;
    if (msg.payload?.once && !msg.mine && spentAtOpen) return; // már megnyitva
    downloadAndDecrypt(msg.mediaRef, media).then((u) => {
      local = u;
      if (cancelled) return releaseTemp(u);
      setUri(u);
      setState("ready");
      void markRead(msg);
      if (msg.payload?.once && !msg.mine) consumeOnce(msg); // egyszeri média: innentől nem nyitható meg újra
    }).catch(() => { if (!cancelled) setState("error"); });
    return () => { cancelled = true; releaseTemp(local); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- csak azonosító/újrapróbálás szerint töltünk
  }, [msg?.id, attempt]);

  // Lefelé húzás: a kép követi az ujjat; elég nagy elmozdulásra/sebességre zár, különben visszaugrik.
  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => (g.dy > 12 && Math.abs(g.dy) > Math.abs(g.dx)) || (count > 1 && Math.abs(g.dx) > 24 && Math.abs(g.dx) > Math.abs(g.dy) * 2),
    onPanResponderMove: Animated.event([null, { dy }], { useNativeDriver: false }),
    onPanResponderRelease: (_, g) => {
      if (Math.abs(g.dx) > 80 && Math.abs(g.dx) > Math.abs(g.dy) * 2) { onNav(g.dx < 0 ? 1 : -1); dy.setValue(0); return; }
      if (g.dy > 120 || g.vy > 1.2) router.back(); else Animated.spring(dy, { toValue: 0, useNativeDriver: false }).start();
    },
  }), [dy, count, onNav]);

  const save = () => confirmDialog({ title: t("profile.download"), message: t("profile.downloadWarn"), icon: TriangleAlert, confirmLabel: t("common.ok"), onConfirm: async () => {
    try {
      const p = await requestPermissionsAsync(true);
      if (!p.granted || !uri) return;
      await Asset.create(uri);
      toast.success(t("profile.saved"));
    } catch (e) { console.warn("[viewer] mentés sikertelen", e instanceof Error ? e.message : e); toast.error(t("common.error")); }
  } });

  const bg = dy.interpolate({ inputRange: [0, 300], outputRange: [1, 0.3], extrapolate: "clamp" });
  return (
    <Animated.View style={{ flex: 1, backgroundColor: "#000", opacity: bg }} {...pan.panHandlers}>
      {once ? <NoCapture /> : null}
      <Animated.View style={{ flex: 1, transform: [{ translateY: dy }], justifyContent: "center" }}>
        {state === "loading" ? <ActivityIndicator color="#fff" size="large" /> : null}
        {state === "error" ? (
          <View style={{ alignItems: "center", gap: space[3] }}><T color="#fff">{t("chat.mediaError")}</T><IconButton icon={RotateCw} label={t("common.retry")} filled onPress={() => { setState("loading"); setAttempt((a) => a + 1); }} /></View>
        ) : null}
        {state === "ready" && uri ? (msg?.type === "video" ? <VideoBox uri={uri} /> : <Pressable style={{ flex: 1 }} onPress={() => router.back()} accessibilityLabel={t("common.close")}><Image source={{ uri }} style={{ flex: 1 }} contentFit="contain" /></Pressable>) : null}
      </Animated.View>
      <View style={{ position: "absolute", top: 54, left: space[3], right: space[3], flexDirection: "row", justifyContent: "space-between" }}>
        <IconButton icon={X} label={t("common.close")} color="#fff" onPress={() => router.back()} />
        {state === "ready" && !once ? <IconButton icon={Download} label={t("profile.download")} color="#fff" onPress={save} /> : null}
      </View>
    </Animated.View>
  );
}
