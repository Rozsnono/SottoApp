/** Alkalmazáson belüli kamera: fotó/videó (max. 60 mp), vaku, kameraváltás. Nincs automatikus mentés a galériába. */
import { useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { CameraView, useCameraPermissions, useMicrophonePermissions, type CameraType } from "expo-camera";
import { Image } from "expo-image";
import { Camera as CameraIcon, RotateCcw, SwitchCamera, Video as VideoIcon, X, Zap, ZapOff } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Button, IconButton, T } from "@/components/ui";
import { SendButton } from "@/components/Composer";
import { sendMedia } from "@/state/chat";
import { releaseCapture } from "@/services/media";
import { MAX_VIDEO_DURATION_MS } from "@/protocol/constants";
import { space } from "@/theme";
import { toast } from "@/state/toast";

type Captured = { uri: string; kind: "image" | "video"; width?: number; height?: number; durationMs?: number };

export default function CameraScreen() {
  const { convId, once } = useLocalSearchParams<{ convId: string; once?: string }>();
  const { t } = useTranslation();
  const ref = useRef<CameraView>(null);
  const [cam, askCam] = useCameraPermissions();
  const [mic, askMic] = useMicrophonePermissions();
  const [facing, setFacing] = useState<CameraType>("back");
  const [flash, setFlash] = useState(false);
  const [mode, setMode] = useState<"picture" | "video">("picture");
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [shot, setShot] = useState<Captured | null>(null);
  const startedAt = useRef(0);

  useEffect(() => { if (!recording) return; const s = Date.now(); const h = setInterval(() => setElapsed(Date.now() - s), 200); return () => clearInterval(h); }, [recording]);

  if (!cam?.granted || (mode === "video" && !mic?.granted)) {
    return (
      <View style={{ flex: 1, backgroundColor: "#000", alignItems: "center", justifyContent: "center", gap: space[4] }}>
        <Button icon={CameraIcon} title={t("chat.camera")} onPress={async () => { await askCam(); if (mode === "video") await askMic(); }} />
        <IconButton icon={X} label={t("common.close")} color="#fff" onPress={() => router.back()} />
      </View>
    );
  }

  const shoot = async () => {
    if (!ref.current) return;
    try {
      if (mode === "picture") {
        const p = await ref.current.takePictureAsync({ quality: 0.8 });
        setShot({ uri: p.uri, kind: "image", width: p.width, height: p.height });
      } else if (recording) {
        ref.current.stopRecording();
      } else {
        setRecording(true);
        setElapsed(0);
        startedAt.current = Date.now();
        const v = await ref.current.recordAsync({ maxDuration: MAX_VIDEO_DURATION_MS / 1000 });
        setRecording(false);
        if (v?.uri) setShot({ uri: v.uri, kind: "video", durationMs: Math.min(Date.now() - startedAt.current, MAX_VIDEO_DURATION_MS) });
      }
    } catch (e) {
      setRecording(false);
      toast.fail(e);
    }
  };

  const discard = () => { releaseCapture(shot?.uri); setShot(null); };
  const send = (hidden: boolean) => {
    if (!shot) return;
    sendMedia(convId, shot.uri, shot.kind, { mime: shot.kind === "video" ? "video/mp4" : "image/jpeg", width: shot.width, height: shot.height, durationMs: shot.durationMs }, hidden, { once: once === "1" }).catch((e) => toast.fail(e));
    router.back();
  };

  if (shot) {
    return (
      <View style={{ flex: 1, backgroundColor: "#000", justifyContent: "center" }}>
        {shot.kind === "image" ? <Image source={{ uri: shot.uri }} style={{ flex: 1 }} contentFit="contain" /> : <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><VideoIcon size={64} color="#fff" /></View>}
        <View style={{ position: "absolute", bottom: 48, left: space[6], right: space[6], flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <IconButton icon={RotateCcw} label={t("common.retry")} color="#fff" onPress={discard} />
          <SendButton onSend={send} />
        </View>
      </View>
    );
  }
  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <CameraView ref={ref} style={{ flex: 1 }} facing={facing} mode={mode} flash={flash ? "on" : "off"} enableTorch={false} />
      <View style={{ position: "absolute", top: 54, left: space[3], right: space[3], flexDirection: "row", justifyContent: "space-between" }}>
        <IconButton icon={X} label={t("common.close")} color="#fff" onPress={() => router.back()} />
        <View style={{ flexDirection: "row" }}>
          <IconButton icon={flash ? Zap : ZapOff} label="flash" color="#fff" onPress={() => setFlash((f) => !f)} />
          <IconButton icon={SwitchCamera} label="flip" color="#fff" onPress={() => setFacing((f) => (f === "back" ? "front" : "back"))} />
        </View>
      </View>
      {recording ? <View style={{ position: "absolute", top: 110, alignSelf: "center", flexDirection: "row", gap: 6, alignItems: "center" }}><View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: "#f33" }} /><T color="#fff">{Math.floor(elapsed / 1000)}s / 60s</T></View> : null}
      <View style={{ position: "absolute", bottom: 40, left: 0, right: 0, alignItems: "center", gap: space[4] }}>
        {!recording ? (
          <View style={{ flexDirection: "row", gap: space[6] }}>
            <IconButton icon={CameraIcon} label={t("chat.camera")} color={mode === "picture" ? "#fff" : "#999"} onPress={() => setMode("picture")} />
            <IconButton icon={VideoIcon} label={t("chat.video")} color={mode === "video" ? "#fff" : "#999"} onPress={() => setMode("video")} />
          </View>
        ) : null}
        <Pressable accessibilityRole="button" accessibilityLabel={mode === "picture" ? t("chat.camera") : t("chat.video")} onPress={shoot} style={{ width: 76, height: 76, borderRadius: 38, borderWidth: 5, borderColor: "#fff", alignItems: "center", justifyContent: "center" }}>
          <View style={{ width: recording ? 28 : 56, height: recording ? 28 : 56, borderRadius: recording ? 6 : 28, backgroundColor: mode === "video" ? "#f33" : "#fff" }} />
        </Pressable>
      </View>
    </View>
  );
}
