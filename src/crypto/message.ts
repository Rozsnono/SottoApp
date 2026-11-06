/**
 * Üzenet-titkosítás (E2EE): tartalomkulcs → XChaCha20-Poly1305; a kulcs minden aktív eszközre és minden résztvevő
 * identitására külön borítékolva (sealed box); az egészet Ed25519-aláírás fedi (a szerver is ellenőrzi).
 */
import { ed25519 } from "@noble/curves/ed25519.js";
import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import { randomBytes } from "@noble/hashes/utils.js";
import { decryptMessageBody, fromB64, messageSignatureInput, openSealed, sealForPublicKey, toB64, utf8, type WrappedKeyEntry } from "@/protocol/wrap";
import { identityRecipientId } from "@/protocol/constants";
import type { z } from "zod";
import type { SendMessageBodySchema } from "@/protocol/schemas";

export type SendMessageBody = z.input<typeof SendMessageBodySchema>;
/** Idézett üzenet. `snippet`: a szöveg eleje (rejtett üzenetnél nincs). */
export interface ReplyRef {
  id: string;
  senderId: string;
  kind: "text" | "image" | "video";
  hidden?: boolean;
  snippet?: string;
}

export type MessageType = "text" | "image" | "video" | "event";

/** Titkosított rendszer-esemény: reakció egy üzenetre (emoji = null: visszavonás) vagy a beszélgetés témájának váltása. */
export type ChatEvent = { kind: "reaction"; target: string; emoji: string | null } | { kind: "theme"; theme: string };

/** A kép/videó fájlkulcsa és leírója – a titkosított üzenet-törzs része (a szerver nem látja). */
export interface MediaDescriptor {
  /** Fájl-tartalomkulcs (b64, 32 bájt). */
  key: string;
  /** STREAM alap-nonce (b64, 19 bájt). */
  nonce: string;
  /** Titkosítatlan méret bájtban. */
  size: number;
  mime: string;
  width?: number;
  height?: number;
  durationMs?: number;
}

/** Az üzenet nyílt törzse; csak a küldő és a címzett eszközei látják. */
export interface Payload {
  v: 1;
  text?: string;
  /** „Rejtett” üzenet: koppintásra fedhető fel. */
  hidden?: boolean;
  media?: MediaDescriptor;
  /** Csak `event` típusú üzenetnél. */
  event?: ChatEvent;
  /** Válasz egy korábbi üzenetre: az idézett üzenet azonosítója és rövid, titkosítva küldött kivonata. */
  reply?: ReplyRef;
}

export interface Recipients {
  devices: { deviceId: string; devicePublicKey: string }[];
  identities: { userId: string; identityPublicKey: string }[];
}

export interface BuiltMessage {
  body: SendMessageBody;
}

export function buildOutgoing(args: {
  conversationId: string;
  clientMessageId: string;
  type: MessageType;
  payload: Payload;
  recipients: Recipients;
  sigPriv: Uint8Array;
  mediaRef?: string | null;
  mediaSizeBytes?: number;
}): SendMessageBody {
  const contentKey = randomBytes(32);
  const nonce = randomBytes(24);
  const ciphertext = toB64(xchacha20poly1305(contentKey, nonce).encrypt(utf8(JSON.stringify(args.payload))));
  const wrappedKeys: WrappedKeyEntry[] = [
    ...args.recipients.devices.map((d) => ({ deviceId: d.deviceId, ...sealForPublicKey(d.devicePublicKey, contentKey) })),
    ...args.recipients.identities.map((i) => ({ deviceId: identityRecipientId(i.userId), ...sealForPublicKey(i.identityPublicKey, contentKey) })),
  ];
  const nonceB64 = toB64(nonce);
  const signature = toB64(ed25519.sign(messageSignatureInput({ conversationId: args.conversationId, clientMessageId: args.clientMessageId, type: args.type, nonce: nonceB64, ciphertext, wrappedKeys }), args.sigPriv));
  return {
    conversationId: args.conversationId,
    type: args.type,
    ciphertext,
    nonce: nonceB64,
    signature,
    wrappedKeys,
    mediaRef: args.mediaRef ?? null,
    ...(args.mediaSizeBytes ? { mediaSizeBytes: args.mediaSizeBytes } : {}),
    clientMessageId: args.clientMessageId,
  };
}

/** A szerverről érkező üzenet (sync). */
export interface WireMessage {
  id: string;
  conversationId: string;
  senderId: string;
  seq: number;
  type: MessageType;
  ciphertext: string;
  nonce: string;
  signature: string;
  wrappedKeys: WrappedKeyEntry[];
  mediaRef: string | null;
  mediaSizeBytes: number | null;
  clientMessageId: string;
  createdAt: string;
}

/** Az aláírás ellenőrzése a küldő ismert aláíró-kulcsával. */
export function verifyWire(m: WireMessage, senderSigningPublicKey: string): boolean {
  try {
    return ed25519.verify(fromB64(m.signature), messageSignatureInput(m), fromB64(senderSigningPublicKey));
  } catch {
    return false;
  }
}

export type OpenResult = { ok: true; payload: Payload; contentKey: Uint8Array } | { ok: false; reason: "no-key" | "decrypt" | "format" };

/** Kinyitás: előbb a saját eszköz borítékával, ennek híján az identitás-borítékkal (új eszköz előzményei). */
export function openWire(m: WireMessage, me: { userId: string; deviceId: string; devPriv: Uint8Array; idPriv: Uint8Array }): OpenResult {
  const byDevice = m.wrappedKeys.find((w) => w.deviceId === me.deviceId);
  const byIdentity = m.wrappedKeys.find((w) => w.deviceId === identityRecipientId(me.userId));
  try {
    let contentKey: Uint8Array | null = null;
    if (byDevice) {
      try {
        contentKey = openSealed(me.devPriv, byDevice);
      } catch {
        contentKey = null;
      }
    }
    if (!contentKey && byIdentity) contentKey = openSealed(me.idPriv, byIdentity);
    if (!contentKey) return { ok: false, reason: "no-key" };
    const plain = decryptMessageBody(contentKey, m.nonce, m.ciphertext);
    const payload = JSON.parse(new TextDecoder().decode(plain)) as Payload;
    if (payload?.v !== 1) return { ok: false, reason: "format" };
    return { ok: true, payload, contentKey };
  } catch {
    return { ok: false, reason: "decrypt" };
  }
}
