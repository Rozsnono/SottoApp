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
  payload: { event?: ChatEvent; text?: string; ttl?: number } | null;
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
/** Beszélgetés-szintű rendszer-sor (téma, eltűnés-beállítás). */
export const isNotice = (m: EventMsg) => m.type === "event" && (m.payload?.event?.kind === "theme" || m.payload?.event?.kind === "ttl");
/** Buborékként/sorként megjelenítendő üzenet-e (a reakció, szerkesztés, megnyitás események nem). */
export const isVisible = (m: EventMsg) => m.type !== "event" || isNotice(m);

/**
 * Szerkesztések: üzenet-azonosító → legutóbbi új szöveg. Csak az eredeti feladó szerkeszthet (az eseményt ugyanaz a
 * felhasználó küldte, mint a célüzenetet); más küldőtől érkező „szerkesztés” hatástalan.
 */
export function editMap(list: EventMsg[]): Record<string, string> {
  const owner = new Map(list.filter((m) => m.type !== "event").map((m) => [m.id, m.senderId]));
  const out: Record<string, string> = {};
  for (const m of list.filter((x) => x.type === "event" && x.payload?.event?.kind === "edit").sort(order)) {
    const ev = m.payload!.event as Extract<ChatEvent, { kind: "edit" }>;
    if (owner.get(ev.target) === m.senderId && ev.text.trim()) out[ev.target] = ev.text;
  }
  return out;
}

/** A szerkesztések ráégetése a szöveges üzenetekre (az `edited` jelző a megjelenítéshez). Nem módosítja a bemenetet. */
export function withEdits<T extends EventMsg>(list: T[]): (T & { edited?: boolean })[] {
  const edits = editMap(list);
  return list.map((m) => (m.type === "text" && edits[m.id] !== undefined && m.payload ? { ...m, payload: { ...m.payload, text: edits[m.id] }, edited: true } : m));
}

/** Eltűnő üzenetek aktuális időtartama (ms), `null` ha ki van kapcsolva. */
export function currentTtl(list: EventMsg[]): number | null {
  const t = list.filter((x) => x.type === "event" && x.payload?.event?.kind === "ttl").sort(order).at(-1);
  return t ? (t.payload!.event as Extract<ChatEvent, { kind: "ttl" }>).ms : null;
}

/** Azok az (egyszeri) médiaüzenetek, amelyeket a másik fél már megnyitott (az „opened” eseményből). */
export function openedSet(list: EventMsg[]): Set<string> {
  const owner = new Map(list.filter((m) => m.type !== "event").map((m) => [m.id, m.senderId]));
  const out = new Set<string>();
  for (const m of list) {
    const ev = m.type === "event" ? m.payload?.event : undefined;
    if (ev?.kind === "opened" && owner.get(ev.target) !== undefined && owner.get(ev.target) !== m.senderId) out.add(ev.target);
  }
  return out;
}

/** Lejárt-e az eltűnő üzenet (`ttl` a létrehozástól számítva). */
export const isExpired = (m: { createdAt: number; payload: { ttl?: number } | null }, now: number): boolean => !!m.payload?.ttl && m.createdAt + m.payload.ttl <= now;
