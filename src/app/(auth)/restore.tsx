/** Új eszközön a helyreállító kód megadása: a kulcsmentés visszafejtése a készüléken (a szerver nem látja a kódot). */
import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { ArrowRight, KeyRound, LogOut, ScanLine } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Button, Kav, Screen, T, TextField } from "@/components/ui";
import { logout, restoreKeys } from "@/state/session";
import { normalizeRecoveryCode } from "@/crypto/recovery";
import { ApiError } from "@/lib/api";
import { errorText } from "@/lib/errors";
import { space } from "@/theme";

export default function Restore() {
  const { t } = useTranslation();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const valid = normalizeRecoveryCode(code) !== null;

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      await restoreKeys(code);
    } catch (e) {
      if (e instanceof ApiError) {
        // A mentés-lekéréshez friss belépés kell; ha lejárt, vissza a belépéshez.
        if (e.code === "UNAUTHORIZED") await logout();
        setErr(errorText(e));
      } else {
        setErr(t("recovery.wrong")); // hibás kód → a visszafejtés hitelesítése bukik
      }
      setBusy(false);
    }
  };
  return (
    <Screen><Kav style={{ padding: space[6], gap: space[6] }}>
      <View style={{ gap: space[3] }}>
        <KeyRound size={40} color="#4A4FD8" />
        <T v="h1">{t("recovery.enter")}</T>
      </View>
      <TextField label={t("recovery.title")} icon={KeyRound} value={code} onChangeText={setCode} autoCapitalize="characters" ok={valid} error={err} onSubmitEditing={submit} />
      <View style={{ flex: 1, justifyContent: "flex-end", gap: space[3] }}>
        <Button icon={ScanLine} variant="secondary" title={t("settings.transferScan")} onPress={() => router.push("/scan-transfer")} />
        <Button icon={ArrowRight} label={t("common.next")} onPress={submit} loading={busy} disabled={!valid} />
        <Button icon={LogOut} variant="ghost" title={t("auth.logout")} onPress={() => void logout()} />
      </View>
    </Kav></Screen>
  );
}
