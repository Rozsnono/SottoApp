/**
 * A saját párbeszédablak megjelenítője. RN `Modal`-ban él, így minden natív képernyő-modal (kamera, nézegető) fölött is
 * látszik. A veszélyes művelet gombja piros; a háttér/vissza a „cancel” gombot hívja.
 */
import { Modal, Pressable, View } from "react-native";
import Animated, { FadeIn, FadeOut, ZoomIn, useReducedMotion } from "react-native-reanimated";
import { useStore } from "@/lib/store";
import { closeDialog, dialogStore, type DialogAction } from "@/state/dialog";
import { radius, size, space, useTheme } from "@/theme";
import { T } from "./ui";

export function DialogHost() {
  const { c } = useTheme();
  const spec = useStore(dialogStore, (s) => s.current);
  const reduce = useReducedMotion();
  if (!spec) return null;
  const Icon = spec.icon;
  const dismiss = () => {
    const cancel = spec.actions.find((a) => a.style === "cancel");
    closeDialog();
    cancel?.onPress?.();
  };
  const press = (a: DialogAction) => { closeDialog(); a.onPress?.(); };
  const color = (a: DialogAction) => (a.style === "destructive" ? c.danger : a.style === "cancel" ? c.textMuted : c.accent);
  return (
    <Modal transparent visible animationType="none" onRequestClose={dismiss} statusBarTranslucent>
      <Animated.View entering={FadeIn.duration(140)} exiting={FadeOut.duration(120)} style={{ flex: 1, backgroundColor: c.overlay, alignItems: "center", justifyContent: "center", padding: space[6] }}>
        <Pressable accessibilityLabel={spec.title} style={{ position: "absolute", inset: 0 }} onPress={dismiss} />
        <Animated.View entering={reduce ? FadeIn.duration(140) : ZoomIn.duration(180)} accessibilityViewIsModal style={{ width: "100%", maxWidth: 360, backgroundColor: c.surface, borderRadius: radius.lg + 8, padding: space[5], gap: space[3], borderWidth: 1, borderColor: c.border }}>
          {Icon ? <Icon size={size.iconLg} color={spec.actions.some((a) => a.style === "destructive") ? c.danger : c.accent} /> : null}
          <T v="h2">{spec.title}</T>
          {spec.message ? <T muted>{spec.message}</T> : null}
          <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: space[2], marginTop: space[2] }}>
            {spec.actions.map((a, i) => (
              <Pressable key={i} accessibilityRole="button" accessibilityLabel={a.label} onPress={() => press(a)}
                style={({ pressed }) => ({ minHeight: size.touchMin, paddingHorizontal: space[4], borderRadius: radius.md, alignItems: "center", justifyContent: "center", backgroundColor: a.style === "destructive" ? c.danger : pressed ? c.surfaceAlt : "transparent" })}>
                <T v="title" color={a.style === "destructive" ? "#fff" : color(a)}>{a.label}</T>
              </Pressable>
            ))}
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}
