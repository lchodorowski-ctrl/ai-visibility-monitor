import crypto from "node:crypto";

export const GSC_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const JWT_LIFETIME_S = 3600;
const EXPIRY_MARGIN_S = 60;
const INVALID_SA_MESSAGE = "GOOGLE_SERVICE_ACCOUNT_JSON: brak client_email albo private_key";

export interface ServiceAccount {
  client_email: string;
  private_key: string;
}

export interface GoogleAuth {
  email: string;
  getAccessToken(): Promise<string>;
}

/** Klucz konta usługi: surowy JSON albo ten sam JSON zakodowany w base64 (wygodniejszy w plikach .env). */
export function parseServiceAccount(raw: string): ServiceAccount {
  const text = raw.trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.startsWith("{") ? text : Buffer.from(text, "base64").toString("utf8"));
  } catch {
    throw new Error(INVALID_SA_MESSAGE);
  }
  const { client_email, private_key } = (parsed ?? {}) as Partial<ServiceAccount>;
  if (typeof client_email !== "string" || !client_email || typeof private_key !== "string" || !private_key) {
    throw new Error(INVALID_SA_MESSAGE);
  }
  // Klucz wklejony przez zmienną środowiskową bywa z dosłownymi "\n" zamiast końców linii.
  return { client_email, private_key: private_key.replace(/\\n/g, "\n") };
}

const b64url = (value: string | Buffer) => Buffer.from(value).toString("base64url");

function signJwt(sa: ServiceAccount, scopes: string[], iat: number): string {
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(
    JSON.stringify({ iss: sa.client_email, scope: scopes.join(" "), aud: TOKEN_URL, iat, exp: iat + JWT_LIFETIME_S }),
  );
  const signature = crypto.createSign("RSA-SHA256").update(`${header}.${claims}`).sign(sa.private_key);
  return `${header}.${claims}.${b64url(signature)}`;
}

export function createGoogleAuth(
  sa: ServiceAccount,
  scopes: string[],
  deps: { fetch?: typeof fetch; now?: () => number } = {},
): GoogleAuth {
  const now = deps.now ?? Date.now;
  let cached: { token: string; expiresAtMs: number } | null = null;
  let inflight: Promise<string> | null = null;

  async function fetchToken(): Promise<string> {
    const startedAtMs = now();
    const assertion = signJwt(sa, scopes, Math.floor(startedAtMs / 1000));
    // fetch pobierany w chwili wywołania (nie przy tworzeniu), żeby podmiana globalnego fetch działała.
    const res = await (deps.fetch ?? fetch)(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }).toString(),
    });
    if (!res.ok) throw new Error(`Google OAuth ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!data.access_token) throw new Error("Google OAuth: odpowiedź bez access_token");
    const expiresIn = typeof data.expires_in === "number" ? data.expires_in : JWT_LIFETIME_S;
    cached = { token: data.access_token, expiresAtMs: startedAtMs + (expiresIn - EXPIRY_MARGIN_S) * 1000 };
    return data.access_token;
  }

  return {
    email: sa.client_email,
    async getAccessToken() {
      if (cached && now() < cached.expiresAtMs) return cached.token;
      // Równoległe wywołania dzielą jedno pobranie tokenu.
      inflight ??= fetchToken().finally(() => {
        inflight = null;
      });
      return inflight;
    },
  };
}

let singleton: { raw: string; auth: GoogleAuth } | null = null;

/** Auth z env GOOGLE_SERVICE_ACCOUNT_JSON (zakres Search Console), jedna instancja na proces. */
export function getGoogleAuth(): GoogleAuth {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("Brak GOOGLE_SERVICE_ACCOUNT_JSON: skonfiguruj konto usługi Google (README, sekcja Google)");
  if (!singleton || singleton.raw !== raw) {
    singleton = { raw, auth: createGoogleAuth(parseServiceAccount(raw), [GSC_SCOPE]) };
  }
  return singleton.auth;
}
