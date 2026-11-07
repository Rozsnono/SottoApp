/** Alkalmazás-ikon (álca): az app ikonja átváltható semleges (Számológép, Jegyzetek) ikonra; az eszköz kezdőképernyőjén látszik. */
import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { getAppIconName, setAlternateAppIcon, supportsAlternateIcons } from "expo-alternate-app-icons";
import { Calculator, Check, ChevronLeft, Lock, NotebookPen } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { IconButton, ListItem, Screen, T } from "@/components/ui";
import { toast } from "@/state/toast";
import { size, space, useTheme } from "@/theme";

const OPTIONS = [
  { name: null, key: "iconSotto", Icon: Lock },
  { name: "Calculator", key: "iconCalc", Icon: Calculator },
  { name: "Notes", key: "iconNotes", Icon: NotebookPen },
] as const;

export default function AppIcon() {
  const { t } = useTranslation();
  const { c } = useTheme();
  const [current, setCurrent] = useState<string | null>(() => (supportsAlternateIcons ? getAppIconName() ?? null : null));
  const pick = async (name: string | null) => {
    try {
      await setAlternateAppIcon(name);
      setCurrent(name);
      toast.info(t("settings.iconNote"));
    } catch (e) {
      console.warn("[icon] ikoncsere sikertelen", e instanceof Error ? e.message : e);
      toast.error(t("common.error"));
    }
  };
  return (
    <Screen>
      <View style={{ paddingHorizontal: space[2] }}><IconButton icon={ChevronLeft} label={t("common.back")} onPress={() => router.back()} /></View>
      <T v="h1" style={{ paddingHorizontal: space[4], paddingBottom: space[2] }}>{t("settings.appIcon")}</T>
      {!supportsAlternateIcons ? <T muted style={{ padding: space[4] }}>{t("settings.iconUnsupported")}</T> : OPTIONS.map(({ name, key, Icon }) => (
        <ListItem key={key} label={t(`settings.${key}`)} left={<Icon size={size.icon} color={c.text} />} title={<T v="title">{t(`settings.${key}`)}</T>} onPress={() => void pick(name)}
          right={current === name ? <Check size={size.icon} color={c.accent} /> : undefined} />
      ))}
    </Screen>
  );
}
