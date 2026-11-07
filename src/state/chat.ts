/**
 * A chat motor: szinkron (monoton kurzor), visszafejtés, aláírás-ellenőrzés, küldés újrapróbálással, olvasás,
 * törlés, ismerősök, beszélgetések. A nyílt szöveg KIZÁRÓLAG memóriában él (újraindításkor a szerverről
 * újraszinkronizálunk és visszafejtünk). A push csak ébresztő jel; a lekérdezés előtérben időzített.
 */
import { AppState } from "react-native";
import { api, ApiError } from "@/lib/api";
import { createStore } from "@/lib/store";
import { loadMeta, saveMeta, wipeMeta, type Meta } from "@/lib/meta";
import { SYNC_INTERVAL_MS } from "@/config";
import { session, setSessionEndedHandler } from "./session";
import { uuidv4 } from "@/crypto/keys";
import { buildOutgoing, openWire, verifyWire, type ChatEvent, type MessageType, type Payload, type ReplyRef, type Recipients, type WireMessage } from "@/crypto/message";
import { decryptPrefs, encryptPrefs, type ContactPrefs } from "@/crypto/prefs";
import { dropMediaConfig, encryptAndUpload, purgeTemp, releaseCapture } from "@/services/media";
import { loadOutbox, saveOutbox, type OutboxEntry } from "@/lib/outbox";
import { currentTtl, isExpired } from "@/lib/events";
import { MAX_TEXT_CIPHERTEXT_CHARS, type REPORT_REASONS } from "@/protocol/constants";
import { sealForPublicKey } from "@/protocol/wrap";

export interface Peer { id: string; username: string; identityPublicKey: string; identitySigningPublicKey: string }
export interface Conv {
  id: string;
  archived: boolean;
  available: boolean;
  mutedUntil: string | null;
  other: { id: string; username: string | null; identityPublicKey?: string; identitySigningPublicKey?: string };
}
export type MsgStatus = "pending" | "failed" | "sent" | "read";
export interface Msg {
  /** Szerver-azonosító; küldés közben a clientMessageId. */
  id: string;
  clientMessageId: string;
  convId: string;
  senderId: string;
  mine: boolean;
  type: MessageType;
  payload: Payload | null;
  /** Nem fejthető vissza / nincs hozzá kulcs / sérült. */
  broken: boolean;
  /** Az aláírás nem egyezik a küldő ismert kulcsával. */
  forged: boolean;
  status: MsgStatus;
  seq: number | null;
  createdAt: number;
  /** Mikor olvasta el a másik fél (saját üzeneteknél, ha a szerver visszaigazolta). */
  readAt?: number;
  /** Szerkesztett szöveg (a megjelenítéshez; a `withEdits` állítja). */
  edited?: boolean;
  mediaRef: string | null;
  /** Helyi (küldés előtti) forrás-URI a feltöltés újrapróbálásához. */
  localUri?: string;
  progress?: number;
}
interface FriendEntry { friendshipId: string; user: Peer; conversationId: string | null }
interface ChatState {
  ready: boolean;
  online: boolean;
  conversations: Conv[];
  messages: Record<string, Msg[]>;
  friends: FriendEntry[];
  incoming: FriendEntry[];
  outgoing: FriendEntry[];
  prefs: Record<string, ContactPrefs>;
  /** userId → a partner kulcsa megváltozott az első látott óta. */
  keyChanged: Record<string, boolean>;
  readIds: Record<string, true>;
  /** userId → ellenőrzött biztonsági szám (ujjlenyomat); kulcsváltáskor már nem egyezik. */
  verified: Record<string, string>;
  /** convId → törölt szekvencia-határ (lásd Meta.cleared). */
  cleared: Record<string, number>;
  /** Megnyitott egyszeri médiák (üzenet-azonosító). */
  consumed: Record<string, true>;
  /** userId → aktivitás (ismerősök; csak ha mindkét fél megosztja). `online`: a lekéréskor aktív volt. */
  activity: Record<string, { online: boolean; at: number }>;
}

export const chat = createStore<ChatState>({ ready: false, online: true, conversations: [], messages: {}, friends: [], incoming: [], outgoing: [], prefs: {}, keyChanged: {}, readIds: {}, verified: {}, cleared: {}, consumed: {}, activity: {} });

/** A szerverről kapott (titkosított) üzenetek – a jelentéshez újra kinyitjuk a kulcsot; nyílt tartalmat nem tartalmaz. */
const wires = new Map<string, WireMessage>();
let meta: Meta = { readIds: [], pins: {}, verified: {}, cleared: {}, consumed: [] };
let cursor = "0";
let timer: ReturnType<typeof setInterval> | null = null;
let sweeper: ReturnType<typeof setInterval> | null = null;
let polling = false;
let paused = false;
/** Zárolt állapotban nem szinkronizálunk (nyílt tartalom nem kerülhet vissza a memóriába). */
export const pausePolling = (p: boolean) => { paused = p; };
let appSub: { remove(): void } | null = null;

/** Értesítést kiváltó esemény (új üzenet / új ismerős-kérés); a megjelenítés a `services/notify.ts` dolga. */
export type Incoming = { kind: "message"; convId: string; name: string } | { kind: "request"; name: string };
let incomingHandler: ((e: Incoming) => void) | null = null;
export const setIncomingHandler = (fn: ((e: Incoming) => void) | null) => { incomingHandler = fn; };
/** Az éppen megnyitott beszélgetés (ott nincs értesítés, ha az app előtérben van). */
let activeConv: string | null = null;
export const setActiveConv = (id: string | null) => { activeConv = id; };
let pollCount = 0;

const sortMsgs = (a: Msg, b: Msg) => (a.seq ?? Number.MAX_SAFE_INTEGER) - (b.seq ?? Number.MAX_SAFE_INTEGER) || a.createdAt - b.createdAt;

function putMessages(convId: string, upd: (list: Msg[]) => Msg[]) {
  chat.set((s) => ({ messages: { ...s.messages, [convId]: upd(s.messages[convId] ?? []).sort(sortMsgs) } }));
}

// ---- életciklus -------------------------------------------------------------------------------------------------

export async function startEngine(): Promise<void> {
  if (!session.get().keys) return;
  meta = await loadMeta();
  chat.set({ readIds: Object.fromEntries(meta.readIds.map((i) => [i, true as const])), verified: { ...meta.verified }, cleared: { ...meta.cleared }, consumed: Object.fromEntries(meta.consumed.map((i) => [i, true as const])) });
  await refreshLists();
  await pollOnce(true);
  void restoreOutbox();
  void refreshActivity();
  chat.set({ ready: true });
  timer ??= setInterval(() => void pollOnce(), SYNC_INTERVAL_MS);
  sweeper ??= setInterval(sweepExpired, 15_000);
  appSub ??= AppState.addEventListener("change", (st) => { if (st === "active") void pollOnce(); });
}

export function stopEngine(): void {
  if (timer) clearInterval(timer);
  timer = null;
  if (sweeper) clearInterval(sweeper);
  sweeper = null;
  appSub?.remove();
  appSub = null;
  cursor = "0";
  wires.clear();
  // A törölt beszélgetések határa kilépéskor is megmarad (különben újra belépve visszatöltődne az előzmény).
  const keepCleared = meta.cleared;
  const keepConsumed = meta.consumed;
  meta = { readIds: [], pins: {}, verified: {}, cleared: {}, consumed: [] };
  wipeMeta();
  if (Object.keys(keepCleared).length || keepConsumed.length) saveMeta({ ...meta, cleared: keepCleared, consumed: keepConsumed });
  purgeTemp();
  dropMediaConfig();
  chat.set({ ready: false, online: true, conversations: [], messages: {}, friends: [], incoming: [], outgoing: [], prefs: {}, keyChanged: {}, readIds: {}, verified: {}, cleared: {}, consumed: {}, activity: {} });
}
setSessionEndedHandler(stopEngine);

/** Zároláskor: a memóriában tartott nyílt tartalom és az ideiglenes fájlok törlése (a kurzor nullázásával újratölt). */
export function dropPlaintext(): void {
  purgeTemp();
  wires.clear();
  cursor = "0";
  chat.set({ messages: {} });
}

function noteOnline(ok: boolean) {
  if (chat.get().online === ok) return;
  chat.set({ online: ok });
  if (ok) void retryFailedText(); // a kapcsolat visszatért: a sikertelen szöveges üzenetek újrapróbálása
}

// ---- tartós kimenő sor ------------------------------------------------------------------------------------------

/** Az el nem küldött szöveges üzenetek titkosított mentése (lásd lib/outbox.ts). Minden állapotváltáskor hívjuk. */
function syncOutbox(): void {
  const me = session.get().me;
  const keys = session.get().keys;
  if (!me || !keys) return;
  const entries: OutboxEntry[] = [];
  for (const [convId, list] of Object.entries(chat.get().messages)) {
    for (const m of list) if (m.mine && m.type === "text" && m.seq == null && (m.status === "pending" || m.status === "failed") && m.payload) entries.push({ convId, clientMessageId: m.clientMessageId, createdAt: m.createdAt, payload: m.payload });
  }
  saveOutbox(me.id, keys.idPriv, entries);
}

/** Újraindítás után: a mentett, még el nem küldött üzenetek visszatöltése és elküldése (a szerver a clientMessageId alapján idempotens). */
async function restoreOutbox(): Promise<void> {
  const me = session.get().me;
  const keys = session.get().keys;
  if (!me || !keys) return;
  for (const e of await loadOutbox(me.id, keys.idPriv)) {
    const st = chat.get();
    if (!st.conversations.some((c) => c.id === e.convId)) continue;
    if ((st.messages[e.convId] ?? []).some((m) => m.clientMessageId === e.clientMessageId)) continue; // közben már megérkezett
    const m: Msg = { id: e.clientMessageId, clientMessageId: e.clientMessageId, convId: e.convId, senderId: me.id, mine: true, type: "text", payload: e.payload as Payload, broken: false, forged: false, status: "failed", seq: null, createdAt: e.createdAt, mediaRef: null };
    putMessages(e.convId, (l) => [...l, m]);
  }
  await retryFailedText();
}

let retrying = false;
async function retryFailedText(): Promise<void> {
  if (retrying) return;
  retrying = true;
  try {
    const failed = Object.values(chat.get().messages).flat().filter((m) => m.mine && m.type === "text" && m.status === "failed" && m.seq == null);
    for (const m of failed) await deliver(m).catch(() => undefined);
  } finally {
    retrying = false;
  }
}

// ---- listák és kulcs-rögzítés -----------------------------------------------------------------------------------

function checkPin(p: { id: string; username: string | null; identityPublicKey?: string; identitySigningPublicKey?: string }) {
  if (!p.identityPublicKey || !p.identitySigningPublicKey) return;
  const pin = meta.pins[p.id];
  if (!pin) {
    meta.pins[p.id] = { id: p.identityPublicKey, sig: p.identitySigningPublicKey };
    saveMeta(meta);
  } else if (pin.id !== p.identityPublicKey || pin.sig !== p.identitySigningPublicKey) {
    chat.set((s) => ({ keyChanged: { ...s.keyChanged, [p.id]: true } }));
  }
}

/** A partner új kulcsának elfogadása (a „kulcsa megváltozott” sáv ✓ gombja). */
export function acceptKeyChange(userId: string): void {
  const c = chat.get().conversations.find((x) => x.other.id === userId);
  if (c?.other.identityPublicKey && c.other.identitySigningPublicKey) meta.pins[userId] = { id: c.other.identityPublicKey, sig: c.other.identitySigningPublicKey };
  delete meta.verified[userId];
  saveMeta(meta);
  chat.set((s) => ({ keyChanged: { ...s.keyChanged, [userId]: false }, verified: { ...meta.verified } }));
}

/** „Fent van” küszöb: a szerver 20 mp-enként frissíti az aktivitást, a kliens 8 mp-enként kérdez. */
const ONLINE_WINDOW_MS = 60_000;

/** Ismerősök aktivitásának lekérése (hiba esetén csendben marad: nem kritikus). */
export async function refreshActivity(): Promise<void> {
  try {
    const r = await api<{ items: { userId: string; lastSeenAt: string }[] }>("/api/presence");
    const now = Date.now();
    const activity: ChatState["activity"] = {};
    for (const i of r.items) { const at = Date.parse(i.lastSeenAt); activity[i.userId] = { at, online: now - at < ONLINE_WINDOW_MS }; }
    chat.set({ activity });
  } catch (e) {
    console.warn("[chat] aktivitás lekérése sikertelen:", e instanceof Error ? e.message : e);
  }
}

export async function refreshLists(): Promise<void> {
  try {
    const [convs, fr] = await Promise.all([api<{ items: Conv[] }>("/api/conversations"), api<{ friends: FriendEntry[]; incoming: FriendEntry[]; outgoing: FriendEntry[] }>("/api/friends")]);
    convs.items.forEach((c) => checkPin(c.other));
    const before = chat.get();
    if (before.ready) {
      const known = new Set(before.incoming.map((f) => f.friendshipId));
      for (const f of fr.incoming) if (!known.has(f.friendshipId)) incomingHandler?.({ kind: "request", name: f.user.username });
    }
    chat.set({ conversations: convs.items, friends: fr.friends, incoming: fr.incoming, outgoing: fr.outgoing });
    noteOnline(true);
  } catch (e) {
    handleNet(e);
  }
}

function handleNet(e: unknown) {
  if (e instanceof ApiError && (e.code === "NETWORK" || e.code === "SERVICE_UNAVAILABLE")) noteOnline(false);
  else console.warn("[chat]", e instanceof Error ? e.message : e);
}

// ---- szinkron ---------------------------------------------------------------------------------------------------

interface SyncResp {
  messages: WireMessage[];
  deletions: { messageId: string }[];
  receipts: { messageId: string; readAt: string }[];
  cursor: string;
  hasMore: boolean;
  mediaKeyVersion: number;
}

export async function pollOnce(initial = false): Promise<void> {
  if (polling || paused || !session.get().keys) return;
  polling = true;
  try {
    for (;;) {
      const r = await api<SyncResp>(`/api/messages/sync?cursor=${encodeURIComponent(cursor)}`);
      if (r.messages.some((m) => !chat.get().conversations.some((c) => c.id === m.conversationId))) await refreshLists();
      applySync(r, initial);
      cursor = r.cursor;
      noteOnline(true);
      if (!r.hasMore) break;
    }
  } catch (e) {
    handleNet(e);
  } finally {
    polling = false;
  }
  // Ismerős-kérések nem érkeznek a szinkronnal: néhány ciklusonként frissítjük a listákat.
  if (!initial) {
    pollCount++;
    if (pollCount % 5 === 0) void refreshLists();
    if (pollCount % 2 === 0) void refreshActivity();
  }
}

function applySync(r: SyncResp, initial: boolean) {
  const keys = session.get().keys;
  const me = session.get().me;
  if (!keys || !me) return;
  const st = chat.get();
  for (const w of r.messages) {
    const conv = st.conversations.find((c) => c.id === w.conversationId);
    const mine = w.senderId === me.id;
    const sigPub = mine ? me.identitySigningPublicKey : conv?.other.identitySigningPublicKey;
    const existing = (chat.get().messages[w.conversationId] ?? []).find((m) => m.id === w.id || m.clientMessageId === w.clientMessageId);
    if (existing && existing.status !== "pending" && existing.status !== "failed") continue;
    if (w.seq != null && w.seq <= (meta.cleared[w.conversationId] ?? -1)) continue; // ezen az eszközön törölt előzmény
    wires.set(w.id, w);
    const forged = !sigPub || !verifyWire(w, sigPub);
    const opened = forged ? ({ ok: false } as const) : openWire(w, { userId: me.id, deviceId: keys.deviceId, devPriv: keys.devPriv, idPriv: keys.idPriv });
    const msg: Msg = {
      id: w.id, clientMessageId: w.clientMessageId, convId: w.conversationId, senderId: w.senderId, mine, type: w.type,
      payload: opened.ok ? opened.payload : null, broken: !opened.ok, forged,
      status: existing?.status === "read" ? "read" : "sent", seq: w.seq, createdAt: Date.parse(w.createdAt), mediaRef: w.mediaRef,
    };
    if (isExpired(msg, Date.now())) continue; // lejárt eltűnő üzenet: nem töltjük vissza
    putMessages(w.conversationId, (l) => [...l.filter((m) => m.id !== w.id && m.clientMessageId !== w.clientMessageId), msg]);
    // Értesítés: csak friss, kapott, látható üzenetről; a kezdeti (teljes) szinkron és a némított chat kimarad.
    const seen = activeConv === w.conversationId && AppState.currentState === "active";
    if (!initial && !existing && !mine && !forged && w.type !== "event" && conv && !isMuted(conv) && !seen) {
      incomingHandler?.({ kind: "message", convId: conv.id, name: displayName(conv, chat.get().prefs) });
    }
  }
  const delIds = new Set(r.deletions.map((d) => d.messageId));
  const readIds = new Set(r.receipts.map((x) => x.messageId));
  const readAtById = new Map(r.receipts.map((x) => [x.messageId, Date.parse(x.readAt)]));
  if (delIds.size || readIds.size) {
    chat.set((s) => {
      const next: Record<string, Msg[]> = {};
      for (const [cid, list] of Object.entries(s.messages)) next[cid] = list.filter((m) => !delIds.has(m.id)).map((m) => (readIds.has(m.id) && m.mine ? { ...m, status: "read" as const, readAt: readAtById.get(m.id) } : m));
      return { messages: next };
    });
  }
  if (r.mediaKeyVersion) dropMediaConfigIfStale(r.mediaKeyVersion);
}

let knownMediaVersion = 0;
function dropMediaConfigIfStale(v: number) {
  if (knownMediaVersion && v !== knownMediaVersion) dropMediaConfig();
  knownMediaVersion = v;
}

// ---- küldés -----------------------------------------------------------------------------------------------------

async function recipientsFor(convId: string): Promise<Recipients> {
  const r = await api<{ devices: Recipients["devices"]; identities: Recipients["identities"] }>(`/api/conversations/${convId}/devices`);
  return { devices: r.devices, identities: r.identities };
}

async function postWithRetry(m: Msg, payload: Payload, extra: { mediaRef?: string | null; mediaSizeBytes?: number }): Promise<{ id: string; seq: number; createdAt: string }> {
  const keys = session.get().keys!;
  for (let attempt = 0; ; attempt++) {
    const body = buildOutgoing({ conversationId: m.convId, clientMessageId: m.clientMessageId, type: m.type, payload, recipients: await recipientsFor(m.convId), sigPriv: keys.sigPriv, ...extra });
    try {
      return await api("/api/messages", { method: "POST", body });
    } catch (e) {
      // Elavult eszközlista: újra lekérjük és újracsomagoljuk/aláírjuk (legfeljebb 2×).
      if (e instanceof ApiError && e.code === "DEVICE_LIST_CHANGED" && attempt < 2) continue;
      throw e;
    }
  }
}

function newPending(convId: string, type: MessageType, payload: Payload, localUri?: string): Msg {
  const me = session.get().me!;
  const cid = uuidv4();
  return { id: cid, clientMessageId: cid, convId, senderId: me.id, mine: true, type, payload, broken: false, forged: false, status: "pending", seq: null, createdAt: Date.now(), mediaRef: null, localUri };
}

async function deliver(m: Msg): Promise<void> {
  putMessages(m.convId, (l) => l.map((x) => (x.id === m.id ? { ...x, status: "pending" } : x)));
  try {
    let payload = m.payload!;
    let extra: { mediaRef?: string | null; mediaSizeBytes?: number } = {};
    if (m.type === "image" || m.type === "video") {
      if (!m.localUri) throw new Error("Hiányzó helyi fájl");
      const up = await encryptAndUpload(m.localUri, m.type, { mime: payload.media?.mime ?? (m.type === "video" ? "video/mp4" : "image/jpeg"), width: payload.media?.width, height: payload.media?.height, durationMs: payload.media?.durationMs }, (p) => putMessages(m.convId, (l) => l.map((x) => (x.id === m.id ? { ...x, progress: p } : x))));
      payload = { ...payload, media: up.descriptor };
      extra = { mediaRef: up.mediaRef, mediaSizeBytes: up.encryptedBytes };
      putMessages(m.convId, (l) => l.map((x) => (x.id === m.id ? { ...x, payload, mediaRef: up.mediaRef } : x)));
    }
    const res = await postWithRetry(m, payload, extra);
    putMessages(m.convId, (l) => l.map((x) => (x.id === m.id ? { ...x, id: res.id, seq: res.seq, createdAt: Date.parse(res.createdAt), status: "sent", localUri: undefined, progress: undefined } : x)));
    releaseCapture(m.localUri); // a nyílt másolat feleslegessé vált
    syncOutbox();
    noteOnline(true);
  } catch (e) {
    handleNet(e);
    putMessages(m.convId, (l) => l.map((x) => (x.id === m.id ? { ...x, status: "failed", progress: undefined } : x)));
    syncOutbox();
    throw e;
  }
}

/** Idézett üzenet kivonata: szöveg eleje; rejtett üzenetnél a tartalom nem kerül a kivonatba. */
export function replyRefFor(m: Msg): ReplyRef | null {
  if (m.type === "event" || m.broken || m.forged || m.status === "pending" || m.status === "failed") return null;
  const hidden = !!m.payload?.hidden;
  return { id: m.id, senderId: m.senderId, kind: m.type, ...(hidden ? { hidden: true } : {}), ...(!hidden && m.type === "text" && m.payload?.text ? { snippet: m.payload.text.slice(0, 100) } : {}) };
}

export async function sendText(convId: string, text: string, hidden: boolean, reply?: ReplyRef | null): Promise<void> {
  const t = text.trim();
  if (!t) return;
  if (t.length > MAX_TEXT_CIPHERTEXT_CHARS / 2) throw new Error("tooLong");
  const m = newPending(convId, "text", { v: 1, text: t, ...(hidden ? { hidden: true } : {}), ...(reply ? { reply } : {}), ...ttlFor(convId) });
  putMessages(convId, (l) => [...l, m]);
  syncOutbox(); // elküldés előtt mentjük: ha az app közben bezárul, nem vész el
  await deliver(m).catch(() => undefined);
}

/** Az eltűnő üzenet beállítás a kimenő üzenet hasznos terhére (üres, ha ki van kapcsolva). */
function ttlFor(convId: string): { ttl?: number } {
  const ms = currentTtl(chat.get().messages[convId] ?? []);
  return ms ? { ttl: ms } : {};
}

/** Üzenet szerkesztése (csak saját szöveges üzenet; a másik fél is látja, „szerkesztve” jelzéssel). */
export async function sendEdit(convId: string, target: string, text: string): Promise<void> {
  const t = text.trim();
  if (!t) return;
  if (t.length > MAX_TEXT_CIPHERTEXT_CHARS / 2) throw new Error("tooLong");
  await sendEvent(convId, { kind: "edit", target, text: t });
}

/**
 * Egyszeri média „elfogyasztása”: helyben megjegyezzük (többé nem nyitható meg), és jelezzük a feladónak.
 * A szerveren a titkosított példány megmarad – a korlátozás kliensoldali (lásd AGENTS.md).
 */
export function consumeOnce(m: Msg): void {
  if (m.mine || chat.get().consumed[m.id]) return;
  meta.consumed.push(m.id);
  saveMeta(meta);
  chat.set((s) => ({ consumed: { ...s.consumed, [m.id]: true } }));
  sendEvent(m.convId, { kind: "opened", target: m.id }).catch((e) => console.warn("[chat] megnyitás-jelzés sikertelen", e instanceof Error ? e.message : e));
}

/** Lejárt (eltűnő) üzenetek eltávolítása a memóriából; a sajátokat a szerverről is töröljük (mindkét oldalon eltűnnek). */
function sweepExpired(): void {
  const now = Date.now();
  const gone: Msg[] = [];
  for (const list of Object.values(chat.get().messages)) for (const m of list) if (m.type !== "event" && isExpired(m, now)) gone.push(m);
  if (!gone.length) return;
  const ids = new Set(gone.map((m) => m.id));
  chat.set((s) => ({ messages: Object.fromEntries(Object.entries(s.messages).map(([cid, l]) => [cid, l.filter((m) => !ids.has(m.id))])) }));
  for (const m of gone) if (m.mine && m.seq != null) api(`/api/messages/${m.id}`, { method: "DELETE" }).catch((e) => console.warn("[chat] lejárt üzenet szerveres törlése sikertelen", e instanceof Error ? e.message : e));
}

/** Rendszer-esemény küldése (reakció / témaváltás): titkosított, nincs push, nem jelenik meg buborékként. */
export async function sendEvent(convId: string, event: ChatEvent): Promise<void> {
  const m = newPending(convId, "event", { v: 1, event });
  putMessages(convId, (l) => [...l, m]);
  try {
    await deliver(m);
  } catch (e) {
    putMessages(convId, (l) => l.filter((x) => x.id !== m.id)); // a sikertelen esemény nem marad a listában
    throw e;
  }
}

export async function sendMedia(convId: string, uri: string, kind: "image" | "video" | "audio", meta2: { mime: string; width?: number; height?: number; durationMs?: number }, hidden: boolean, opts: { group?: string; once?: boolean } = {}): Promise<void> {
  const m = newPending(convId, kind, { v: 1, hidden: hidden || undefined, ...(opts.group ? { group: opts.group } : {}), ...(opts.once ? { once: true } : {}), ...ttlFor(convId), media: { key: "", nonce: "", size: 0, ...meta2 } }, uri);
  putMessages(convId, (l) => [...l, m]);
  await deliver(m).catch(() => undefined);
}

/** Sikertelen küldés újrapróbálása (a helyi fájl vagy szöveg még megvan). */
export async function retrySend(convId: string, id: string): Promise<void> {
  const m = (chat.get().messages[convId] ?? []).find((x) => x.id === id && x.status === "failed");
  if (m) await deliver(m).catch(() => undefined);
}

export function discardFailed(convId: string, id: string): void {
  putMessages(convId, (l) => l.filter((x) => x.id !== id));
  syncOutbox();
}

// ---- olvasás, törlés --------------------------------------------------------------------------------------------

/** Olvasási visszaigazolás küldése (idempotens). Rejtett üzenetnél a felfedéskor, médiánál a megnyitáskor hívandó. */
export async function markRead(m: Msg): Promise<void> {
  if (m.mine || m.status === "pending" || chat.get().readIds[m.id]) return;
  chat.set((s) => ({ readIds: { ...s.readIds, [m.id]: true } }));
  meta.readIds.push(m.id);
  saveMeta(meta);
  try {
    await api(`/api/messages/${m.id}/read`, { method: "POST", body: {} });
  } catch (e) {
    handleNet(e);
  }
}

/** Törlés mindkét oldalon (csak a feladó). A helyi listából a szinkron is eltávolítja. */
export async function deleteForAll(m: Msg): Promise<void> {
  await api(`/api/messages/${m.id}`, { method: "DELETE" });
  putMessages(m.convId, (l) => l.filter((x) => x.id !== m.id));
}

export function unreadCount(convId: string): number {
  const s = chat.get();
  return (s.messages[convId] ?? []).filter((m) => !m.mine && m.type !== "event" && !s.readIds[m.id]).length;
}

// ---- ismerősök és beállítások -----------------------------------------------------------------------------------

export async function searchUsers(q: string) {
  return (await api<{ items: { id: string; username: string; relation: string }[] }>(`/api/users/search?q=${encodeURIComponent(q)}`)).items;
}
export async function sendFriendRequest(username: string): Promise<string> {
  const r = await api<{ status: string }>("/api/friends/requests", { method: "POST", body: { username } });
  await refreshLists();
  return r.status;
}
export async function friendAction(friendshipId: string, action: "accept" | "decline" | "cancel"): Promise<void> {
  await api(`/api/friends/requests/${friendshipId}/${action}`, { method: "POST", body: {} });
  await refreshLists();
}
/**
 * Beszélgetés törlése MAGUNKNAK, ezen az eszközön: az eddigi üzenetek eltűnnek, és nem töltődnek vissza.
 * A másik fél példánya és a szerveren tárolt titkosított másolat érintetlen (törlés mindkét oldalon csak a feladónak jár).
 */
export function clearConversation(convId: string): void {
  const list = chat.get().messages[convId] ?? [];
  const upTo = Math.max(meta.cleared[convId] ?? -1, ...list.map((m) => m.seq ?? -1));
  meta.cleared[convId] = upTo;
  saveMeta(meta);
  for (const m of list) wires.delete(m.id);
  chat.set((s) => ({ cleared: { ...s.cleared, [convId]: upTo }, messages: { ...s.messages, [convId]: [] } }));
}

export async function removeFriend(userId: string): Promise<void> {
  await api(`/api/friends/${userId}`, { method: "DELETE" });
  await refreshLists();
}
export async function blockUser(userId: string): Promise<void> {
  await api("/api/blocks", { method: "POST", body: { userId } });
  await refreshLists();
}
export async function setMute(convId: string, mutedUntil: string | null): Promise<void> {
  await api(`/api/conversations/${convId}/prefs`, { method: "PUT", body: { mutedUntil } });
  chat.set((s) => ({ conversations: s.conversations.map((c) => (c.id === convId ? { ...c, mutedUntil } : c)) }));
}

export async function loadPrefs(userId: string): Promise<void> {
  const keys = session.get().keys;
  if (!keys || chat.get().prefs[userId]) return;
  try {
    const r = await api<{ valueEncrypted: string; nonce: string } | null>(`/api/contacts/${userId}/prefs`);
    chat.set((s) => ({ prefs: { ...s.prefs, [userId]: r ? decryptPrefs(keys.idPriv, r) : {} } }));
  } catch (e) {
    handleNet(e);
  }
}
export async function savePrefs(userId: string, p: ContactPrefs): Promise<void> {
  const keys = session.get().keys!;
  await api(`/api/contacts/${userId}/prefs`, { method: "PUT", body: encryptPrefs(keys.idPriv, p) });
  chat.set((s) => ({ prefs: { ...s.prefs, [userId]: p } }));
}

/** Némított-e a beszélgetés (a `Date.now()` hívás renderen kívül marad). */
export const isMuted = (c: Conv): boolean => !!c.mutedUntil && Date.parse(c.mutedUntil) > Date.now();

/** Megjelenített név: becenév, ennek híján felhasználónév. */
export function displayName(c: Conv, prefs: Record<string, ContactPrefs>): string {
  return prefs[c.other.id]?.nickname || c.other.username || "—";
}

/** Biztonsági szám ellenőrzöttnek jelölése / visszavonása (`null`). */
export function setVerified(userId: string, fingerprint: string | null): void {
  if (fingerprint) meta.verified[userId] = fingerprint;
  else delete meta.verified[userId];
  saveMeta(meta);
  chat.set({ verified: { ...meta.verified } });
}

// ---- jelentés ---------------------------------------------------------------------------------------------------

/**
 * Üzenet jelentése. `share`: a jelentő önként megosztja EZT az egy üzenetet a moderátorokkal – az üzenetkulcsot a
 * moderációs PUBLIKUS kulcsra csomagoljuk újra (24 órás grant); a szerver a privát kulcsot nem ismeri.
 */
export async function reportMessage(m: Msg, reason: (typeof REPORT_REASONS)[number], share: boolean): Promise<void> {
  const keys = session.get().keys;
  let grant: { wrappedKey: string; ephemeralPublicKey: string; wrapNonce: string } | undefined;
  const w = wires.get(m.id);
  if (share && keys && w) {
    const mod = await api<{ publicKey: string | null }>("/api/config/moderation");
    const opened = openWire(w, { userId: session.get().me!.id, deviceId: keys.deviceId, devPriv: keys.devPriv, idPriv: keys.idPriv });
    if (mod.publicKey && opened.ok) grant = sealForPublicKey(mod.publicKey, opened.contentKey);
  }
  await api("/api/reports", { method: "POST", body: { messageId: m.id, reason, ...(grant ? { grant } : {}) } });
}
