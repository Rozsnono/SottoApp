/**
 * Üzenetszerkesztő. A Küldés gomb hosszú nyomásra előugrót nyit (SendMenu): sima / rejtett küldés – nincs külön kapcsoló.
 * Csatolás: kamera (fotó/videó), galéria.
 */
import { useEffect, useState } from "react";
import { Modal, Pressable, TextInput, View } from "react-native";
import * as Haptics from "expo-haptics";
import { Camera, Check, EyeOff, Flame, Image as ImageIcon, Mic, Paperclip, Pencil, Reply, Send, Video, X } from "lucide-react-native";
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from "expo-audio";
import { useTranslation } from "react-i18next";
import { radius, size, space, type as ty, useTheme } from "@/theme";
import { IconButton, T } from "./ui";
import type { ReplyRef } from "@/crypto/message";
import { toast } from "@/state/toast";

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

/** Hangfelvétel-sáv: koppintásra indul (a Composer mikrofon gombja), ✓ = küldés, × = elvetés. Legfeljebb 2 perc. */
function VoiceBar({ onSend, onCancel }: { onSend: (uri: string, durationMs: number) => void; onCancel: () => void }) {
  const { c } = useTheme();
  const { t } = useTranslation();
  const rec = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const state = useAudioRecorderState(rec, 250);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let off = false;
    (async () => {
      const p = await AudioModule.requestRecordingPermissionsAsync();
      if (!p.granted) { toast.error(t("chat.micDenied")); return onCancel(); }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await rec.prepareToRecordAsync();
      if (off) return;
      rec.record();
      setReady(true);
    })().catch((e) => { console.warn("[voice] felvétel indítása sikertelen", e instanceof Error ? e.message : e); toast.error(t("common.error")); onCancel(); });
    return () => { off = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- egyszeri indítás
  }, []);
  const finish = async () => {
    try {
      const ms = state.durationMillis;
      await rec.stop();
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      if (rec.uri && ms > 500) onSend(rec.uri, ms); else onCancel();
    } catch (e) { console.warn("[voice] leállítás sikertelen", e instanceof Error ? e.message : e); onCancel(); }
  };
  useEffect(() => { if (ready && state.durationMillis >= MAX_VOICE_MS) void finish(); // eslint-disable-next-line react-hooks/exhaustive-deps -- csak a hossz változására
  }, [state.durationMillis, ready]);
  const sec = Math.floor(state.durationMillis / 1000);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space[2] }}>
      <IconButton icon={X} label={t("common.cancel")} onPress={() => { void rec.stop().catch(() => undefined); onCancel(); }} />
      <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: space[2], minHeight: size.touchMin, paddingHorizontal: space[3], borderRadius: radius.lg, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border }}>
        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c.danger }} />
        <T accessibilityLabel={t("chat.recording")}>{`${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`}</T>
      </View>
      <IconButton icon={Send} label={t("chat.send")} filled disabled={!ready} onPress={() => void finish()} />
    </View>
  );
}

const MAX_VOICE_MS = 120_000;

export function Composer({ onSendText, onCamera, onGallery, onSendVoice, disabled, reply, replyName, onCancelReply, once, onToggleOnce, editing, onSubmitEdit, onCancelEdit }: { onSendText: (text: string, hidden: boolean) => void; onCamera: () => void; onGallery: () => void; onSendVoice: (uri: string, durationMs: number) => void; disabled?: boolean; reply?: ReplyRef | null; replyName?: string; onCancelReply?: () => void; once?: boolean; onToggleOnce?: () => void; editing?: { text: string } | null; onSubmitEdit?: (text: string) => void; onCancelEdit?: () => void }) {
  const { c } = useTheme();
  const { t } = useTranslation();
  // A szülő `key`-jel újraépíti a szerkesztő-módba lépéskor, így a kezdőérték a szerkesztendő szöveg.
  const [text, setText] = useState(editing?.text ?? "");
  const [attach, setAttach] = useState(false);
  const [recording, setRecording] = useState(false);
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
      {editing ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: space[2], paddingHorizontal: space[2] }}>
          <Pencil size={size.iconSm} color={c.accent} />
          <T muted style={{ flex: 1 }}>{t("chat.edit")}</T>
          <IconButton icon={X} label={t("common.cancel")} onPress={onCancelEdit} />
        </View>
      ) : null}
      {attach ? (
        <View style={{ flexDirection: "row", gap: space[2], paddingHorizontal: space[2] }}>
          <IconButton icon={Camera} label={t("chat.camera")} onPress={() => { setAttach(false); onCamera(); }} />
          <IconButton icon={ImageIcon} label={t("chat.gallery")} onPress={() => { setAttach(false); onGallery(); }} />
          <IconButton icon={Flame} label={t("chat.once")} filled={once} onPress={() => onToggleOnce?.()} />
        </View>
      ) : null}
      {recording ? <VoiceBar onSend={(uri, ms) => { setRecording(false); onSendVoice(uri, ms); }} onCancel={() => setRecording(false)} /> : (
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: space[1] }}>
        {editing ? null : <IconButton icon={attach ? X : Paperclip} label={t("chat.attach")} onPress={() => setAttach((v) => !v)} disabled={disabled} />}
        <TextInput accessibilityLabel={t("chat.placeholder")} placeholder={t("chat.placeholder")} placeholderTextColor={c.textMuted} value={text} onChangeText={setText} multiline editable={!disabled}
          style={[ty.body, { flex: 1, maxHeight: 5 * 22 + 20, minHeight: size.touchMin, color: c.text, backgroundColor: c.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, paddingHorizontal: space[3], paddingTop: 10, paddingBottom: 10 }]} />
        {editing ? <IconButton icon={Check} label={t("chat.send")} filled disabled={disabled || !text.trim()} onPress={() => onSubmitEdit?.(text)} />
          : text.trim() ? <SendButton disabled={disabled} onSend={(hidden) => { onSendText(text, hidden); setText(""); }} />
          : <IconButton icon={Mic} label={t("chat.voice")} filled disabled={disabled} onPress={() => setRecording(true)} />}
      </View>
      )}
    </View>
  );
}

export { Video };
