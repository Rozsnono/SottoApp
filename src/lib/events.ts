/** Rendszer-események (reakció, téma) feldolgozása a beszélgetés üzenetlistájából – tiszta függvények. */
import type { ChatEvent } from "@/crypto/message";

/** Az eseményekhez szükséges minimális üzenet-alak (a `Msg` kielégíti). */
export interface EventMsg {
  id: string;
  type: string;
  senderId: string;
  mine: boolean;
  seq: number | null;
  createdAt: number;
  payload: { event?: ChatEvent } | null;
}

/** A reakció-emojik (6 db), a hosszú nyomás menüjében ebben a sorrendben. */
export const REACTION_EMOJIS = ["❤️", "😂", "😮", "😢", "👍", "🔥"] as const;

export interface ReactionSummary {
  emoji: string;
  count: number;
  mine: boolean;
}

const order = (a: EventMsg, b: EventMsg) => (a.seq ?? Number.MAX_SAFE_INTEGER) - (b.seq ?? Number.MAX_SAFE_INTEGER) || a.createdAt - b.createdAt;

/**
 * Üzenetenkénti reakció-összesítés. Egy felhasználónak egy üzenetre egy reakciója lehet: a legutóbbi esemény nyer,
 * az `emoji: null` visszavonja.
 */
export function reactionMap(list: EventMsg[]): Record<string, ReactionSummary[]> {
  const latest = new Map<string, Map<string, { emoji: string; mine: boolean }>>();
  for (const m of list.filter((x) => x.type === "event" && x.payload?.event?.kind === "reaction").sort(order)) {
    const ev = m.payload!.event as Extract<ChatEvent, { kind: "reaction" }>;
    const per = latest.get(ev.target) ?? new Map();
    if (ev.emoji) per.set(m.senderId, { emoji: ev.emoji, mine: m.mine });
    else per.delete(m.senderId);
    latest.set(ev.target, per);
  }
  const out: Record<string, ReactionSummary[]> = {};
  for (const [target, per] of latest) {
    const by = new Map<string, ReactionSummary>();
    for (const { emoji, mine } of per.values()) {
      const cur = by.get(emoji) ?? { emoji, count: 0, mine: false };
      cur.count++;
      cur.mine ||= mine;
      by.set(emoji, cur);
    }
    if (by.size) out[target] = [...by.values()].sort((a, b) => b.count - a.count);
  }
  return out;
}

/** A beszélgetés aktuális témája (a legutóbbi témaváltó esemény), vagy `null`. */
export function currentTheme(list: EventMsg[]): string | null {
  const t = list.filter((x) => x.type === "event" && x.payload?.event?.kind === "theme").sort(order).at(-1);
  return t ? (t.payload!.event as Extract<ChatEvent, { kind: "theme" }>).theme : null;
}

export const isThemeEvent = (m: EventMsg) => m.type === "event" && m.payload?.event?.kind === "theme";
/** Buborékként megjelenítendő üzenet-e (a reakció-események nem). */
export const isVisible = (m: EventMsg) => m.type !== "event" || isThemeEvent(m);
