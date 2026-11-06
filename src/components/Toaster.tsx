/** A toast-ok megjelenítése: a képernyő tetején (a biztonságos területen belül), a tartalom fölött. */
import { Pressable, View } from "react-native";
import Animated, { FadeInUp, FadeOutUp, LinearTransition, useReducedMotion, FadeIn, FadeOut } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CircleAlert, CircleCheck, Info, X } from "lucide-react-native";
import { useStore } from "@/lib/store";
import { dismissToast, toasts, type ToastKind } from "@/state/toast";
import { radius, size, space, useTheme } from "@/theme";
import { T } from "./ui";

const ICON = { error: CircleAlert, success: CircleCheck, info: Info } as const;

export function Toaster() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const items = useStore(toasts, (s) => s.items);
  const reduce = useReducedMotion();
  const color = (k: ToastKind) => (k === "error" ? c.danger : k === "success" ? c.success : c.accent);
  return (
    <View pointerEvents="box-none" style={{ position: "absolute", top: insets.top + space[2], left: space[3], right: space[3], gap: space[2], zIndex: 1000, elevation: 1000 }}>
      {items.map((t) => {
        const Icon = ICON[t.kind];
        return (
          <Animated.View key={t.id} layout={reduce ? undefined : LinearTransition} entering={reduce ? FadeIn.duration(140) : FadeInUp.duration(220)} exiting={reduce ? FadeOut.duration(140) : FadeOutUp.duration(180)}>
            <Pressable accessibilityRole="alert" accessibilityLiveRegion={t.kind === "error" ? "assertive" : "polite"} accessibilityLabel={t.text} onPress={() => dismissToast(t.id)}
              style={{ flexDirection: "row", alignItems: "center", gap: space[3], padding: space[3], borderRadius: radius.lg, backgroundColor: c.surface, borderWidth: 1, borderColor: color(t.kind), shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 6 }}>
              <Icon size={size.icon} color={color(t.kind)} />
              <T style={{ flex: 1 }}>{t.text}</T>
              <X size={size.iconSm} color={c.textMuted} />
            </Pressable>
          </Animated.View>
        );
      })}
    </View>
  );
}
