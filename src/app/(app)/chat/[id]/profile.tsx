/** Ismerős profilja: becenév, szín (csak nálam látszik, titkosítva szinkronizálva), közös média, biztonsági szám, némítás, törlés/tiltás. */
import { useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ban, Bell, BellOff, ChevronLeft, Image as ImageIcon, Palette, Pencil, ShieldCheck, TriangleAlert, UserMinus } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Button, ColorPicker, IconButton, Kav, ListItem, Monogram, Screen, T, TextField } from "@/components/ui";
import { blockUser, chat, displayName, loadPrefs, removeFriend, savePrefs, isMuted, setMute, setVerified } from "@/state/chat";
import { session } from "@/state/session";
import { safetyNumber } from "@/crypto/safety";
import { useStore } from "@/lib/store";
import { radius, size, space, useTheme } from "@/theme";
import { toast } from "@/state/toast";
import { confirmDialog } from "@/state/dialog";

export default function Profile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c, tint } = useTheme();
  const { t } = useTranslation();
  const conv = useStore(chat, (s) => s.conversations.find((x) => x.id === id));
  const prefs = useStore(chat, (s) => s.prefs);
  const count = useStore(chat, (s) => (s.messages[id] ?? []).filter((m) => (m.type === "image" || m.type === "video") && !m.broken).length);
  const verifiedMap = useStore(chat, (s) => s.verified);
  const other = conv?.other;
  const [draft, setDraft] = useState<string | null>(null);
  useEffect(() => { if (other) { void loadPrefs(other.id); } }, [other]);
  if (!conv || !other) return <Screen><View /></Screen>;
  const me = session.get().me!;
  const name = displayName(conv, prefs);
  const fail = toast.fail;
  const sn = other.identityPublicKey ? safetyNumber(me.identityPublicKey, other.identityPublicKey) : null;
  const fp = sn?.join("") ?? "";
  const verified = !!fp && verifiedMap[other.id] === fp;
  const muted = isMuted(conv);
  const cur = prefs[other.id] ?? {};
  const nick = draft ?? cur.nickname ?? "";
  const confirm = (title: string, body: string, fn: () => Promise<void>) => confirmDialog({ title, message: body, icon: TriangleAlert, destructive: true, onConfirm: () => void fn().then(() => router.dismissTo("/")).catch(fail) });

  return (
    <Screen><Kav>
      <View style={{ paddingHorizontal: space[2] }}><IconButton icon={ChevronLeft} label={t("common.back")} onPress={() => router.back()} /></View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: space[4], gap: space[5] }}>
        <View style={{ alignItems: "center", gap: space[2] }}>
          <Monogram name={name} px={72} tint={tint(cur.color as never)} />
          <T v="h1">{name}</T>
          {other.username && name !== other.username ? <T muted>{other.username}</T> : null}
        </View>
        <View style={{ gap: space[2] }}>
          <TextField label={t("profile.nickname")} icon={Pencil} value={nick} onChangeText={setDraft} maxLength={30} onEndEditing={() => { if (nick !== (cur.nickname ?? "")) savePrefs(other.id, { ...cur, nickname: nick.trim() || undefined }).catch(fail); setDraft(null); }} />
        </View>
        <View style={{ gap: space[3] }}>
          <Palette size={size.icon} color={c.textMuted} />
          <ColorPicker value={cur.color} labels={(k) => k} onChange={(col) => void savePrefs(other.id, { ...cur, color: col ?? undefined }).catch(fail)} />
        </View>
        <ListItem label={t("profile.sharedMedia")} onPress={() => router.push({ pathname: "/chat/[id]/gallery", params: { id } })} left={<ImageIcon size={size.icon} color={c.text} />} title={<T v="title">{t("profile.sharedMedia")}</T>}
          right={<View style={{ minWidth: 24, height: 24, borderRadius: 12, backgroundColor: c.accentSoft, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 }}><T v="caption">{count}</T></View>} />
        {sn ? (
          <View style={{ gap: space[3], backgroundColor: c.surface, borderRadius: radius.lg, padding: space[4], borderWidth: 1, borderColor: c.border }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: space[2] }}><ShieldCheck size={size.icon} color={verified ? c.success : c.textMuted} /><T v="title">{t("profile.safety")}</T></View>
            <T v="caption" muted>{t("profile.safetyInfo")}</T>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[3] }}>{sn.map((g, i) => <T key={i} v="mono">{g}</T>)}</View>
            <Button variant={verified ? "primary" : "secondary"} icon={ShieldCheck} title={t("profile.verified")} onPress={() => setVerified(other.id, verified ? null : fp)} />
          </View>
        ) : null}
        <View style={{ flexDirection: "row", gap: space[3], justifyContent: "center" }}>
          <IconButton icon={muted ? Bell : BellOff} label={muted ? t("chat.unmute") : t("chat.mute")} onPress={() => void setMute(conv.id, muted ? null : new Date(Date.now() + 8 * 3600_000).toISOString()).catch(fail)} />
          <IconButton icon={UserMinus} label={t("friends.remove")} color={c.danger} onPress={() => confirm(t("friends.remove"), t("friends.removeConfirm"), () => removeFriend(other.id))} />
          <IconButton icon={Ban} label={t("friends.block")} color={c.danger} onPress={() => confirm(t("friends.block"), t("friends.blockConfirm"), () => blockUser(other.id))} />
        </View>
      </ScrollView>
    </Kav></Screen>
  );
}
