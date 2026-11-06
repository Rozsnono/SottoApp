/** Letiltott felhasználók és feloldás (a feloldás nem állítja vissza az ismeretséget). */
import { useCallback, useEffect, useState } from "react";
import { FlatList, View } from "react-native";
import { router } from "expo-router";
import { ChevronLeft, UserCheck, UserX } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { EmptyState, IconButton, ListItem, Monogram, Screen, T } from "@/components/ui";
import { api } from "@/lib/api";
import { space } from "@/theme";
import { toast } from "@/state/toast";

export default function Blocked() {
  const { t } = useTranslation();
  const [items, setItems] = useState<{ userId: string; username: string | null }[]>([]);
  const load = useCallback(() => api<{ items: { userId: string; username: string | null }[] }>("/api/blocks").then((r) => setItems(r.items)).catch((e) => toast.fail(e)), []);
  useEffect(() => { void load(); }, [load]);
  return (
    <Screen>
      <View style={{ paddingHorizontal: space[2] }}><IconButton icon={ChevronLeft} label={t("common.back")} onPress={() => router.back()} /></View>
      <FlatList data={items} keyExtractor={(b) => b.userId} ListEmptyComponent={<EmptyState icon={UserX} text={t("friends.none")} />} renderItem={({ item }) => (
        <ListItem label={item.username ?? "—"} left={<Monogram name={item.username ?? "?"} />} title={<T v="title">{item.username ?? "—"}</T>}
          right={<IconButton icon={UserCheck} label={t("friends.unblock")} onPress={() => void api(`/api/blocks/${item.userId}`, { method: "DELETE" }).then(load).catch((e) => toast.fail(e))} />} />
      )} />
    </Screen>
  );
}
