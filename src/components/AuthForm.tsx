/** Közös regisztrációs/belépési űrlap (felhasználónév + jelszó, helyi ellenőrzés a protokoll sémáival). */
import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { ArrowRight, ChevronLeft, Lock, User } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Button, IconButton, Kav, Screen, T, TextField } from "./ui";
import { PasswordSchema, UsernameSchema } from "@/protocol/schemas";
import { errorText } from "@/lib/errors";
import { space } from "@/theme";

export function AuthForm({ mode, onSubmit }: { mode: "register" | "login"; onSubmit: (u: string, p: string) => Promise<void> }) {
  const { t } = useTranslation();
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const uOk = UsernameSchema.safeParse(u).success;
  const pOk = PasswordSchema.safeParse(p).success;
  // Szabályok csak hibánál jelennek meg (mezőelhagyás után), belépésnél nem szigorítunk előre.
  const uErr = mode === "register" && u.length > 0 && !uOk ? t("auth.usernameRules") : null;
  const pErr = mode === "register" && p.length > 0 && !pOk ? t("auth.passwordRules") : null;

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      await onSubmit(u, p);
    } catch (e) {
      setErr(errorText(e));
      setBusy(false);
    }
  };
  return (
    <Screen>
      <Kav style={{ padding: space[6], gap: space[6] }}>
        <View style={{ alignItems: "flex-start" }}><IconButton icon={ChevronLeft} label={t("common.back")} onPress={() => router.back()} /></View>
        <T v="h1">{mode === "register" ? t("auth.newAccount") : t("auth.login")}</T>
        <View style={{ gap: space[3] }}>
          <TextField label={t("auth.username")} icon={User} value={u} onChangeText={setU} ok={mode === "register" && uOk} error={uErr} textContentType="username" autoComplete="username" />
          <TextField label={t("auth.password")} icon={Lock} secure value={p} onChangeText={setP} ok={mode === "register" && pOk} error={pErr} textContentType={mode === "register" ? "newPassword" : "password"} autoComplete={mode === "register" ? "new-password" : "current-password"} onSubmitEditing={submit} />
        </View>
        {err ? <T color="#C62F36">{err}</T> : null}
        <View style={{ flex: 1, justifyContent: "flex-end" }}>
          <Button icon={ArrowRight} label={t("common.next")} onPress={submit} loading={busy} disabled={mode === "register" ? !(uOk && pOk) : !(u && p)} />
        </View>
      </Kav>
    </Screen>
  );
}
