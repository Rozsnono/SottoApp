/** QR beolvasás a biztonsági szám ellenőrzéséhez: egyezés → „ellenőrizve”, eltérés → figyelmeztetés (nem jelöljük ellenőrzöttnek). */
import { useRef } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Camera as CameraIcon, ShieldAlert, X } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Button, IconButton, T } from "@/components/ui";
import { chat, setVerified } from "@/state/chat";
import { session } from "@/state/session";
import { parseSnPayload, safetyNumber } from "@/crypto/safety";
import { showDialog } from "@/state/dialog";
import { toast } from "@/state/toast";
import { space } from "@/theme";

export default function ScanSafety() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const [perm, ask] = useCameraPermissions();
  const done = useRef(false);

  const onScan = (data: string) => {
    if (done.current) return;
    done.current = true; // egyszeri feldolgozás
    const conv = chat.get().conversations.find((x) => x.id === id);
    const me = session.get().me;
    const theirs = parseSnPayload(data);
    if (!conv?.other.identityPublicKey || !me || !theirs) {
      toast.error(t("profile.scanInvalid"));
      done.current = false;
      return;
    }
    const mine = safetyNumber(me.identityPublicKey, conv.other.identityPublicKey).join("");
    if (mine === theirs) {
      setVerified(conv.other.id, mine);
      toast.success(t("profile.verified"));
      router.back();
    } else {
      showDialog({ title: t("profile.scanMismatch"), message: t("profile.scanMismatchInfo"), icon: ShieldAlert, actions: [{ label: t("common.ok"), style: "destructive", onPress: () => { done.current = false; router.back(); } }] });
    }
  };

  if (!perm?.granted) {
    return (
      <View style={{ flex: 1, backgroundColor: "#000", alignItems: "center", justifyContent: "center", gap: space[4] }}>
        <Button icon={CameraIcon} title={t("chat.camera")} onPress={() => void ask()} />
        <IconButton icon={X} label={t("common.close")} color="#fff" onPress={() => router.back()} />
      </View>
    );
  }
  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <CameraView style={{ flex: 1 }} facing="back" barcodeScannerSettings={{ barcodeTypes: ["qr"] }} onBarcodeScanned={(r) => onScan(r.data)} />
      <View style={{ position: "absolute", top: 56, left: space[3] }}><IconButton icon={X} label={t("common.close")} color="#fff" onPress={() => router.back()} /></View>
      <View style={{ position: "absolute", bottom: 64, left: 0, right: 0, alignItems: "center" }}><T color="#fff">{t("profile.scanHint")}</T></View>
    </View>
  );
}
