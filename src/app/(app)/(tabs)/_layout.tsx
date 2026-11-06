/** Alsó tab-sáv: csak ikonok (kötelező akadálymentességi címkével), az aktív ikon vastagabb és accent színű. */
import { Tabs } from "expo-router";
import { MessageCircle, Settings, Users } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { useStore } from "@/lib/store";
import { chat } from "@/state/chat";
import { size, useTheme } from "@/theme";

export default function TabsLayout() {
  const { c } = useTheme();
  const { t } = useTranslation();
  const requests = useStore(chat, (s) => s.incoming.length);
  const opt = (title: string, Icon: typeof Users, badge?: number) => ({
    title,
    tabBarAccessibilityLabel: title,
    tabBarBadge: badge || undefined,
    tabBarIcon: ({ color, focused }: { color: import("react-native").ColorValue; focused: boolean }) => <Icon size={size.icon} color={String(color)} strokeWidth={focused ? 2.6 : 1.8} />,
  });
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarShowLabel: false, tabBarActiveTintColor: c.accent, tabBarInactiveTintColor: c.textMuted, tabBarStyle: { backgroundColor: c.surface, borderTopColor: c.border } }}>
      <Tabs.Screen name="index" options={opt(t("chats.title"), MessageCircle)} />
      <Tabs.Screen name="friends" options={opt(t("friends.title"), Users, requests)} />
      <Tabs.Screen name="settings" options={opt(t("settings.title"), Settings)} />
    </Tabs>
  );
}
