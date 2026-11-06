/**
 * Teljes képernyős média-nézet: letöltés + visszafejtés ideiglenes fájlba, megjelenítés, bezáráskor törlés.
 * Bezárás: ×, koppintás (kép) vagy lefelé húzás. A megnyitás olvasási visszaigazolást küld.
 */
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, PanResponder, Pressable, View, Animated } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Image } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import { Asset, requestPermissionsAsync } from "expo-media-library";
import { Download, RotateCw, X } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { IconButton, T } from "@/components/ui";
import { chat, markRead } from "@/state/chat";
import { downloadAndDecrypt, releaseTemp } from "@/services/media";
import { useStore } from "@/lib/store";
import { space } from "@/theme";
import { toast } from "@/state/toast";

function VideoBox({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => { p.play(); });
  return <VideoView player={player} style={{ flex: 1 }} contentFit="contain" nativeControls />;
}

export default function Viewer() {
  const { convId, id } = useLocalSearchParams<{ convId: string; id: string }>();
  const { t } = useTranslation();
  const msg = useStore(chat, (s) => s.messages[convId]?.find((m) => m.id === id));
  const [uri, setUri] = useState<string | null>(null);
  const [loadState, setState] = useState<"loading" | "ready" | "error">("loading");
  const hasMedia = !!msg?.mediaRef && !!msg.payload?.media?.key;
  const state = hasMedia ? loadState : "error";
  const [attempt, setAttempt] = useState(0);
  const [dy] = useState(() => new Animated.Value(0));

  useEffect(() => {
    let cancelled = false;
    let local: string | null = null;
    const media = msg?.payload?.media;
    if (!msg || !msg.mediaRef || !media?.key) return;
    downloadAndDecrypt(msg.mediaRef, media).then((u) => {
      local = u;
      if (cancelled) return releaseTemp(u);
      setUri(u);
      setState("ready");
      void markRead(msg);
    }).catch(() => { if (!cancelled) setState("error"); });
    return () => { cancelled = true; releaseTemp(local); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- csak azonosító/újrapróbálás szerint töltünk
  }, [msg?.id, attempt]);

  // Lefelé húzás: a kép követi az ujjat; elég nagy elmozdulásra/sebességre zár, különben visszaugrik.
  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => g.dy > 12 && Math.abs(g.dy) > Math.abs(g.dx),
    onPanResponderMove: Animated.event([null, { dy }], { useNativeDriver: false }),
    onPanResponderRelease: (_, g) => { if (g.dy > 120 || g.vy > 1.2) router.back(); else Animated.spring(dy, { toValue: 0, useNativeDriver: false }).start(); },
  }), [dy]);

  const save = () => Alert.alert(t("profile.download"), t("profile.downloadWarn"), [{ text: t("common.cancel"), style: "cancel" }, { text: t("common.ok"), onPress: async () => {
    try {
      const p = await requestPermissionsAsync(true);
      if (!p.granted || !uri) return;
      await Asset.create(uri);
      toast.success(t("profile.saved"));
    } catch (e) { console.warn("[viewer] mentés sikertelen", e instanceof Error ? e.message : e); toast.error(t("common.error")); }
  } }]);

  const bg = dy.interpolate({ inputRange: [0, 300], outputRange: [1, 0.3], extrapolate: "clamp" });
  return (
    <Animated.View style={{ flex: 1, backgroundColor: "#000", opacity: bg }} {...pan.panHandlers}>
      <Animated.View style={{ flex: 1, transform: [{ translateY: dy }], justifyContent: "center" }}>
        {state === "loading" ? <ActivityIndicator color="#fff" size="large" /> : null}
        {state === "error" ? (
          <View style={{ alignItems: "center", gap: space[3] }}><T color="#fff">{t("chat.mediaError")}</T><IconButton icon={RotateCw} label={t("common.retry")} filled onPress={() => { setState("loading"); setAttempt((a) => a + 1); }} /></View>
        ) : null}
        {state === "ready" && uri ? (msg?.type === "video" ? <VideoBox uri={uri} /> : <Pressable style={{ flex: 1 }} onPress={() => router.back()} accessibilityLabel={t("common.close")}><Image source={{ uri }} style={{ flex: 1 }} contentFit="contain" /></Pressable>) : null}
      </Animated.View>
      <View style={{ position: "absolute", top: 54, left: space[3], right: space[3], flexDirection: "row", justifyContent: "space-between" }}>
        <IconButton icon={X} label={t("common.close")} color="#fff" onPress={() => router.back()} />
        {state === "ready" ? <IconButton icon={Download} label={t("profile.download")} color="#fff" onPress={save} /> : null}
      </View>
    </Animated.View>
  );
}
