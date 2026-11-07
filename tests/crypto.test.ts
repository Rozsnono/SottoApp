import { describe, expect, it } from "vitest";
import { randomBytes } from "@noble/hashes/utils.js";
import { createBackup, generateDeviceKey, devicePublic, generateIdentity, identityPublic, openBackup, uuidv4 } from "@/crypto/keys";
import { deriveRecoveryKeys, generateRecoveryCode, normalizeRecoveryCode } from "@/crypto/recovery";
import { buildOutgoing, openWire, verifyWire, type WireMessage } from "@/crypto/message";
import { decryptPrefs, encryptPrefs } from "@/crypto/prefs";
import { decryptBuffer, encryptBuffer, encryptedSize, STREAM_CHUNK } from "@/crypto/stream";
import { SendMessageBodySchema } from "@/protocol/schemas";
import { parseSnPayload, safetyNumber, snPayload } from "@/crypto/safety";
import makeQr from "qrcode-generator";
import { currentTheme, reactionMap, type EventMsg } from "@/lib/events";

describe("helyreállító kód", () => {
  it("32 jegy, normalizálás és levezetés determinisztikus", () => {
    const code = generateRecoveryCode();
    expect(code).toMatch(/^([0-9A-Z]{4}-){7}[0-9A-Z]{4}$/);
    const lower = code.toLowerCase().replace(/-/g, " ");
    expect(normalizeRecoveryCode(lower)).toBe(normalizeRecoveryCode(code));
    const a = deriveRecoveryKeys(code);
    const b = deriveRecoveryKeys(lower);
    expect(a.verifier).toEqual(b.verifier);
    expect(a.verifier).not.toEqual(a.backupKey);
  });
  it("érvénytelen kódot elutasít", () => {
    expect(normalizeRecoveryCode("ABC")).toBeNull();
    expect(() => deriveRecoveryKeys("rossz")).toThrow();
  });
});

describe("kulcsmentés", () => {
  it("visszaállítható a jó kóddal, a rossz kóddal nem", () => {
    const id = generateIdentity();
    const code = generateRecoveryCode();
    const backup = createBackup(id, deriveRecoveryKeys(code).backupKey);
    const back = openBackup(backup, deriveRecoveryKeys(code).backupKey);
    expect(back.idPriv).toEqual(id.idPriv);
    expect(back.sigPriv).toEqual(id.sigPriv);
    expect(() => openBackup(backup, deriveRecoveryKeys(generateRecoveryCode()).backupKey)).toThrow();
  });
});

describe("üzenet E2EE", () => {
  const alice = { id: generateIdentity(), devPriv: generateDeviceKey(), deviceId: uuidv4(), userId: "a".repeat(24) };
  const bob = { id: generateIdentity(), devPriv: generateDeviceKey(), deviceId: uuidv4(), userId: "b".repeat(24) };
  const recipients = {
    devices: [alice, bob].map((u) => ({ deviceId: u.deviceId, devicePublicKey: devicePublic(u.devPriv) })),
    identities: [alice, bob].map((u) => ({ userId: u.userId, identityPublicKey: identityPublic(u.id).identityPublicKey })),
  };
  const build = (type: "text" | "image" = "text") => {
    const clientMessageId = uuidv4();
    const body = buildOutgoing({ conversationId: "c".repeat(24), clientMessageId, type, payload: { v: 1, text: "szia", hidden: true }, recipients, sigPriv: alice.id.sigPriv, mediaRef: type === "image" ? "d".repeat(32) : null });
    return { body, wire: { ...body, id: "e".repeat(24), senderId: alice.userId, seq: 1, mediaRef: body.mediaRef ?? null, mediaSizeBytes: null, createdAt: new Date().toISOString() } as unknown as WireMessage };
  };

  it("a szerver sémája elfogadja a törzset", () => {
    expect(SendMessageBodySchema.safeParse(build().body).success).toBe(true);
  });
  it("a címzett és a küldő is kinyitja, az aláírás ellenőrizhető", () => {
    const { wire } = build();
    const sigPub = identityPublic(alice.id).identitySigningPublicKey;
    expect(verifyWire(wire, sigPub)).toBe(true);
    for (const u of [alice, bob]) {
      const r = openWire(wire, { userId: u.userId, deviceId: u.deviceId, devPriv: u.devPriv, idPriv: u.id.idPriv });
      expect(r.ok && r.payload).toMatchObject({ text: "szia", hidden: true });
    }
  });
  it("új eszköz az identitás-borítékkal olvassa az előzményt", () => {
    const { wire } = build();
    const r = openWire(wire, { userId: bob.userId, deviceId: uuidv4(), devPriv: generateDeviceKey(), idPriv: bob.id.idPriv });
    expect(r.ok).toBe(true);
  });
  it("módosított ciphertext vagy borítékok miatt az aláírás érvénytelen", () => {
    const { wire } = build();
    const sigPub = identityPublic(alice.id).identitySigningPublicKey;
    expect(verifyWire({ ...wire, ciphertext: wire.ciphertext.slice(0, -4) + "AAAA" }, sigPub)).toBe(false);
    expect(verifyWire({ ...wire, wrappedKeys: wire.wrappedKeys.slice(1) }, sigPub)).toBe(false);
    expect(verifyWire(wire, identityPublic(bob.id).identitySigningPublicKey)).toBe(false);
  });
  it("idegen nem nyitja ki", () => {
    const { wire } = build();
    const r = openWire(wire, { userId: "f".repeat(24), deviceId: uuidv4(), devPriv: generateDeviceKey(), idPriv: generateIdentity().idPriv });
    expect(r).toEqual({ ok: false, reason: "no-key" });
  });
});

describe("becenév/szín", () => {
  it("körbejár; idegen kulccsal üres", () => {
    const id = generateIdentity();
    const blob = encryptPrefs(id.idPriv, { nickname: "Pisti", color: "teal" });
    expect(decryptPrefs(id.idPriv, blob)).toEqual({ nickname: "Pisti", color: "teal" });
    expect(decryptPrefs(generateIdentity().idPriv, blob)).toEqual({});
  });
});

/** A getRandomValues 64 KiB-nál többet nem ad egyszerre. */
function bigRandom(n: number): Uint8Array {
  const out = new Uint8Array(n);
  for (let o = 0; o < n; o += 65536) out.set(randomBytes(Math.min(65536, n - o)), o);
  return out;
}

describe("STREAM média-titkosítás", () => {
  const key = randomBytes(32);
  const base = randomBytes(19);
  it.each([0, 1, STREAM_CHUNK - 1, STREAM_CHUNK, STREAM_CHUNK + 1, STREAM_CHUNK * 3 + 17])("körbejár (%i bájt)", (n) => {
    const data = bigRandom(n);
    const enc = encryptBuffer(key, base, data);
    expect(enc.length).toBe(encryptedSize(n));
    expect(decryptBuffer(key, base, enc)).toEqual(data);
  });
  it("csonkolást és átrendezést észlel", () => {
    const enc = encryptBuffer(key, base, bigRandom(STREAM_CHUNK * 2 + 5));
    const step = STREAM_CHUNK + 16;
    expect(() => decryptBuffer(key, base, enc.subarray(0, step * 2))).toThrow();
    const swapped = new Uint8Array(enc.length);
    swapped.set(enc.subarray(step, step * 2), 0);
    swapped.set(enc.subarray(0, step), step);
    swapped.set(enc.subarray(step * 2), step * 2);
    expect(() => decryptBuffer(key, base, swapped)).toThrow();
  });
});

describe("biztonsági szám", () => {
  it("szimmetrikus, 6×5 számjegy, kulcsváltozásra más", () => {
    const a = identityPublic(generateIdentity()).identityPublicKey;
    const b = identityPublic(generateIdentity()).identityPublicKey;
    expect(safetyNumber(a, b)).toEqual(safetyNumber(b, a));
    expect(safetyNumber(a, b).every((g) => /^\d{5}$/.test(g))).toBe(true);
    expect(safetyNumber(a, b)).not.toEqual(safetyNumber(a, identityPublic(generateIdentity()).identityPublicKey));
  });
});

describe("események (reakció, téma)", () => {
  const ev = (id: string, seq: number, sender: string, mine: boolean, event: EventMsg["payload"]): EventMsg => ({ id, type: "event", senderId: sender, mine, seq, createdAt: seq, payload: event });
  it("reakció: felhasználónként egy, a legutóbbi nyer, null visszavon", () => {
    const list = [
      ev("e1", 1, "a", true, { event: { kind: "reaction", target: "m1", emoji: "👍" } }),
      ev("e2", 2, "b", false, { event: { kind: "reaction", target: "m1", emoji: "👍" } }),
      ev("e3", 3, "a", true, { event: { kind: "reaction", target: "m1", emoji: "❤️" } }),
      ev("e4", 4, "b", false, { event: { kind: "reaction", target: "m2", emoji: "🔥" } }),
      ev("e5", 5, "b", false, { event: { kind: "reaction", target: "m2", emoji: null } }),
    ];
    const r = reactionMap(list);
    expect(r.m1).toEqual(expect.arrayContaining([{ emoji: "👍", count: 1, mine: false }, { emoji: "❤️", count: 1, mine: true }]));
    expect(r.m2).toBeUndefined();
  });
  it("téma: a legutóbbi váltás számít", () => {
    expect(currentTheme([])).toBeNull();
    expect(currentTheme([ev("t1", 1, "a", true, { event: { kind: "theme", theme: "ocean" } }), ev("t2", 2, "b", false, { event: { kind: "theme", theme: "rose" } })])).toBe("rose");
  });
});

describe("biztonsági szám QR", () => {
  it("a tartalom oda-vissza értelmezhető, idegen szöveget elutasít", () => {
    const fp = safetyNumber(devicePublic(generateDeviceKey()), devicePublic(generateDeviceKey())).join("");
    expect(fp).toHaveLength(30);
    expect(parseSnPayload(snPayload(fp))).toBe(fp);
    expect(parseSnPayload("https://example.com")).toBeNull();
    expect(parseSnPayload("sotto:sn1:123")).toBeNull();
  });
  it("a QR-kód legenerálható a tartalomból", () => {
    const qr = makeQr(0, "M");
    qr.addData(snPayload("1".repeat(30)));
    qr.make();
    expect(qr.getModuleCount()).toBeGreaterThanOrEqual(21);
  });
});
