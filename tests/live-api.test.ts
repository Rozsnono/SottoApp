/**
 * Élő együttműködési próba a futó sotto-api ellen (opt-in): `SOTTO_LIVE_API=http://localhost:3002 npm test`.
 * A kliens kripto- és protokollkódját (src/crypto, src/protocol) valódi szerverrel ellenőrzi:
 * regisztráció, kulcsmentés, ismerősség, aláírt üzenet küldése, szinkron, visszafejtés, olvasás, törlés.
 */
import { describe, expect, it } from "vitest";
import { createBackup, devicePublic, generateDeviceKey, generateIdentity, identityPublic, openBackup, uuidv4 } from "@/crypto/keys";
import { deriveRecoveryKeys, generateRecoveryCode } from "@/crypto/recovery";
import { buildOutgoing, openWire, verifyWire, type Recipients, type WireMessage } from "@/crypto/message";
import { toB64 } from "@/protocol/wrap";
import { RegisterBodySchema } from "@/protocol/schemas";

const BASE = process.env.SOTTO_LIVE_API;
const run = BASE ? describe : describe.skip;

async function call<T>(path: string, token: string | null, method = "GET", body?: unknown): Promise<T> {
  const res = await fetch(BASE + path, { method, headers: { "content-type": "application/json", "x-forwarded-for": `10.9.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`, ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const j = (await res.json()) as { ok: boolean; data?: T; error?: { code: string; message: string } };
  if (!j.ok) throw new Error(`${method} ${path}: ${j.error?.code} ${j.error?.message}`);
  return j.data as T;
}

async function makeUser(username: string) {
  const identity = generateIdentity();
  const code = generateRecoveryCode();
  const rk = deriveRecoveryKeys(code);
  const devPriv = generateDeviceKey();
  const deviceId = uuidv4();
  const body = { username, password: "correct-horse-battery", ...identityPublic(identity), recoveryVerifier: toB64(rk.verifier), backup: createBackup(identity, rk.backupKey), device: { deviceId, deviceName: "Live test", devicePublicKey: devicePublic(devPriv) } };
  expect(RegisterBodySchema.safeParse(body).success).toBe(true);
  const r = await call<{ user: { id: string }; tokens: { accessToken: string } }>("/api/auth/register", null, "POST", body);
  return { identity, code, devPriv, deviceId, userId: r.user.id, token: r.tokens.accessToken, ...identityPublic(identity), username };
}

run("élő sotto-api", () => {
  it("regisztráció → ismerősség → aláírt üzenet → szinkron → visszafejtés → olvasás → törlés", async () => {
    const sfx = uuidv4().replace(/-/g, "").slice(0, 8);
    const a = await makeUser(`la${sfx}`);
    const b = await makeUser(`lb${sfx}`);

    // Kulcsmentés: a szerverről lekért mentés a helyreállító kóddal visszafejthető.
    const bk = await call<{ encryptedKeyBackup: string; backupNonce: string }>("/api/keys/backup", a.token);
    expect(openBackup(bk, deriveRecoveryKeys(a.code).backupKey).idPriv).toEqual(a.identity.idPriv);

    await call("/api/friends/requests", a.token, "POST", { username: b.username });
    const fr = await call<{ incoming: { friendshipId: string }[] }>("/api/friends", b.token);
    const acc = await call<{ conversationId: string }>(`/api/friends/requests/${fr.incoming[0].friendshipId}/accept`, b.token, "POST", {});

    const dev = await call<{ devices: Recipients["devices"]; identities: Recipients["identities"] }>(`/api/conversations/${acc.conversationId}/devices`, a.token);
    const cmid = uuidv4();
    const body = buildOutgoing({ conversationId: acc.conversationId, clientMessageId: cmid, type: "text", payload: { v: 1, text: "élő szia", hidden: true }, recipients: dev, sigPriv: a.identity.sigPriv });
    const sent = await call<{ id: string }>("/api/messages", a.token, "POST", body);

    const sync = await call<{ messages: WireMessage[]; cursor: string }>("/api/messages/sync?cursor=0", b.token);
    expect(sync.messages).toHaveLength(1);
    const w = sync.messages[0];
    expect(verifyWire(w, a.identitySigningPublicKey)).toBe(true);
    const opened = openWire(w, { userId: b.userId, deviceId: b.deviceId, devPriv: b.devPriv, idPriv: b.identity.idPriv });
    expect(opened.ok && opened.payload).toMatchObject({ text: "élő szia", hidden: true });

    // Rendszer-esemény (reakció + téma): titkosított `event` üzenet, amit a másik fél visszafejt.
    for (const event of [{ kind: "reaction" as const, target: sent.id, emoji: "🔥" }, { kind: "theme" as const, theme: "ocean" }]) {
      const eb = buildOutgoing({ conversationId: acc.conversationId, clientMessageId: uuidv4(), type: "event", payload: { v: 1, event }, recipients: dev, sigPriv: b.identity.sigPriv });
      await call("/api/messages", b.token, "POST", eb);
    }
    const evSync = await call<{ messages: WireMessage[] }>(`/api/messages/sync?cursor=${sync.cursor}`, a.token);
    const evs = evSync.messages.filter((m) => m.type === "event").map((m) => { const o = openWire(m, { userId: a.userId, deviceId: a.deviceId, devPriv: a.devPriv, idPriv: a.identity.idPriv }); return o.ok ? o.payload.event : null; });
    expect(evs).toEqual([{ kind: "reaction", target: sent.id, emoji: "🔥" }, { kind: "theme", theme: "ocean" }]);

    await call(`/api/messages/${sent.id}/read`, b.token, "POST", {});
    const back = await call<{ receipts: { messageId: string }[] }>("/api/messages/sync?cursor=0", a.token);
    expect(back.receipts.map((r) => r.messageId)).toContain(sent.id);

    await call(`/api/messages/${sent.id}`, a.token, "DELETE");
    const after = await call<{ messages: unknown[]; deletions: { messageId: string }[] }>(`/api/messages/sync?cursor=${sync.cursor}`, b.token);
    expect(after.deletions.map((d) => d.messageId)).toContain(sent.id);
  });
});
