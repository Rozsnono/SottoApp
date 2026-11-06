/** Értesítő sávok (toast): hiba, siker, tájékoztatás. Felülről jelennek meg és felül maradnak. */
import { createStore } from "@/lib/store";
import { errorText } from "@/lib/errors";

export type ToastKind = "error" | "success" | "info";
export interface ToastItem {
  id: number;
  kind: ToastKind;
  text: string;
}

export const toasts = createStore<{ items: ToastItem[] }>({ items: [] });
let seq = 0;
const MAX = 3;
const DURATION: Record<ToastKind, number> = { error: 6000, success: 3500, info: 4000 };

export function dismissToast(id: number): void {
  toasts.set((s) => ({ items: s.items.filter((t) => t.id !== id) }));
}

export function showToast(kind: ToastKind, text: string): void {
  // Azonos, még látható szöveget nem duplikálunk.
  if (toasts.get().items.some((t) => t.text === text && t.kind === kind)) return;
  const id = ++seq;
  toasts.set((s) => ({ items: [...s.items, { id, kind, text }].slice(-MAX) }));
  setTimeout(() => dismissToast(id), DURATION[kind]);
}

export const toast = {
  error: (text: string) => showToast("error", text),
  success: (text: string) => showToast("success", text),
  info: (text: string) => showToast("info", text),
  /** Kivételből felhasználónak szánt hibaüzenet (a részlet logba megy, lásd errorText). */
  fail: (e: unknown) => showToast("error", errorText(e)),
};
