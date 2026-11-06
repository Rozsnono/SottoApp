import { Redirect, router } from "expo-router";
import { View } from "react-native";
import { LockKeyhole, LogIn, UserPlus } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Button, Screen, T } from "@/components/ui";
import { session } from "@/state/session";
import { useStore } from "@/lib/store";
import { size, space, useTheme } from "@/theme";

export default function Welcome() {
  const { c } = useTheme();
  const { t } = useTranslation();
  const status = useStore(session, (s) => s.status);
  if (status === "needs-keys") return <Redirect href="/restore" />;
  return (
    <Screen style={{ padding: space[6], justifyContent: "space-between" }}>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: space[3] }}>
        <LockKeyhole size={size.iconLg * 2.5} color={c.accent} strokeWidth={1.5} />
        <T v="display">Sotto</T>
      </View>
      <View style={{ gap: space[3] }}>
        <Button icon={UserPlus} title={t("auth.newAccount")} onPress={() => router.push("/register")} />
        <Button icon={LogIn} variant="secondary" title={t("auth.login")} onPress={() => router.push("/login")} />
      </View>
    </Screen>
  );
}
