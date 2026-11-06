/** Saját eszközök: az aktuális jelölve, a többi eltávolítható (az eltávolított eszköz nem kap több üzenetkulcsot). */
import { useCallback, useEffect, useState } from "react";
import { Alert, FlatList, View } from "react-native";
import { router } from "expo-router";
import { ChevronLeft, Smartphone, Trash2 } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { IconButton, ListItem, Screen, T } from "@/components/ui";
import { api } from "@/lib/api";
import { space, useTheme } from "@/theme";
import { toast } from "@/state/toast";

interface Dev { deviceId: string; deviceName: string; lastSeenAt: string | null; revoked: boolean; isCurrent: boolean }

export default function Devices() {
  const { c } = useTheme();
  const { t } = useTranslation();
  const [items, setItems] = useState<Dev[]>([]);
  const load = useCallback(() => api<{ items: Dev[] }>("/api/devices").then((r) => setItems(r.items.filter((d) => !d.revoked))).catch((e) => toast.fail(e)), []);
  useEffect(() => { void load(); }, [load]);
  return (
    <Screen>
      <View style={{ paddingHorizontal: space[2] }}><IconButton icon={ChevronLeft} label={t("common.back")} onPress={() => router.back()} /></View>
      <FlatList data={items} keyExtractor={(d) => d.deviceId} renderItem={({ item }) => (
        <ListItem label={item.deviceName} left={<Smartphone size={22} color={item.isCurrent ? c.accent : c.text} />} title={<View><T v="title">{item.deviceName}</T>{item.isCurrent ? <T v="caption" color={c.accent}>{t("settings.currentDevice")}</T> : null}</View>}
          right={item.isCurrent ? undefined : <IconButton icon={Trash2} label={t("settings.revoke")} color={c.danger} onPress={() => Alert.alert(t("settings.revoke"), undefined, [{ text: t("common.cancel"), style: "cancel" }, { text: t("settings.revoke"), style: "destructive", onPress: () => void api(`/api/devices/${item.deviceId}`, { method: "DELETE" }).then(load).catch((e) => toast.fail(e)) }])} />} />
      )} />
    </Screen>
  );
}
