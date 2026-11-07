/** Ismerősök: bejövő kérések, ismerősök, kimenő kérések. Műveletek kerek ikongombokkal. */
import { useState } from "react";
import { Pressable, SectionList, View } from "react-native";
import { router } from "expo-router";
import { Check, Clock, UserMinus, UserPlus, Undo2, Users, X } from "lucide-react-native";
import ReanimatedSwipeable from "react-native-gesture-handler/ReanimatedSwipeable";
import { confirmDialog } from "@/state/dialog";
import { useTranslation } from "react-i18next";
import { EmptyState, IconButton, ListItem, Monogram, Screen, SkeletonRows, T } from "@/components/ui";
import { chat, friendAction, pollOnce, refreshLists, removeFriend } from "@/state/chat";
import { useStore } from "@/lib/store";
import { size, space, useTheme } from "@/theme";
import { toast } from "@/state/toast";

export default function Friends() {
  const { t } = useTranslation();
  const { c } = useTheme();
  const s = useStore(chat, (x) => x);
  const [refreshing, setRefreshing] = useState(false);
  const act = (id: string, a: "accept" | "decline" | "cancel") => friendAction(id, a).catch((e) => toast.fail(e));
  const sections = [
    { key: "in", title: t("friends.incoming"), data: s.incoming },
    { key: "fr", title: t("friends.title"), data: s.friends },
    { key: "out", title: t("friends.outgoing"), data: s.outgoing },
  ].filter((x) => x.data.length);
  return (
    <Screen edges={["top"]}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: space[4], paddingTop: space[2] }}>
        <T v="h1">{t("friends.title")}</T>
        <IconButton icon={UserPlus} label={t("friends.add")} onPress={() => router.push("/add-friend")} />
      </View>
      {!s.ready ? <SkeletonRows count={4} /> : <SectionList sections={sections} keyExtractor={(e) => e.friendshipId} refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await Promise.all([refreshLists(), pollOnce()]); setRefreshing(false); }}
        ListEmptyComponent={<EmptyState icon={Users} text={t("friends.none")} />}
        renderSectionHeader={({ section }) => <T v="caption" muted style={{ paddingHorizontal: space[4], paddingTop: space[3] }}>{section.title}</T>}
        renderItem={({ item, section }) => {
          const row = (
          <ListItem label={item.user.username} left={<Monogram name={item.user.username} />} title={<T v="title">{s.prefs[item.user.id]?.nickname || item.user.username}</T>}
            onPress={section.key === "fr" && item.conversationId ? () => router.push({ pathname: "/chat/[id]", params: { id: item.conversationId! } }) : undefined}
            right={section.key === "in" ? (
              <View style={{ flexDirection: "row" }}>
                <IconButton icon={Check} label={t("friends.accept")} filled onPress={() => void act(item.friendshipId, "accept")} />
                <IconButton icon={X} label={t("friends.decline")} onPress={() => void act(item.friendshipId, "decline")} />
              </View>
            ) : section.key === "out" ? (
              <View style={{ flexDirection: "row", alignItems: "center" }}><Clock size={18} color="#888" /><IconButton icon={Undo2} label={t("friends.cancel")} onPress={() => void act(item.friendshipId, "cancel")} /></View>
            ) : undefined} />
          );
          // Ismerősnél jobbra húzásra törlés ikon + megerősítés (a beszélgetés archiválódik).
          return section.key === "fr" ? (
            <ReanimatedSwipeable overshootLeft={false} renderLeftActions={(_p, _t, m) => (
              <Pressable accessibilityRole="button" accessibilityLabel={t("friends.remove")} onPress={() => { m.close(); confirmDialog({ title: t("friends.remove"), message: t("friends.removeConfirm"), icon: UserMinus, destructive: true, confirmLabel: t("common.delete"), onConfirm: () => void removeFriend(item.user.id).then(() => refreshLists()).catch((e) => toast.fail(e)) }); }} style={{ width: 84, backgroundColor: c.danger, alignItems: "center", justifyContent: "center" }}>
                <UserMinus size={size.icon} color="#fff" />
              </Pressable>
            )}><View style={{ backgroundColor: c.bg }}>{row}</View></ReanimatedSwipeable>
          ) : row;
        }} />}
    </Screen>
  );
}
