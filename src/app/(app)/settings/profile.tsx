/** Fiókbeállítások: felhasználónév, kereshetőség, ki jelölhet ismerősnek, jelszócsere, fióktörlés. */
import { useCallback, useEffect, useState } from "react";
import { Alert, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { ChevronLeft, EyeOff, Globe, KeyRound, Lock, Trash2, User, Users } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Button, IconButton, Kav, ListItem, Screen, SegmentedIcons, T, TextField } from "@/components/ui";
import { api } from "@/lib/api";
import { errorText } from "@/lib/errors";
import { PasswordSchema } from "@/protocol/schemas";
import { size, space, useTheme } from "@/theme";

type Disc = "everyone" | "friends_only" | "hidden";
type Policy = "everyone" | "friends_only";
interface Settings { username: string; discoverability: Disc; friendRequestPolicy: Policy }

export default function AccountSettings() {
  const { c } = useTheme();
  const { t } = useTranslation();
  const [s, setS] = useState<Settings | null>(null);
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fail = useCallback((e: unknown) => Alert.alert(errorText(e)), []);

  useEffect(() => { api<Settings>("/api/account/settings").then(setS).catch(fail); }, [fail]);

  const save = (patch: Partial<Pick<Settings, "discoverability" | "friendRequestPolicy">>) => {
    if (!s) return;
    const prev = s;
    setS({ ...s, ...patch }); // optimista; hibánál visszaáll
    api("/api/account/settings", { method: "PUT", body: patch }).catch((e) => { setS(prev); fail(e); });
  };

  const changePassword = async () => {
    setBusy(true);
    setErr(null);
    try {
      await api("/api/account/password", { method: "POST", body: { currentPassword: cur, newPassword: next } });
      setCur("");
      setNext("");
      Alert.alert(t("settings.passwordChanged"));
    } catch (e) { setErr(errorText(e)); }
    setBusy(false);
  };

  return (
    <Screen><Kav>
      <View style={{ paddingHorizontal: space[2] }}><IconButton icon={ChevronLeft} label={t("common.back")} onPress={() => router.back()} /></View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: space[4], gap: space[5] }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space[2] }}><User size={size.icon} color={c.textMuted} /><T v="h1">{s?.username ?? ""}</T></View>
        {s ? (
          <>
            <View style={{ gap: space[2] }}>
              <T v="caption" muted>{t("settings.discoverability")}</T>
              <SegmentedIcons<Disc> value={s.discoverability} onChange={(v) => save({ discoverability: v })} items={[{ key: "everyone", icon: Globe, label: t("settings.everyone") }, { key: "friends_only", icon: Users, label: t("settings.friendsOnly") }, { key: "hidden", icon: EyeOff, label: t("settings.hiddenOpt") }]} />
            </View>
            <View style={{ gap: space[2] }}>
              <T v="caption" muted>{t("settings.requestPolicy")}</T>
              <SegmentedIcons<Policy> value={s.friendRequestPolicy} onChange={(v) => save({ friendRequestPolicy: v })} items={[{ key: "everyone", icon: Globe, label: t("settings.everyone") }, { key: "friends_only", icon: Users, label: t("settings.friendsOnly") }]} />
            </View>
          </>
        ) : null}
        <View style={{ gap: space[3] }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space[2] }}><KeyRound size={size.icon} color={c.textMuted} /><T v="title">{t("settings.changePassword")}</T></View>
          <TextField label={t("settings.currentPassword")} icon={Lock} secure value={cur} onChangeText={setCur} />
          <TextField label={t("settings.newPassword")} icon={Lock} secure value={next} onChangeText={setNext} error={err ?? (next.length > 0 && !PasswordSchema.safeParse(next).success ? t("auth.passwordRules") : null)} />
          <Button title={t("common.save")} loading={busy} disabled={!cur || !PasswordSchema.safeParse(next).success} onPress={changePassword} />
        </View>
        <ListItem label={t("settings.deleteAccount")} left={<Trash2 size={size.icon} color={c.danger} />} title={<T v="title" color={c.danger}>{t("settings.deleteAccount")}</T>} onPress={() => router.push("/settings/account")} />
      </ScrollView>
    </Kav></Screen>
  );
}
