import { describe, it, expect, vi, afterEach } from "vitest";
import crypto from "node:crypto";
import { parseServiceAccount, createGoogleAuth, getGoogleAuth, GSC_SCOPE } from "@/lib/google/auth";

const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const PRIVATE_PEM = privateKey.export({ type: "pkcs8", format: "pem" }) as string;
const SA = { client_email: "bot@psai.iam.gserviceaccount.com", private_key: PRIVATE_PEM };

const decodePart = (part: string) => JSON.parse(Buffer.from(part, "base64url").toString("utf8"));

function tokenResponse(token: string, expiresIn = 3600) {
  return new Response(JSON.stringify({ access_token: token, expires_in: expiresIn, token_type: "Bearer" }), { status: 200 });
}

describe("google auth", () => {
  afterEach(() => {
    delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  });

  it("parseServiceAccount czyta JSON i base64", () => {
    const raw = JSON.stringify({ ...SA, project_id: "x" });
    expect(parseServiceAccount(raw)).toEqual(SA);
    expect(parseServiceAccount(Buffer.from(raw).toString("base64"))).toEqual(SA);
    expect(parseServiceAccount(`  ${raw}\n`)).toEqual(SA);
  });

  it("parseServiceAccount: brak pól albo śmieci → czytelny błąd", () => {
    const msg = "GOOGLE_SERVICE_ACCOUNT_JSON: brak client_email albo private_key";
    expect(() => parseServiceAccount(JSON.stringify({ client_email: "a@b" }))).toThrow(msg);
    expect(() => parseServiceAccount(JSON.stringify({ private_key: "k" }))).toThrow(msg);
    expect(() => parseServiceAccount("to nie jest json")).toThrow(msg);
    expect(() => parseServiceAccount("")).toThrow(msg);
  });

  it("parseServiceAccount: dosłowne \\n w private_key zamienia na końce linii", () => {
    const mangled = { client_email: SA.client_email, private_key: PRIVATE_PEM.replace(/\n/g, "\\n") };
    const sa = parseServiceAccount(JSON.stringify(mangled));
    expect(sa.private_key).toBe(PRIVATE_PEM);
  });

  it("JWT jest podpisany RS256 i ma poprawne claims", async () => {
    const fetchMock = vi.fn().mockResolvedValue(tokenResponse("t1"));
    const now = () => 1_800_000_000_000;
    const auth = createGoogleAuth(SA, [GSC_SCOPE, "https://www.googleapis.com/auth/other"], { fetch: fetchMock, now });
    expect(auth.email).toBe(SA.client_email);
    await expect(auth.getAccessToken()).resolves.toBe("t1");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://oauth2.googleapis.com/token");
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    const params = new URLSearchParams(init.body as string);
    expect(params.get("grant_type")).toBe("urn:ietf:params:oauth:grant-type:jwt-bearer");

    const [h, c, s] = (params.get("assertion") as string).split(".");
    expect(decodePart(h)).toEqual({ alg: "RS256", typ: "JWT" });
    const claims = decodePart(c);
    expect(claims.iss).toBe(SA.client_email);
    expect(claims.scope).toBe(`${GSC_SCOPE} https://www.googleapis.com/auth/other`);
    expect(claims.aud).toBe("https://oauth2.googleapis.com/token");
    expect(claims.iat).toBe(1_800_000_000);
    expect(claims.exp - claims.iat).toBe(3600);
    const ok = crypto.verify("RSA-SHA256", Buffer.from(`${h}.${c}`), publicKey, Buffer.from(s, "base64url"));
    expect(ok).toBe(true);
  });

  it("token jest cache'owany i odświeżany po wygaśnięciu", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(tokenResponse("t1"))
      .mockResolvedValueOnce(tokenResponse("t2"));
    let t = 1_800_000_000_000;
    const auth = createGoogleAuth(SA, [GSC_SCOPE], { fetch: fetchMock, now: () => t });

    await expect(auth.getAccessToken()).resolves.toBe("t1");
    await expect(auth.getAccessToken()).resolves.toBe("t1");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    t += 3550 * 1000; // za granicą expires_in - 60 = 3540 s
    await expect(auth.getAccessToken()).resolves.toBe("t2");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("równoległe wywołania dzielą jedno pobranie tokenu", async () => {
    const fetchMock = vi.fn().mockResolvedValue(tokenResponse("t1"));
    const auth = createGoogleAuth(SA, [GSC_SCOPE], { fetch: fetchMock, now: () => 1_800_000_000_000 });
    const tokens = await Promise.all([auth.getAccessToken(), auth.getAccessToken(), auth.getAccessToken()]);
    expect(tokens).toEqual(["t1", "t1", "t1"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("błąd wymiany tokenu nie ujawnia klucza i nie zatruwa cache", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "invalid_grant", error_description: "Invalid JWT Signature." }), { status: 400 }))
      .mockResolvedValueOnce(tokenResponse("t1"));
    const auth = createGoogleAuth(SA, [GSC_SCOPE], { fetch: fetchMock, now: () => 1_800_000_000_000 });
    const err = await auth.getAccessToken().catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toContain("400");
    expect((err as Error).message).toContain("invalid_grant");
    expect((err as Error).message).not.toContain("PRIVATE KEY");
    await expect(auth.getAccessToken()).resolves.toBe("t1");
  });

  it("getGoogleAuth: brak zmiennej → błąd z odesłaniem do README, jest singletonem", () => {
    expect(() => getGoogleAuth()).toThrow("Brak GOOGLE_SERVICE_ACCOUNT_JSON: skonfiguruj konto usługi Google (README, sekcja Google)");
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON = Buffer.from(JSON.stringify(SA)).toString("base64");
    const a = getGoogleAuth();
    expect(a.email).toBe(SA.client_email);
    expect(getGoogleAuth()).toBe(a);
  });
});
