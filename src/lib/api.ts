/**
 * Sotto API kliens: Bearer token, automatikus (egyszeri, összevont) token-frissítés 401-re, egységes hibatípus.
 * A hálózati hiba `NETWORK` kóddal jön, hogy a UI offline állapotot jelezhessen (nincs néma hiba).
 */
import { API_URL } from "@/config";
import type { ApiResponse, ErrorCode } from "@/protocol/constants";

export class ApiError extends Error {
  constructor(public code: ErrorCode | "NETWORK" | "BAD_RESPONSE", message: string, public status = 0) {
    super(message);
    this.name = "ApiError";
  }
}

export interface Tokens {
  accessToken: string;
  refreshToken: string;
}
interface AuthHooks {
  getTokens(): Tokens | null;
  setTokens(t: Tokens): Promise<void>;
  /** A munkamenet végleg érvénytelen (lejárt/visszavont refresh token). */
  onAuthLost(): void;
}
let hooks: AuthHooks | null = null;
export function configureAuth(h: AuthHooks) {
  hooks = h;
}

let refreshing: Promise<boolean> | null = null;
async function refresh(): Promise<boolean> {
  const t = hooks?.getTokens();
  if (!t) return false;
  refreshing ??= (async () => {
    try {
      const res = await rawFetch("/api/auth/refresh", { method: "POST", body: { refreshToken: t.refreshToken } });
      const json = (await res.json()) as ApiResponse<{ tokens: Tokens }>;
      if (res.ok && json.ok) {
        await hooks!.setTokens(json.data.tokens);
        return true;
      }
      // Csak végleges elutasításnál (nem hálózati/szerverhibánál) vesszük el a munkamenetet.
      if (res.status === 401 || res.status === 403) hooks!.onAuthLost();
      return false;
    } catch {
      return false;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

async function rawFetch(path: string, o: { method?: string; body?: unknown; token?: string }): Promise<Response> {
  try {
    return await fetch(API_URL + path, {
      method: o.method ?? "GET",
      headers: { "content-type": "application/json", ...(o.token ? { authorization: `Bearer ${o.token}` } : {}) },
      body: o.body === undefined ? undefined : JSON.stringify(o.body),
    });
  } catch {
    throw new ApiError("NETWORK", "A szerver nem érhető el.");
  }
}

export async function api<T>(path: string, o: { method?: string; body?: unknown; auth?: boolean } = {}): Promise<T> {
  const auth = o.auth !== false;
  const send = () => rawFetch(path, { method: o.method, body: o.body, token: auth ? hooks?.getTokens()?.accessToken : undefined });
  let res = await send();
  if (res.status === 401 && auth && (await refresh())) res = await send();
  let json: ApiResponse<T>;
  try {
    json = (await res.json()) as ApiResponse<T>;
  } catch {
    throw new ApiError("BAD_RESPONSE", "Érvénytelen szerverválasz.", res.status);
  }
  if (!json.ok) throw new ApiError(json.error.code, json.error.message, res.status);
  return json.data;
}
