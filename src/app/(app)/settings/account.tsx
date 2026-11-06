/** Fiók törlése (jelszóval megerősítve; 30 napig visszaállítható, utána végleges). */
import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { ChevronLeft, Lock, Trash2 } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Button, IconButton, Kav, Screen, T, TextField } from "@/components/ui";
import { deleteAccount } from "@/state/session";
import { errorText } from "@/lib/errors";
import { space } from "@/theme";

export default function DeleteAccount() {
  const { t } = useTranslation();
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Screen><Kav style={{ padding: space[4], gap: space[5] }}>
      <View style={{ alignItems: "flex-start" }}><IconButton icon={ChevronLeft} label={t("common.back")} onPress={() => router.back()} /></View>
      <T v="h1">{t("settings.deleteAccount")}</T>
      <T muted>{t("settings.deleteWarn")}</T>
      <TextField label={t("auth.password")} icon={Lock} secure value={pw} onChangeText={setPw} error={err} />
      <Button variant="danger" icon={Trash2} title={t("common.delete")} disabled={!pw} loading={busy} onPress={async () => { setBusy(true); setErr(null); try { await deleteAccount(pw); } catch (e) { setErr(errorText(e)); setBusy(false); } }} />
    </Kav></Screen>
  );
}
