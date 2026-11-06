/** Ismerősök: bejövő kérések, ismerősök, kimenő kérések. Műveletek kerek ikongombokkal. */
import { useState } from "react";
import { SectionList, View } from "react-native";
import { router } from "expo-router";
import { Check, Clock, UserPlus, Undo2, Users, X } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { EmptyState, IconButton, ListItem, Monogram, Screen, T } from "@/components/ui";
import { chat, friendAction, refreshLists } from "@/state/chat";
import { useStore } from "@/lib/store";
import { space } from "@/theme";
import { toast } from "@/state/toast";

export default function Friends() {
  const { t } = useTranslation();
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
      <SectionList sections={sections} keyExtractor={(e) => e.friendshipId} refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await refreshLists(); setRefreshing(false); }}
        ListEmptyComponent={<EmptyState icon={Users} text={t("friends.none")} />}
        renderSectionHeader={({ section }) => <T v="caption" muted style={{ paddingHorizontal: space[4], paddingTop: space[3] }}>{section.title}</T>}
        renderItem={({ item, section }) => (
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
        )} />
    </Screen>
  );
}
