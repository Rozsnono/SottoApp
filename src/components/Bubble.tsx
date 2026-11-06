/** Üzenetbuborék, rejtett (koppintásra felfedhető) buborék, zárt média-csempe és olvasás-jelző. */
import { memo } from "react";
import { Pressable, View } from "react-native";
import Animated, { FadeIn, FadeInDown, useReducedMotion } from "react-native-reanimated";
import { AlertCircle, Check, CheckCheck, Clock, EyeOff, Image as ImageIcon, Lock, ShieldAlert, Video } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { radius, size, space, useTheme } from "@/theme";
import { T } from "./ui";
import type { Msg } from "@/state/chat";
import { markRead } from "@/state/chat";
import type { ReactionSummary } from "@/lib/events";
import { reveal, revealed } from "@/state/reveal";
import { useStore } from "@/lib/store";

function Receipt({ status }: { status: Msg["status"] }) {
  const { c } = useTheme();
  const { t } = useTranslation();
  if (status === "pending") return <Clock size={14} color={c.textMuted} accessibilityLabel={t("chat.sending")} />;
  if (status === "failed") return <AlertCircle size={14} color={c.danger} accessibilityLabel={t("chat.failed")} />;
  if (status === "read") return <CheckCheck size={14} color={c.accent} accessibilityLabel={t("chat.read")} />;
  return <Check size={14} color={c.textMuted} accessibilityLabel={t("chat.sent")} />;
}

const fmtDuration = (ms?: number) => (ms ? `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}` : "");

/** Zárt csempe: nincs előnézet; koppintásra teljes képernyős nézet nyílik. */
function MediaTile({ m, onOpen, outColor }: { m: Msg; onOpen: () => void; outColor: string }) {
  const { c } = useTheme();
  const { t } = useTranslation();
  const Icon = m.type === "video" ? Video : ImageIcon;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={t("chat.openMedia")} onPress={onOpen} style={{ width: 176, aspectRatio: 4 / 5, borderRadius: radius.bubble, backgroundColor: m.mine ? outColor : c.surfaceAlt, alignItems: "center", justifyContent: "center", gap: space[2] }}>
      <Icon size={size.iconLg * 1.5} color={m.mine ? c.onBubbleOut : c.text} />
      {m.type === "video" && m.payload?.media?.durationMs ? <T v="caption" color={m.mine ? c.onBubbleOut : c.text}>{fmtDuration(m.payload.media.durationMs)}</T> : null}
      {m.payload?.hidden ? <EyeOff size={size.iconSm} color={m.mine ? c.onBubbleOut : c.textMuted} style={{ position: "absolute", top: 10, right: 10 }} /> : null}
      {m.status === "pending" && m.progress !== undefined ? <T v="caption" color={m.mine ? c.onBubbleOut : c.text} style={{ position: "absolute", bottom: 10 }}>{Math.round(m.progress * 100)}%</T> : null}
    </Pressable>
  );
}

export const MessageBubble = memo(function MessageBubble({ m, tint, outColor, reactions, showReceipt, onLongPress, onOpenMedia, onRetry }: { m: Msg; tint: string | null; outColor?: string; reactions?: ReactionSummary[]; showReceipt: boolean; onLongPress: (m: Msg) => void; onOpenMedia: (m: Msg) => void; onRetry: (m: Msg) => void }) {
  const { c } = useTheme();
  const { t } = useTranslation();
  const reduce = useReducedMotion();
  const isRevealed = useStore(revealed, (s) => !!s.ids[m.id]);
  const hiddenCover = !!m.payload?.hidden && !m.mine && !isRevealed;
  const out = outColor || c.bubbleOut;
  const bg = m.mine ? out : (tint ?? c.bubbleIn);
  const fg = m.mine ? c.onBubbleOut : c.onBubbleIn;

  let body;
  if (m.forged || m.broken) {
    body = (
      <View accessibilityLabel={m.forged ? t("chat.failed") : t("chats.unavailable")} style={{ flexDirection: "row", gap: space[2], alignItems: "center", padding: space[3], borderRadius: radius.bubble, backgroundColor: c.surfaceAlt }}>
        {m.forged ? <ShieldAlert size={size.icon} color={c.danger} /> : <Lock size={size.icon} color={c.textMuted} />}
      </View>
    );
  } else if (m.type !== "text") {
    body = <MediaTile m={m} onOpen={() => onOpenMedia(m)} outColor={out} />;
  } else if (hiddenCover) {
    // A lefedett szöveg a képernyőolvasónak sem hozzáférhető: csak mozaik + ikon (a hossz sem szivárog: fix szélesség).
    body = (
      <Pressable accessibilityRole="button" accessibilityLabel={t("chat.concealed")} onPress={() => { reveal(m.id); void markRead(m); }} style={{ width: 168, height: 48, borderRadius: radius.bubble, backgroundColor: bg, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
        <View style={{ position: "absolute", inset: 0, opacity: 0.18, flexDirection: "row", flexWrap: "wrap" }}>
          {Array.from({ length: 28 }, (_, i) => <View key={i} style={{ width: 24, height: 24, backgroundColor: (i + Math.floor(i / 7)) % 2 ? fg : "transparent" }} />)}
        </View>
        <EyeOff size={size.icon} color={fg} />
      </Pressable>
    );
  } else {
    body = (
      <Animated.View entering={m.payload?.hidden && !m.mine ? (reduce ? FadeIn.duration(140) : FadeIn.duration(220)) : undefined} style={{ backgroundColor: bg, borderRadius: radius.bubble, [m.mine ? "borderBottomRightRadius" : "borderBottomLeftRadius"]: radius.bubbleTail, paddingHorizontal: space[3], paddingVertical: space[2], maxWidth: "100%" }}>
        <T color={fg}>{m.payload?.text}</T>
        {m.payload?.hidden && m.mine ? <EyeOff size={12} color={fg} style={{ alignSelf: "flex-end", marginTop: 2 }} /> : null}
      </Animated.View>
    );
  }

  return (
    <Animated.View entering={reduce ? FadeIn.duration(140) : FadeInDown.duration(220).withInitialValues({ transform: [{ translateY: 12 }] })} style={{ alignItems: m.mine ? "flex-end" : "flex-start", paddingHorizontal: space[4], marginVertical: 2 }}>
      <Pressable onLongPress={() => onLongPress(m)} delayLongPress={350} style={{ maxWidth: "78%" }} accessibilityLabel={undefined}>
        {body}
      </Pressable>
      {reactions?.length ? (
        <View accessibilityLabel={reactions.map((r) => `${r.emoji} ${r.count}`).join(", ")} style={{ flexDirection: "row", gap: 4, marginTop: -6, marginHorizontal: space[2] }}>
          {reactions.map((r) => (
            <View key={r.emoji} style={{ flexDirection: "row", alignItems: "center", gap: 2, paddingHorizontal: 6, paddingVertical: 1, borderRadius: radius.full, backgroundColor: c.surface, borderWidth: 1, borderColor: r.mine ? c.accent : c.border }}>
              <T style={{ fontSize: 13, lineHeight: 18 }}>{r.emoji}</T>
              {r.count > 1 ? <T v="caption" muted>{r.count}</T> : null}
            </View>
          ))}
        </View>
      ) : null}
      {m.mine && (showReceipt || m.status === "failed" || m.status === "pending") ? (
        <Pressable disabled={m.status !== "failed"} onPress={() => onRetry(m)} accessibilityRole="button" accessibilityLabel={m.status === "failed" ? t("chat.retry") : undefined} style={{ marginTop: 2, flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Receipt status={m.status} />
        </Pressable>
      ) : null}
    </Animated.View>
  );
});

/** Középre igazított rendszer-sor (pl. témaváltás). */
export function SystemNotice({ text }: { text: string }) {
  return <View style={{ alignItems: "center", paddingHorizontal: space[6], marginVertical: space[2] }}><T v="caption" muted style={{ textAlign: "center" }}>{text}</T></View>;
}
