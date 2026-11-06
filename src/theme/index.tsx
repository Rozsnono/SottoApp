import { useColorScheme } from "react-native";
import { colors, contactColors, type ContactColor, type Palette } from "./tokens";

export * from "./tokens";

/** Aktuális paletta a rendszer világos/sötét beállítása szerint. */
export function useTheme(): { c: Palette; dark: boolean; tint: (k: ContactColor | null | undefined) => string | null } {
  const dark = useColorScheme() === "dark";
  const c = dark ? colors.dark : colors.light;
  return { c, dark, tint: (k) => (k ? (dark ? contactColors.dark[k] : contactColors.light[k]) : null) };
}
