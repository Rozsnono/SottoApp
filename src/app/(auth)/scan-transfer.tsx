/** Új eszközön: a régi telefon áthelyezési QR-ját beolvasva a helyreállító kód automatikusan megadódik (a belépés jelszava már megvolt). */
import { useRef } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Camera as CameraIcon, X } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Button, IconButton, T } from "@/components/ui";
import { parseTransferPayload } from "@/crypto/transfer";
import { restoreKeys } from "@/state/session";
import { errorText } from "@/lib/errors";
import { toast } from "@/state/toast";
import { space } from "@/theme";

export default function ScanTransfer() {
  const { t } = useTranslation();
  const [perm, ask] = useCameraPermissions();
  const busy = useRef(false);
  const onScan = async (data: string) => {
    if (busy.current) return;
    busy.current = true; // egyszeri feldolgozás
    const code = parseTransferPayload(data);
    if (!code) { toast.error(t("settings.transferInvalid")); busy.current = false; return; }
    try {
      await restoreKeys(code); // sikernél a munkamenet „ready” lesz, az útválasztó átvisz az appba
    } catch (e) {
      toast.error(errorText(e));
      busy.current = false;
      router.back();
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
      <CameraView style={{ flex: 1 }} facing="back" barcodeScannerSettings={{ barcodeTypes: ["qr"] }} onBarcodeScanned={(r) => void onScan(r.data)} />
      <View style={{ position: "absolute", top: 56, left: space[3] }}><IconButton icon={X} label={t("common.close")} color="#fff" onPress={() => router.back()} /></View>
      <View style={{ position: "absolute", bottom: 64, left: 0, right: 0, alignItems: "center", padding: space[4] }}><T color="#fff">{t("settings.transferScanHint")}</T></View>
    </View>
  );
}
