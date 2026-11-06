/** Beállítások: ikon + rövid cím soronként; nincs magyarázó alcím. */
import { useState } from "react";
import { Alert, ScrollView, Switch, View } from "react-native";
import { router } from "expo-router";
import { Bell, Fingerprint, Globe, LogOut, ScanFace, Smartphone, UserCog, UserX } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { ListItem, Screen, T } from "@/components/ui";
import { setLang } from "@/i18n";
import { lock, setLockEnabled } from "@/state/lock";
import { logout, session } from "@/state/session";
import { disablePush, registerPush } from "@/services/push";
import { useStore } from "@/lib/store";
import { size, space, useTheme } from "@/theme";

export default function Settings() {
  const { c } = useTheme();
  const { t, i18n } = useTranslation();
  const me = useStore(session, (s) => s.me);
  const lk = useStore(lock, (s) => s);
  const [notif, setNotif] = useState(true);
  const BioIcon = lk.mode === "face" ? ScanFace : Fingerprint;
  const ic = (I: typeof Bell) => <I size={size.icon} color={c.text} />;
  return (
    <Screen edges={["top"]}>
      <ScrollView>
        <T v="h1" style={{ paddingHorizontal: space[4], paddingTop: space[2], paddingBottom: space[2] }}>{me?.username}</T>
        <ListItem label={t("settings.account")} left={ic(UserCog)} title={<T v="title">{t("settings.account")}</T>} onPress={() => router.push("/settings/profile")} />
        <ListItem label={t("settings.language")} left={ic(Globe)} title={<T v="title">{t("settings.language")}</T>} onPress={() => void setLang(i18n.language === "hu" ? "en" : "hu")} right={<T v="title" color={c.accent}>{i18n.language.toUpperCase()}</T>} />
        <ListItem label={t("settings.notifications")} left={ic(Bell)} title={<T v="title">{t("settings.notifications")}</T>} right={<Switch accessibilityLabel={t("settings.notifications")} value={notif} onValueChange={(v) => { setNotif(v); void (v ? registerPush() : disablePush()); }} />} />
        <ListItem label={t("settings.biometric")} left={<BioIcon size={size.icon} color={c.text} />} title={<T v="title">{t("settings.biometric")}</T>}
          right={<Switch accessibilityLabel={t("settings.biometric")} disabled={!lk.available} value={lk.enabled} onValueChange={(v) => void setLockEnabled(v)} />} />
        <ListItem label={t("settings.devices")} left={ic(Smartphone)} title={<T v="title">{t("settings.devices")}</T>} onPress={() => router.push("/settings/devices")} />
        <ListItem label={t("friends.blocked")} left={ic(UserX)} title={<T v="title">{t("friends.blocked")}</T>} onPress={() => router.push("/settings/blocked")} />
        <ListItem label={t("auth.logout")} left={ic(LogOut)} title={<T v="title">{t("auth.logout")}</T>} onPress={() => Alert.alert(t("auth.logout"), t("recovery.warn"), [{ text: t("common.cancel"), style: "cancel" }, { text: t("auth.logout"), style: "destructive", onPress: () => void logout() }])} />
        <View style={{ height: space[8] }} />
      </ScrollView>
    </Screen>
  );
}
