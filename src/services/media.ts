/**
 * Média: titkosítás az eszközön, közvetlen feltöltés/letöltés a NovaStore NAS fájlszolgáltatásra (`x-api-key` fejléc).
 * A telefonos API kulcsot a szerver az eszköz publikus kulcsára zárva adja (`GET /api/config/media`); csak memóriában él.
 * Titkosítatlan fájl csak ideiglenesen, a cache `sotto-tmp` mappájában létezik (megjelenítéshez), és bezáráskor/zároláskor törlődik.
 */
import { Directory, File, Paths, UploadType } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { randomBytes } from "@noble/hashes/utils.js";
import { api, ApiError } from "@/lib/api";
import { session } from "@/state/session";
import { fromB64, openSealed, toB64, type SealedEnvelope } from "@/protocol/wrap";
import { MAX_IMAGE_CIPHERTEXT_BYTES, MAX_VIDEO_CIPHERTEXT_BYTES } from "@/protocol/constants";
import { BASE_NONCE_BYTES, decryptChunk, encryptChunk, encryptedSize, STREAM_CHUNK, TAG_BYTES } from "@/crypto/stream";
import type { MediaDescriptor } from "@/crypto/message";

interface MediaConfig {
  baseUrl: string;
  folder: string;
  apiKey: string;
  keyVersion: number;
}
let cfg: MediaConfig | null = null;

/** Az eszközre zárt média-konfiguráció lekérése és kinyitása; `force`: kulcsforgatás után. */
export async function getMediaConfig(force = false): Promise<MediaConfig> {
  if (cfg && !force) return cfg;
  const keys = session.get().keys;
  if (!keys) throw new Error("Nincsenek kulcsok");
  const r = await api<{ keyVersion: number; sealed: SealedEnvelope }>("/api/config/media");
  const j = JSON.parse(new TextDecoder().decode(openSealed(keys.devPriv, r.sealed))) as MediaConfig;
  cfg = { baseUrl: j.baseUrl.replace(/\/+$/, ""), folder: j.folder.replace(/^\/+|\/+$/g, ""), apiKey: j.apiKey, keyVersion: r.keyVersion };
  return cfg;
}
export const dropMediaConfig = () => { cfg = null; };

const tmpDir = () => new Directory(Paths.cache, "sotto-tmp");
function tmpFile(name: string): File {
  const d = tmpDir();
  if (!d.exists) d.create({ intermediates: true, idempotent: true });
  return new File(d, name);
}
const rid = (n = 16) => Array.from(randomBytes(n), (b) => b.toString(16).padStart(2, "0")).join("");

/** Az összes ideiglenes (visszafejtett) fájl törlése – induláskor, zároláskor, kilépéskor. */
export function purgeTemp(): void {
  try {
    const d = tmpDir();
    if (d.exists) d.delete();
  } catch (e) {
    console.warn("[media] ideiglenes fájlok törlése sikertelen", e instanceof Error ? e.message : e);
  }
}
export function releaseTemp(uri: string | null | undefined): void {
  if (!uri) return;
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch {
    /* a fájl már nincs meg – nem hiba */
  }
}

/** Csak a cache-ben lévő (kamera/képválasztó által készített) másolatot törli – a felhasználó saját fájljaihoz nem nyúl. */
export function releaseCapture(uri: string | null | undefined): void {
  if (uri && uri.startsWith(Paths.cache.uri)) releaseTemp(uri);
}

const NAS_TIMEOUT_MS = 30_000; // vezérlő hívások (start/finish/failed)
const PIECE_TIMEOUT_MS = 60_000; // egy feltöltött darab
const DOWNLOAD_TIMEOUT_MS = 120_000;
const PIECE_ATTEMPTS = 4;

/** Időkorlát egy olyan műveletre, amit nem lehet megszakítani (fájlfeltöltés/-letöltés): lejáratkor hálózati hibával tér vissza. */
function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new ApiError("NETWORK", `${what}: időtúllépés`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function nas(c: MediaConfig, path: string, init: RequestInit = {}): Promise<Response> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), NAS_TIMEOUT_MS);
  try {
    return await fetch(`${c.baseUrl}${path}`, { ...init, signal: ctl.signal, headers: { ...(init.headers ?? {}), "x-api-key": c.apiKey } });
  } catch (e) {
    console.warn(`[media] ${path} nem érhető el`, e instanceof Error ? e.message : e);
    throw new ApiError("NETWORK", "A médiatár nem érhető el.");
  } finally {
    clearTimeout(t);
  }
}

const UPLOAD_PIECE = 1024 * 1024; // a NAS felé küldött darabméret (a STREAM-chunk többszöröse); kicsi, hogy gyenge hálózaton is átmenjen és újrapróbálható legyen

/** Kép kicsinyítése feltöltés előtt: hosszabbik oldal max. 1920 px, JPEG 0,8. Hiba esetén `null` (az eredeti megy fel). */
const MAX_EDGE = 1920;
const DOWNSCALE_MIN_BYTES = 600 * 1024;
async function downscaleImage(uri: string): Promise<{ uri: string; width: number; height: number } | null> {
  try {
    const ref = await ImageManipulator.manipulate(uri, { maxWidth: MAX_EDGE, maxHeight: MAX_EDGE }).renderAsync();
    const out = await ref.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });
    return { uri: out.uri, width: out.width, height: out.height };
  } catch (e) {
    console.warn("[media] kép kicsinyítése sikertelen, az eredeti megy fel", e instanceof Error ? e.message : e);
    return null;
  }
}

/** Egy darab feltöltése újrapróbálással (exponenciális várakozás); végleges elutasításnál (4xx) nem próbálkozik tovább. */
async function uploadPiece(piece: File, c: MediaConfig, params: Record<string, string>): Promise<void> {
  let last: unknown;
  for (let attempt = 0; attempt < PIECE_ATTEMPTS; attempt++) {
    if (attempt) await sleep(1000 * 2 ** (attempt - 1));
    try {
      const res = await withTimeout(piece.upload(`${c.baseUrl}/upload/chunk`, { uploadType: UploadType.MULTIPART, fieldName: "file", mimeType: "application/octet-stream", headers: { "x-api-key": c.apiKey }, parameters: params }), PIECE_TIMEOUT_MS, "feltöltés");
      if (res.status >= 200 && res.status < 300) return;
      last = httpErr("chunk", res.status);
      if (res.status < 500 && res.status !== 408 && res.status !== 429) throw last; // végleges elutasítás
    } catch (e) {
      if (e === last) throw e;
      last = e;
      console.warn(`[media] darab feltöltése sikertelen (${attempt + 1}/${PIECE_ATTEMPTS})`, e instanceof Error ? e.message : e);
    }
  }
  throw last instanceof ApiError ? last : new ApiError("NETWORK", "A médiatár nem érhető el.");
}

export interface Uploaded {
  mediaRef: string;
  descriptor: MediaDescriptor;
  encryptedBytes: number;
}

/**
 * Egy helyi fájl (kép/videó) titkosítása chunkonként és feltöltése. A memóriában egyszerre csak egy chunk él.
 * @throws ApiError(PAYLOAD_TOO_LARGE) ha a titkosított méret meghaladja a protokoll-korlátot.
 */
export async function encryptAndUpload(srcUri: string, kind: "image" | "video" | "audio", meta: { mime: string; width?: number; height?: number; durationMs?: number }, onProgress?: (p: number) => void): Promise<Uploaded> {
  const c = await getMediaConfig();
  let srcFile = new File(srcUri);
  let scaled: string | null = null; // a kicsinyített ideiglenes másolat (a végén töröljük)
  if (kind === "image" && meta.mime !== "image/gif" && (srcFile.size ?? 0) > DOWNSCALE_MIN_BYTES) {
    const d = await downscaleImage(srcUri);
    if (d && (new File(d.uri).size ?? Infinity) < (srcFile.size ?? 0)) {
      scaled = d.uri;
      srcFile = new File(d.uri);
      meta = { ...meta, mime: "image/jpeg", width: d.width, height: d.height };
    } else if (d) releaseTemp(d.uri);
  }
  const src = srcFile;
  const plainSize = src.size ?? 0;
  if (!plainSize) throw new Error("Üres fájl");
  const encSize = encryptedSize(plainSize);
  if (encSize > (kind === "image" ? MAX_IMAGE_CIPHERTEXT_BYTES : MAX_VIDEO_CIPHERTEXT_BYTES)) throw new ApiError("PAYLOAD_TOO_LARGE", "A fájl túl nagy.");

  const key = randomBytes(32);
  const base = randomBytes(BASE_NONCE_BYTES);
  const mediaRef = rid(16);
  const enc = tmpFile(`${mediaRef}.enc`);
  enc.create({ overwrite: true });
  const hIn = src.open();
  const hOut = enc.open();
  try {
    const count = Math.max(1, Math.ceil(plainSize / STREAM_CHUNK));
    for (let i = 0; i < count; i++) {
      const plain = await hIn.readBytes(Math.min(STREAM_CHUNK, plainSize - i * STREAM_CHUNK));
      await hOut.writeBytes(encryptChunk(key, base, i, i === count - 1, plain));
    }
  } catch (e) {
    releaseTemp(enc.uri);
    releaseTemp(scaled);
    throw e;
  } finally {
    hIn.close();
    hOut.close();
  }

  const pieces = Math.ceil(encSize / UPLOAD_PIECE);
  const start = await nas(c, "/upload/start", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ filename: mediaRef, totalChunks: pieces, chunkSize: UPLOAD_PIECE, targetPath: c.folder }) }).catch((e) => { releaseTemp(enc.uri); releaseTemp(scaled); throw e; });
  if (!start.ok) { releaseTemp(enc.uri); releaseTemp(scaled); throw httpErr("start", start.status); }
  const { uploadId } = (await start.json().catch((e) => { releaseTemp(enc.uri); releaseTemp(scaled); throw e; })) as { uploadId: string };
  try {
    const hEnc = enc.open();
    try {
      for (let i = 0; i < pieces; i++) {
        const buf = await hEnc.readBytes(Math.min(UPLOAD_PIECE, encSize - i * UPLOAD_PIECE));
        const piece = tmpFile(`${mediaRef}.p${i}`);
        piece.create({ overwrite: true });
        piece.write(buf);
        try {
          await uploadPiece(piece, c, { uploadId, chunkIndex: String(i), totalChunks: String(pieces), filename: mediaRef });
        } finally {
          releaseTemp(piece.uri);
        }
        onProgress?.((i + 1) / (pieces + 1));
      }
    } finally {
      hEnc.close();
    }
    const fin = await nas(c, "/upload/finish", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ uploadId, totalChunks: pieces, filename: mediaRef, targetPath: c.folder }) });
    if (!fin.ok) throw httpErr("finish", fin.status);
    onProgress?.(1);
  } catch (e) {
    await nas(c, "/upload/failed", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ uploadId, filename: mediaRef, totalChunks: pieces }) }).catch(() => undefined);
    throw e;
  } finally {
    releaseTemp(enc.uri);
    releaseTemp(scaled);
  }
  return { mediaRef, encryptedBytes: encSize, descriptor: { key: toB64(key), nonce: toB64(base), size: plainSize, ...meta } };
}

function httpErr(step: string, status: number): ApiError {
  console.warn(`[media] ${step} sikertelen: HTTP ${status}`);
  if (status === 401 || status === 403) dropMediaConfig(); // lejárt/forgatott kulcs → legközelebb újra lekérjük
  return new ApiError(status >= 500 ? "SERVICE_UNAVAILABLE" : "FORBIDDEN", "A médiatár hibát jelzett.", status);
}

const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/heic": "heic", "image/webp": "webp", "video/mp4": "mp4", "video/quicktime": "mov" };

/** Letöltés + visszafejtés ideiglenes fájlba; a hívó felel a `releaseTemp`-ért. */
export async function downloadAndDecrypt(mediaRef: string, d: MediaDescriptor): Promise<string> {
  const c = await getMediaConfig();
  const encFile = tmpFile(`${mediaRef}.dl`);
  if (encFile.exists) encFile.delete();
  try {
    await withTimeout(File.downloadFileAsync(`${c.baseUrl}/download?path=${encodeURIComponent(`${c.folder}/${mediaRef}`)}`, encFile, { headers: { "x-api-key": c.apiKey }, idempotent: true }), DOWNLOAD_TIMEOUT_MS, "letöltés");
  } catch (e) {
    releaseTemp(encFile.uri);
    console.warn("[media] letöltés sikertelen", e instanceof Error ? e.message : e);
    dropMediaConfig();
    throw new ApiError("NETWORK", "A média nem tölthető le.");
  }
  const out = tmpFile(`${rid(8)}.${EXT[d.mime] ?? "bin"}`);
  out.create({ overwrite: true });
  const key = fromB64(d.key);
  const base = fromB64(d.nonce);
  const total = encFile.size ?? 0;
  const step = STREAM_CHUNK + TAG_BYTES;
  const count = Math.max(1, Math.ceil(total / step));
  const hIn = encFile.open();
  const hOut = out.open();
  try {
    for (let i = 0; i < count; i++) {
      const ct = await hIn.readBytes(Math.min(step, total - i * step));
      await hOut.writeBytes(decryptChunk(key, base, i, i === count - 1, ct));
    }
  } catch (e) {
    releaseTemp(out.uri);
    console.warn("[media] visszafejtés sikertelen", e instanceof Error ? e.message : e);
    throw new Error("A média sérült.");
  } finally {
    hIn.close();
    hOut.close();
    releaseTemp(encFile.uri);
  }
  return out.uri;
}
