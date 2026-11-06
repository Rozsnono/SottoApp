/** Saját párbeszédablak (a natív `Alert` helyett): megerősítés és választás gombokkal. */
import type { LucideIcon } from "lucide-react-native";
import { createStore } from "@/lib/store";
import i18n from "@/i18n";

export interface DialogAction {
  label: string;
  /** `cancel`: háttérre koppintás / vissza gomb ezt hívja; `destructive`: piros. */
  style?: "default" | "cancel" | "destructive";
  onPress?: () => void;
}
export interface DialogSpec {
  title: string;
  message?: string;
  icon?: LucideIcon;
  actions: DialogAction[];
}

export const dialogStore = createStore<{ current: DialogSpec | null }>({ current: null });

export function showDialog(spec: DialogSpec): void {
  dialogStore.set({ current: spec });
}
export function closeDialog(): void {
  dialogStore.set({ current: null });
}

/** Megerősítés: `onConfirm` fut, ha a felhasználó a megerősítő gombot választja. */
export function confirmDialog(o: { title: string; message?: string; confirmLabel?: string; destructive?: boolean; icon?: LucideIcon; onConfirm: () => void }): void {
  showDialog({
    title: o.title,
    message: o.message,
    icon: o.icon,
    actions: [
      { label: i18n.t("common.cancel"), style: "cancel" },
      { label: o.confirmLabel ?? i18n.t("common.confirm"), style: o.destructive ? "destructive" : "default", onPress: o.onConfirm },
    ],
  });
}
