/** Áthelyezési QR (a helyreállító kódot tartalmazza!): 60 mp után automatikusan eltűnik, képernyőfelvétel tiltott, figyelmeztetéssel. */
import { useEffect } from "react";
import { View } from "react-native";
import { usePreventScreenCapture } from "expo-screen-capture";
import { TriangleAlert } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { SafetyQr } from "@/components/SafetyQr";
import { T } from "@/components/ui";
import { transferPayload } from "@/crypto/transfer";
import { size, space, useTheme } from "@/theme";

export function TransferQr({ code, onHide }: { code: string; onHide: () => void }) {
  const { c } = useTheme();
  const { t } = useTranslation();
  usePreventScreenCapture("sotto-transfer");
  useEffect(() => {
    const h = setTimeout(onHide, 60_000);
    return () => clearTimeout(h);
  }, [onHide]);
  return (
    <View style={{ alignItems: "center", gap: space[3], padding: space[4], borderRadius: 16, backgroundColor: c.surface, borderWidth: 1, borderColor: c.danger }}>
      <View style={{ flexDirection: "row", gap: space[2], alignItems: "center" }}><TriangleAlert size={size.icon} color={c.danger} /><T muted style={{ flex: 1 }}>{t("settings.transferWarn")}</T></View>
      <SafetyQr value={transferPayload(code)} px={220} />
    </View>
  );
}
