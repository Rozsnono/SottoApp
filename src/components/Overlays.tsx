/** Teljes képernyős átfedések: helyreállító kód (egyszeri megjelenítés) és zárképernyő (biometrikus). */
import { useEffect, useState } from "react";
import { ScrollView, Share, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import * as Clipboard from "expo-clipboard";
import { ArrowRight, Check, Copy, Fingerprint, KeyRound, LockKeyhole, ScanFace, Share2 } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Button, IconButton, Screen, T } from "./ui";
import { ackRecoveryCode, logout, session } from "@/state/session";
import { lock, unlock } from "@/state/lock";
import { useStore } from "@/lib/store";
import { radius, size, space, useTheme } from "@/theme";

export function RecoveryCodeScreen() {
  const { c } = useTheme();
  const { t } = useTranslation();
  const code = useStore(session, (s) => s.recoveryCodeToShow) ?? "";
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: space[6], gap: space[6], flexGrow: 1, justifyContent: "center" }}>
        <View style={{ alignItems: "center", gap: space[3] }}>
          <KeyRound size={size.iconLg * 1.5} color={c.accent} />
          <T v="h1">{t("recovery.title")}</T>
          <T muted style={{ textAlign: "center" }}>{t("recovery.warn")}</T>
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[3], justifyContent: "center", backgroundColor: c.surface, borderRadius: radius.lg, padding: space[4], borderWidth: 1, borderColor: c.border }}>
          {code.split("-").map((g, i) => (
            <Animated.View key={i} entering={FadeIn.delay(i * 40).duration(220)}><T v="mono" selectable={false}>{g}</T></Animated.View>
          ))}
        </View>
        <View style={{ flexDirection: "row", justifyContent: "center", gap: space[4] }}>
          <IconButton icon={copied ? Check : Copy} label={t("common.copy")} filled onPress={async () => { await Clipboard.setStringAsync(code); setCopied(true); }} />
          <IconButton icon={Share2} label={t("common.share")} filled onPress={() => void Share.share({ message: code })} />
        </View>
        <Button title={t("recovery.saved")} icon={saved ? Check : undefined} variant={saved ? "primary" : "secondary"} onPress={() => (saved ? ackRecoveryCode() : setSaved(true))} />
        {saved ? <View style={{ alignItems: "center" }}><ArrowRight size={size.icon} color={c.textMuted} /></View> : null}
      </ScrollView>
    </Screen>
  );
}

export function LockScreen() {
  const { c } = useTheme();
  const { t } = useTranslation();
  const { mode, available } = useStore(lock, (s) => s);
  const Icon = mode === "face" ? ScanFace : Fingerprint;
  useEffect(() => { void unlock(); }, []);
  return (
    <Screen style={{ alignItems: "center", justifyContent: "center", gap: space[6] }}>
      <LockKeyhole size={size.iconLg * 1.5} color={c.textMuted} />
      <IconButton icon={Icon} label={t("lock.unlock")} filled iconSize={size.iconLg * 1.5} onPress={() => void unlock()} />
      {!available ? <T muted>{t("lock.unavailable")}</T> : null}
      <Button variant="ghost" title={t("auth.logout")} onPress={() => void logout()} />
    </Screen>
  );
}
