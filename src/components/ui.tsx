/**
 * Alap UI-elemek (docs/design/06-components.md): Text, Button, IconButton, TextField, Monogram, Banner, EmptyState,
 * ListItem, ColorPicker, SegmentedIcons. Ikon-központú; minden interaktív elemnek kötelező `label` (akadálymentesség).
 */
import { useState, type ReactNode } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Pressable, StyleSheet, Text, TextInput, View, type StyleProp, type TextInputProps, type TextStyle, type ViewStyle } from "react-native";
import { Check, Eye, EyeOff, type LucideIcon } from "lucide-react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { CONTACT_COLOR_KEYS, contactColors, radius, size, space, type as ty, useTheme, type ContactColor } from "@/theme";

export function Screen({ children, style, edges }: { children: ReactNode; style?: StyleProp<ViewStyle>; edges?: ("top" | "bottom" | "left" | "right")[] }) {
  const { c } = useTheme();
  return <SafeAreaView edges={edges ?? ["top", "bottom"]} style={[{ flex: 1, backgroundColor: c.bg }, style]}>{children}</SafeAreaView>;
}

/** Billentyűzet elől kitérő tároló: a beviteli mező mindig látszik (iOS és Android edge-to-edge is). */
export function Kav({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <KeyboardAvoidingView behavior="padding" style={[{ flex: 1 }, style]}>{children}</KeyboardAvoidingView>;
}

type Variant = keyof typeof ty;
export function T({ v = "body", muted, color, style, children, ...rest }: { v?: Variant; muted?: boolean; color?: string; style?: StyleProp<TextStyle>; children?: ReactNode } & Omit<import("react-native").TextProps, "style">) {
  const { c } = useTheme();
  return <Text {...rest} style={[ty[v], { color: color ?? (muted ? c.textMuted : c.text) }, style]}>{children}</Text>;
}

/** Nyomásra .98-ra kicsinyedő nyomógomb-alap (reduced-motion: a rendszer beállítását a Reanimated tiszteletben tartja). */
function Press({ onPress, onLongPress, disabled, label, style, children, hitSlop }: { onPress?: () => void; onLongPress?: () => void; disabled?: boolean; label: string; style?: StyleProp<ViewStyle>; children: ReactNode; hitSlop?: number }) {
  const s = useSharedValue(1);
  const a = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={onPress} onLongPress={onLongPress} hitSlop={hitSlop}
      onPressIn={() => s.set(withTiming(0.98, { duration: 80 }))} onPressOut={() => s.set(withTiming(1, { duration: 80 }))}>
      <Animated.View style={[a, style]}>{children}</Animated.View>
    </Pressable>
  );
}

export function Button({ title, icon: Icon, onPress, variant = "primary", loading, disabled, label, style }: { title?: string; icon?: LucideIcon; onPress: () => void; variant?: "primary" | "secondary" | "ghost" | "danger"; loading?: boolean; disabled?: boolean; label?: string; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  const bg = variant === "primary" ? c.accent : variant === "danger" ? c.danger : variant === "secondary" ? c.surfaceAlt : "transparent";
  const fg = variant === "primary" ? c.onAccent : variant === "danger" ? "#fff" : c.text;
  const off = disabled || loading;
  return (
    <Press label={label ?? title ?? ""} onPress={onPress} disabled={off} style={[st.btn, { backgroundColor: bg, borderColor: variant === "secondary" ? c.border : "transparent", opacity: off && !loading ? 0.45 : 1 }, style]}>
      {loading ? <ActivityIndicator color={fg} /> : Icon ? <Icon size={size.icon} color={fg} /> : null}
      {title ? <T v="title" color={fg}>{title}</T> : null}
    </Press>
  );
}

export function IconButton({ icon: Icon, label, onPress, onLongPress, filled, color, disabled, iconSize }: { icon: LucideIcon; label: string; onPress?: () => void; onLongPress?: () => void; filled?: boolean; color?: string; disabled?: boolean; iconSize?: number }) {
  const { c } = useTheme();
  return (
    <Press label={label} onPress={onPress} onLongPress={onLongPress} disabled={disabled} style={[st.iconBtn, filled && { backgroundColor: c.accent }, disabled && { opacity: 0.45 }]}>
      <Icon size={iconSize ?? size.icon} color={filled ? c.onAccent : (color ?? c.text)} />
    </Press>
  );
}

export function TextField({ label, icon: Icon, secure, error, ok, ...rest }: { label: string; icon?: LucideIcon; secure?: boolean; error?: string | null; ok?: boolean } & TextInputProps) {
  const { c } = useTheme();
  const [show, setShow] = useState(false);
  return (
    <View style={{ gap: space[1] }}>
      <View style={[st.field, { backgroundColor: c.surface, borderColor: error ? c.danger : c.border }]}>
        {Icon ? <Icon size={size.icon} color={c.textMuted} /> : null}
        <TextInput accessibilityLabel={label} placeholder={label} placeholderTextColor={c.textMuted} secureTextEntry={secure && !show} autoCapitalize="none" autoCorrect={false} {...rest} style={[ty.body, { flex: 1, color: c.text, height: size.inputHeight - 2 }, rest.style]} />
        {ok ? <Check size={size.icon} color={c.success} /> : null}
        {secure ? <IconButton icon={show ? EyeOff : Eye} label={label} onPress={() => setShow((v) => !v)} /> : null}
      </View>
      {error ? <T v="caption" color={c.danger}>{error}</T> : null}
    </View>
  );
}

export function Monogram({ name, tint, px = 44, unavailable }: { name: string; tint?: string | null; px?: number; unavailable?: boolean }) {
  const { c } = useTheme();
  return (
    <View style={{ width: px, height: px, borderRadius: px / 2, backgroundColor: unavailable ? c.surfaceAlt : (tint ?? c.accentSoft), alignItems: "center", justifyContent: "center" }}>
      <T v={px > 40 ? "title" : "bodySm"} color={unavailable ? c.textMuted : c.text}>{(name[0] ?? "?").toUpperCase()}</T>
    </View>
  );
}

export function Banner({ icon: Icon, text, tone = "warning", children }: { icon: LucideIcon; text: string; tone?: "warning" | "danger" | "neutral"; children?: ReactNode }) {
  const { c } = useTheme();
  const col = tone === "danger" ? c.danger : tone === "warning" ? c.warning : c.textMuted;
  return (
    <View accessibilityRole="alert" style={[st.banner, { backgroundColor: c.surfaceAlt, borderColor: col }]}>
      <Icon size={size.iconSm} color={col} />
      <T v="bodySm" style={{ flex: 1 }}>{text}</T>
      {children}
    </View>
  );
}

export function EmptyState({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
  const { c } = useTheme();
  return (
    <View style={{ alignItems: "center", gap: space[3], padding: space[8] }}>
      <Icon size={size.iconLg * 2} color={c.textMuted} strokeWidth={1.5} />
      <T muted>{text}</T>
    </View>
  );
}

export function ListItem({ left, title, right, onPress, label, onLongPress }: { left?: ReactNode; title: ReactNode; right?: ReactNode; onPress?: () => void; onLongPress?: () => void; label: string }) {
  const { c } = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} onLongPress={onLongPress} style={({ pressed }) => [st.item, { backgroundColor: pressed ? c.surfaceAlt : "transparent" }]}>
      {left}
      <View style={{ flex: 1 }}>{title}</View>
      {right}
    </Pressable>
  );
}

export function ColorPicker({ value, onChange, labels }: { value?: string | null; onChange: (c: ContactColor | null) => void; labels: (k: ContactColor) => string }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[3] }}>
      {CONTACT_COLOR_KEYS.map((k) => (
        <Pressable key={k} accessibilityRole="radio" accessibilityLabel={labels(k)} accessibilityState={{ selected: value === k }} onPress={() => onChange(value === k ? null : k)}
          style={{ width: size.touchMin, height: size.touchMin, borderRadius: radius.full, backgroundColor: contactColors.dot[k], alignItems: "center", justifyContent: "center", borderWidth: value === k ? 3 : 0, borderColor: c.text }}>
          {value === k ? <Check size={size.icon} color="#fff" /> : null}
        </Pressable>
      ))}
    </View>
  );
}

export function SegmentedIcons<K extends string>({ value, onChange, items }: { value: K; onChange: (k: K) => void; items: { key: K; icon: LucideIcon; label: string }[] }) {
  const { c } = useTheme();
  return (
    <View style={[st.seg, { backgroundColor: c.surfaceAlt }]}>
      {items.map(({ key, icon: Icon, label }) => (
        <Pressable key={key} accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{ selected: value === key }} onPress={() => onChange(key)} style={[st.segCell, value === key && { backgroundColor: c.accent }]}>
          <Icon size={size.icon} color={value === key ? c.onAccent : c.text} />
        </Pressable>
      ))}
    </View>
  );
}

const st = StyleSheet.create({
  btn: { minHeight: size.buttonHeight, borderRadius: radius.lg, paddingHorizontal: space[5], flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space[2], borderWidth: 1 },
  iconBtn: { width: size.touchMin, height: size.touchMin, borderRadius: radius.full, alignItems: "center", justifyContent: "center" },
  field: { minHeight: size.inputHeight, borderRadius: radius.md, borderWidth: 1, paddingHorizontal: space[3], flexDirection: "row", alignItems: "center", gap: space[2] },
  banner: { flexDirection: "row", alignItems: "center", gap: space[2], padding: space[3], borderRadius: radius.md, borderWidth: 1 },
  item: { minHeight: 64, paddingHorizontal: space[4], paddingVertical: space[2], flexDirection: "row", alignItems: "center", gap: space[3] },
  seg: { flexDirection: "row", borderRadius: radius.md, padding: 2 },
  segCell: { flex: 1, minHeight: size.touchMin, borderRadius: radius.md - 2, alignItems: "center", justifyContent: "center" },
});
