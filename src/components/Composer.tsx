/**
 * Üzenetszerkesztő. A Küldés gomb hosszú nyomásra előugrót nyit (SendMenu): sima / rejtett küldés – nincs külön kapcsoló.
 * Csatolás: kamera (fotó/videó), galéria.
 */
import { useState } from "react";
import { Modal, Pressable, TextInput, View } from "react-native";
import * as Haptics from "expo-haptics";
import { Camera, EyeOff, Image as ImageIcon, Paperclip, Reply, Send, Video, X } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { radius, size, space, type as ty, useTheme } from "@/theme";
import { IconButton, T } from "./ui";
import type { ReplyRef } from "@/crypto/message";

/** Küldés gomb + SendMenu; `onSend(hidden)`. */
export function SendButton({ onSend, disabled }: { onSend: (hidden: boolean) => void; disabled?: boolean }) {
  const { c } = useTheme();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const pick = (hidden: boolean) => { setOpen(false); onSend(hidden); };
  return (
    <View>
      <IconButton icon={Send} label={t("chat.send")} filled disabled={disabled} onPress={() => onSend(false)} onLongPress={() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setOpen(true); }} />
      <Modal transparent visible={open} animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable accessibilityLabel={t("common.close")} style={{ flex: 1, backgroundColor: c.overlay, justifyContent: "flex-end", alignItems: "flex-end", padding: space[4], paddingBottom: 96 }} onPress={() => setOpen(false)}>
          <View style={{ gap: space[3], alignItems: "center" }}>
            <Pressable accessibilityRole="button" accessibilityLabel={t("chat.sendHidden")} onPress={() => pick(true)} style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: c.surface, alignItems: "center", justifyContent: "center" }}><EyeOff size={size.iconLg} color={c.text} /></Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={t("chat.sendNormal")} onPress={() => pick(false)} style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: c.accent, alignItems: "center", justifyContent: "center" }}><Send size={size.iconLg} color={c.onAccent} /></Pressable>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

export function Composer({ onSendText, onCamera, onGallery, disabled, reply, replyName, onCancelReply }: { onSendText: (text: string, hidden: boolean) => void; onCamera: () => void; onGallery: () => void; disabled?: boolean; reply?: ReplyRef | null; replyName?: string; onCancelReply?: () => void }) {
  const { c } = useTheme();
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const [attach, setAttach] = useState(false);
  return (
    <View style={{ borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.bg, padding: space[2], gap: space[2] }}>
      {reply ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: space[2], paddingHorizontal: space[2] }}>
          <Reply size={size.iconSm} color={c.accent} />
          <View style={{ flex: 1, borderLeftWidth: 3, borderLeftColor: c.accent, paddingLeft: space[2] }}>
            <T v="caption" muted>{replyName}</T>
            {reply.hidden ? <EyeOff size={14} color={c.textMuted} /> : reply.kind === "image" ? <ImageIcon size={14} color={c.textMuted} /> : reply.kind === "video" ? <Video size={14} color={c.textMuted} /> : <T v="bodySm" numberOfLines={1}>{reply.snippet}</T>}
          </View>
          <IconButton icon={X} label={t("common.cancel")} onPress={onCancelReply} />
        </View>
      ) : null}
      {attach ? (
        <View style={{ flexDirection: "row", gap: space[2], paddingHorizontal: space[2] }}>
          <IconButton icon={Camera} label={t("chat.camera")} onPress={() => { setAttach(false); onCamera(); }} />
          <IconButton icon={ImageIcon} label={t("chat.gallery")} onPress={() => { setAttach(false); onGallery(); }} />
        </View>
      ) : null}
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: space[1] }}>
        <IconButton icon={attach ? X : Paperclip} label={t("chat.attach")} onPress={() => setAttach((v) => !v)} disabled={disabled} />
        <TextInput accessibilityLabel={t("chat.placeholder")} placeholder={t("chat.placeholder")} placeholderTextColor={c.textMuted} value={text} onChangeText={setText} multiline editable={!disabled}
          style={[ty.body, { flex: 1, maxHeight: 5 * 22 + 20, minHeight: size.touchMin, color: c.text, backgroundColor: c.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, paddingHorizontal: space[3], paddingTop: 10, paddingBottom: 10 }]} />
        <SendButton disabled={disabled || !text.trim()} onSend={(hidden) => { onSendText(text, hidden); setText(""); }} />
      </View>
    </View>
  );
}

export { Video };
