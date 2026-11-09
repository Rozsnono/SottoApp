/** Beállítások: ikon + rövid cím soronként; nincs magyarázó alcím. */
import { useEffect, useState } from "react";
import * as Application from "expo-application";
import { ScrollView, Switch, View } from "react-native";
import { router } from "expo-router";
import { Bell, Fingerprint, Globe, LogOut, ScanFace, Smartphone, UserCog, UserX, EyeOff, AppWindow, BellRing } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { ListItem, Screen, T } from "@/components/ui";
import { setLang } from "@/i18n";
import { lock, setLockEnabled } from "@/state/lock";
import { logout, session } from "@/state/session";
import { disablePush, getPushError, registerPush } from "@/services/push";
import { toast } from "@/state/toast";
import { getHideSender, setHideSender } from "@/services/notifyPrefs";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";
import { size, space, useTheme } from "@/theme";
import { confirmDialog } from "@/state/dialog";

export default function Settings() {
  const { c } = useTheme();
  const { t, i18n } = useTranslation();
  const me = useStore(session, (s) => s.me);
  const lk = useStore(lock, (s) => s);
  const [notif, setNotif] = useState(true);
  const [hideSender, setHide] = useState(() => getHideSender());
  const [apiVersion, setApiVersion] = useState<string | null>(null);
  useEffect(() => { api<{ version: string }>("/api/version", { auth: false }).then((r) => setApiVersion(r.version)).catch(() => setApiVersion(null)); }, []);
  // Teszt-értesítés: újraregisztrál, majd a szerver küld egyet erre az eszközre – a hiba oka kiírva (nincs token / nincs FCM-beállítás / küldési hiba).
  const testPush = async () => {
    if (!(await registerPush())) return toast.error(t("settings.pushFailed", { reason: getPushError() ?? "?" }));
    try {
      await api("/api/devices/push/test", { method: "POST", body: {} });
      toast.success(t("settings.pushSent"));
    } catch (e) { toast.fail(e); }
  };
  const BioIcon = lk.mode === "face" ? ScanFace : Fingerprint;
  const ic = (I: typeof Bell) => <I size={size.icon} color={c.text} />;
  return (
    <Screen edges={["top"]}>
      <ScrollView>
        <T v="h1" style={{ paddingHorizontal: space[4], paddingTop: space[2], paddingBottom: space[2] }}>{me?.username}</T>
        <ListItem label={t("settings.account")} left={ic(UserCog)} title={<T v="title">{t("settings.account")}</T>} onPress={() => router.push("/settings/profile")} />
        <ListItem label={t("settings.language")} left={ic(Globe)} title={<T v="title">{t("settings.language")}</T>} onPress={() => void setLang(i18n.language === "hu" ? "en" : "hu")} right={<T v="title" color={c.accent}>{i18n.language.toUpperCase()}</T>} />
        <ListItem label={t("settings.notifications")} left={ic(Bell)} title={<T v="title">{t("settings.notifications")}</T>} right={<Switch accessibilityLabel={t("settings.notifications")} value={notif} onValueChange={(v) => { setNotif(v); void (v ? registerPush().then((ok) => { if (!ok) toast.error(t("settings.pushFailed", { reason: getPushError() ?? "?" })); }) : disablePush()); }} />} />
        <ListItem label={t("settings.pushTest")} left={ic(BellRing)} title={<T v="title">{t("settings.pushTest")}</T>} onPress={() => void testPush()} />
        <ListItem label={t("settings.hideSender")} left={ic(EyeOff)} title={<T v="title">{t("settings.hideSender")}</T>} right={<Switch accessibilityLabel={t("settings.hideSender")} value={hideSender} onValueChange={(v) => { setHide(v); void setHideSender(v); }} />} />
        <ListItem label={t("settings.appIcon")} left={ic(AppWindow)} title={<T v="title">{t("settings.appIcon")}</T>} onPress={() => router.push("/settings/icon")} />
        <ListItem label={t("settings.biometric")} left={<BioIcon size={size.icon} color={c.text} />} title={<T v="title">{t("settings.biometric")}</T>}
          right={<Switch accessibilityLabel={t("settings.biometric")} disabled={!lk.available} value={lk.enabled} onValueChange={(v) => void setLockEnabled(v)} />} />
        <ListItem label={t("settings.devices")} left={ic(Smartphone)} title={<T v="title">{t("settings.devices")}</T>} onPress={() => router.push("/settings/devices")} />
        <ListItem label={t("friends.blocked")} left={ic(UserX)} title={<T v="title">{t("friends.blocked")}</T>} onPress={() => router.push("/settings/blocked")} />
        <ListItem label={t("auth.logout")} left={ic(LogOut)} title={<T v="title">{t("auth.logout")}</T>} onPress={() => confirmDialog({ title: t("auth.logout"), icon: LogOut, confirmLabel: t("auth.logout"), destructive: true, onConfirm: () => void logout() })} />
        <T v="caption" muted style={{ textAlign: "center", paddingTop: space[4] }}>Sotto v{Application.nativeApplicationVersion ?? "?"} ({Application.nativeBuildVersion ?? "?"}){apiVersion ? ` · API v${apiVersion}` : ""}</T>
        <View style={{ height: space[8] }} />
      </ScrollView>
    </Screen>
  );
}
