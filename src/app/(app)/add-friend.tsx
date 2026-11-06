/** Ismerős hozzáadása felhasználónév alapján (keresés + jelölés). Az eredmény általános, nem árul el semmit a tiltásról. */
import { useEffect, useState } from "react";
import { FlatList, View } from "react-native";
import { router } from "expo-router";
import { Check, Clock, Search, UserPlus, X } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { IconButton, ListItem, Monogram, Screen, T, TextField } from "@/components/ui";
import { searchUsers, sendFriendRequest } from "@/state/chat";
import { errorText } from "@/lib/errors";
import { space } from "@/theme";

type Item = { id: string; username: string; relation: string };

export default function AddFriend() {
  const { t } = useTranslation();
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [sent, setSent] = useState<Record<string, true>>({});
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (q.trim().length < 3) return;
    const h = setTimeout(() => { searchUsers(q.trim()).then((r) => { setItems(r); setErr(null); }).catch((e) => setErr(errorText(e))); }, 300);
    return () => clearTimeout(h);
  }, [q]);

  const add = async (u: Item) => {
    try {
      await sendFriendRequest(u.username);
      setSent((s) => ({ ...s, [u.id]: true }));
    } catch (e) {
      setErr(errorText(e));
    }
  };
  return (
    <Screen edges={["top", "bottom"]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space[2], padding: space[3] }}>
        <View style={{ flex: 1 }}><TextField label={t("friends.search")} icon={Search} value={q} onChangeText={setQ} autoFocus /></View>
        <IconButton icon={X} label={t("common.close")} onPress={() => router.back()} />
      </View>
      {err ? <T color="#C62F36" style={{ paddingHorizontal: space[4] }}>{err}</T> : null}
      <FlatList data={q.trim().length < 3 ? [] : items} keyExtractor={(i) => i.id} renderItem={({ item }) => (
        <ListItem label={item.username} left={<Monogram name={item.username} />} title={<T v="title">{item.username}</T>}
          right={item.relation === "friend" ? <Check size={22} color="#17795A" /> : sent[item.id] || item.relation === "pending_out" ? <Clock size={22} color="#888" /> : <IconButton icon={UserPlus} label={t("friends.add")} filled onPress={() => void add(item)} />} />
      )} />
    </Screen>
  );
}
