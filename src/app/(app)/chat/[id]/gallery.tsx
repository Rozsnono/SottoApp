/** Közös média: zárt csempék rácsa (nincs előnézet), szűrő: mind / tőle / tőlem. */
import { useMemo, useState } from "react";
import { FlatList, Pressable, View, useWindowDimensions } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { ArrowDownLeft, ArrowUpRight, ChevronLeft, Image as ImageIcon, LayoutGrid, Video } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { EmptyState, IconButton, Screen, SegmentedIcons } from "@/components/ui";
import { chat } from "@/state/chat";
import { useStore } from "@/lib/store";
import { radius, size, space, useTheme } from "@/theme";

type Filter = "all" | "them" | "me";

export default function Gallery() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c } = useTheme();
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const [f, setF] = useState<Filter>("all");
  const list = useStore(chat, (s) => s.messages[id]);
  const items = useMemo(() => (list ?? []).filter((m) => (m.type === "image" || m.type === "video") && !m.broken && !m.forged && (f === "all" || (f === "me" ? m.mine : !m.mine))).reverse(), [list, f]);
  const cell = (width - space[4] * 2 - space[1] * 2) / 3;
  return (
    <Screen>
      <View style={{ flexDirection: "row", alignItems: "center", padding: space[2], gap: space[2] }}>
        <IconButton icon={ChevronLeft} label={t("common.back")} onPress={() => router.back()} />
        <View style={{ flex: 1 }}>
          <SegmentedIcons value={f} onChange={setF} items={[{ key: "all", icon: LayoutGrid, label: t("profile.all") }, { key: "them", icon: ArrowDownLeft, label: t("profile.fromThem") }, { key: "me", icon: ArrowUpRight, label: t("profile.fromMe") }]} />
        </View>
      </View>
      <FlatList data={items} numColumns={3} keyExtractor={(m) => m.id} contentContainerStyle={{ padding: space[4], gap: space[1] }} columnWrapperStyle={{ gap: space[1] }}
        ListEmptyComponent={<EmptyState icon={ImageIcon} text={t("profile.noMedia")} />}
        renderItem={({ item: m }) => {
          const Icon = m.type === "video" ? Video : ImageIcon;
          return (
            <Pressable accessibilityRole="button" accessibilityLabel={t("chat.openMedia")} onPress={() => router.push({ pathname: "/viewer", params: { convId: id, id: m.id } })} style={{ width: cell, aspectRatio: 1, borderRadius: radius.md, backgroundColor: c.surfaceAlt, alignItems: "center", justifyContent: "center" }}>
              <Icon size={size.iconLg} color={c.text} />
              <View style={{ position: "absolute", top: 6, right: 6 }}>{m.mine ? <ArrowUpRight size={14} color={c.textMuted} /> : <ArrowDownLeft size={14} color={c.textMuted} />}</View>
            </Pressable>
          );
        }} />
    </Screen>
  );
}
