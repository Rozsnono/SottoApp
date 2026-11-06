/**
 * Felfedett rejtett üzenetek (csak memóriában). Az app háttérbe kerülésekor mind visszafedődik,
 * így a rejtett tartalom nem marad látható.
 */
import { AppState } from "react-native";
import { createStore } from "@/lib/store";

export const revealed = createStore<{ ids: Record<string, true> }>({ ids: {} });
export const reveal = (id: string) => revealed.set((s) => ({ ids: { ...s.ids, [id]: true } }));
export const coverAll = () => revealed.set({ ids: {} });

AppState.addEventListener("change", (st) => {
  if (st !== "active") coverAll();
});
