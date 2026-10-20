import { describe, it, expect, vi } from "vitest";
import { detectBrandPresence, offsiteTargets, targetPresenceChecker, MAX_TARGETS } from "@/lib/recommend/target-presence";

const brand = { name: "Polska Szkoła AI", aliases: ["PSAI"], domains: ["polskaszkola.ai"] };
const entry = (i: number) => `<li><a href="https://firma${i}.pl">Firma szkoleniowa ${i}</a> szkolenia AI dla biznesu i zespołów</li>`;
/** Directory page: `n` entries, 1-based positions in `at` replaced with the given HTML. */
const listing = (n: number, at: Record<number, string> = {}) =>
  `<html><head><title>Szkolenia AI</title></head><body><nav><a href="/">Start</a></nav><ul>${Array.from({ length: n }, (_, i) => at[i + 1] ?? entry(i + 1)).join("")}</ul></body></html>`;
const prose = (middle: string) => `<body><p>${"Wstęp o szkoleniach AI dla firm. ".repeat(20)}</p><p>${middle}</p><p>${"Dalsza część artykułu o rynku. ".repeat(20)}</p></body>`;
const html = (body: string, status = 200) => new Response(body, { status, headers: { "content-type": "text/html" } });

describe("detectBrandPresence", () => {
  it("marka na liście: liczy wpisy i podaje pozycję pierwszego (przypadek aiprzewodnik.pl: 20, 21 i 50 z 91)", () => {
    const own = "<li>Polska Szkoła AI: warsztaty AI dla firm</li>";
    expect(detectBrandPresence(listing(91, { 20: own, 21: own, 50: own }), brand)).toEqual({ brandPresent: true, mentions: 3, firstPositionRatio: 0.22, linked: false });
  });
  it("marki nie ma → brandPresent: false", () => {
    expect(detectBrandPresence(listing(30), brand)).toEqual({ brandPresent: false, mentions: 0, firstPositionRatio: null, linked: false });
  });
  it("alias i nazwa bez względu na wielkość liter i ogonki, ale nie fragment innego słowa", () => {
    expect(detectBrandPresence(listing(10, { 3: "<li>polska szkola ai, Warszawa</li>" }), brand)).toMatchObject({ brandPresent: true, mentions: 1, firstPositionRatio: 0.3 });
    expect(detectBrandPresence(listing(10, { 8: "<li>Kursy od PSAI</li>" }), brand)).toMatchObject({ brandPresent: true, firstPositionRatio: 0.8 });
    expect(detectBrandPresence(listing(10, { 2: "<li>kopsaid i PSAIx</li>" }), brand).brandPresent).toBe(false);
  });
  it("link do własnej domeny (także www) to obecność z linked: true; podobna domena nie", () => {
    const linked = detectBrandPresence(listing(10, { 5: `<li><a href="https://www.polskaszkola.ai/szkolenia.html">Zobacz ofertę</a></li>` }), brand);
    expect(linked).toEqual({ brandPresent: true, mentions: 1, firstPositionRatio: 0.5, linked: true });
    expect(detectBrandPresence(listing(10, { 5: `<li><a href="https://notpolskaszkola.ai/">Inna firma</a></li>` }), brand).brandPresent).toBe(false);
  });
  it("strona bez listy: pozycja z miejsca w tekście, wzmianki to trafienia w tekście", () => {
    const r = detectBrandPresence(prose("Polecamy Polska Szkoła AI oraz PSAI Kompas."), brand);
    expect(r.brandPresent).toBe(true); expect(r.mentions).toBe(2);
    expect(r.firstPositionRatio).toBeGreaterThan(0.4); expect(r.firstPositionRatio).toBeLessThan(0.6);
  });
  it("karty pod nagłówkami (bez list): pozycja wśród kart, nie wśród linków menu (układ aiprzewodnik.pl)", () => {
    // as on the real page, a link wraps each card, so its opening tag sits before the card's heading
    const card = (i: number, provider: string, href: string) => `<a class="card" href="${href}"><h3>Kurs ${i}</h3><div class="card-meta">${provider}, online, 8 h</div><div class="card-footer">Odwiedź</div></a>`;
    const nav = `<ul><li><a href="/">Start</a></li><li><a href="/a">Kursy</a></li><li><a href="/b">Kontakt</a></li></ul>` + Array.from({ length: 12 }, (_, i) => `<a href="/m${i}">Menu ${i}</a>`).join("");
    const cards = Array.from({ length: 91 }, (_, i) => ([20, 21, 50].includes(i + 1) ? card(i + 1, "Polska Szkoła AI", "https://polskaszkola.ai/szkolenia.html") : card(i + 1, `Firma ${i + 1}`, `https://firma${i + 1}.pl/`))).join("");
    expect(detectBrandPresence(`<body>${nav}<h2>Szkolenia AI dla biznesu</h2>${cards}</body>`, brand)).toEqual({ brandPresent: true, mentions: 3, firstPositionRatio: 0.22, linked: true });
  });
  it("<li> bez znacznika zamykającego też jest wpisem", () => {
    const body = `<body><ul>${Array.from({ length: 20 }, (_, i) => (i === 9 ? "<li>Polska Szkoła AI" : `<li>Firma szkoleniowa numer ${i + 1} z opisem oferty`)).join("")}</ul></body>`;
    expect(detectBrandPresence(body, brand)).toMatchObject({ brandPresent: true, firstPositionRatio: 0.5 });
  });
  it("skrypty, style i komentarze nie liczą się jako treść", () => {
    const page = listing(10).replace("</body>", `<script>var b = "Polska Szkoła AI";</script><!-- PSAI --><style>.psai{}</style></body>`);
    expect(detectBrandPresence(page, brand).brandPresent).toBe(false);
  });
  it("za mało tekstu (strona renderowana w JS, ściana logowania) → nie wiadomo, nawet gdy nazwa pada", () => {
    expect(detectBrandPresence(`<body><div id="root"></div><p>Zaloguj się</p></body>`, brand).brandPresent).toBeNull();
    expect(detectBrandPresence(`<body><p>PSAI</p></body>`, brand).brandPresent).toBeNull();
  });
});

describe("offsiteTargets", () => {
  it("pomija własne domeny (z subdomenami) i nie-http, deduplikuje, zachowuje kolejność, limit", () => {
    expect(offsiteTargets(["https://polskaszkola.ai/a", "https://blog.polskaszkola.ai/b", "https://a.pl/1", "ftp://x.pl/f", "https://a.pl/1", "https://b.pl/2"], ["polskaszkola.ai"]))
      .toEqual(["https://a.pl/1", "https://b.pl/2"]);
    expect(offsiteTargets(Array.from({ length: 9 }, (_, i) => `https://s${i}.pl/`), [])).toHaveLength(MAX_TARGETS);
  });
});

describe("targetPresenceChecker", () => {
  it("pobiera tylko strony spoza witryny marki, z UA bota i limitem czasu", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => html(listing(10, { 2: "<li>PSAI</li>" })));
    const check = targetPresenceChecker(brand, fetchImpl);
    const r = await check(["https://polskaszkola.ai/x", "https://aiprzewodnik.pl/szkolenia-ai-biznes.html"]);
    expect(r).toEqual([{ url: "https://aiprzewodnik.pl/szkolenia-ai-biznes.html", brandPresent: true, mentions: 1, firstPositionRatio: 0.2, linked: false }]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const init = fetchImpl.mock.calls[0][1]!;
    expect((init.headers as Record<string, string>)["User-Agent"]).toMatch(/^PSAI-VisibilityBot/);
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
  it("błąd sieci, 404 i PDF → nie wiadomo, bez wyjątku (generowanie idzie dalej)", async () => {
    const fetchImpl = vi.fn(async (u: RequestInfo | URL) => {
      if (String(u).includes("down")) throw new Error("ECONNRESET");
      if (String(u).includes("gone")) return html("nie ma", 404);
      return new Response("%PDF-1.7 Polska Szkoła AI", { status: 200 });
    }) as unknown as typeof fetch;
    const r = await targetPresenceChecker(brand, fetchImpl)(["https://down.pl/", "https://gone.pl/", "https://raport.pl/a.pdf"]);
    expect(r.map((t) => [t.url, t.brandPresent])).toEqual([["https://down.pl/", null], ["https://gone.pl/", null], ["https://raport.pl/a.pdf", null]]);
    expect(r[0]).toEqual({ url: "https://down.pl/", brandPresent: null, mentions: 0, firstPositionRatio: null, linked: false });
  });
  it("tę samą stronę pobiera raz na cały przebieg (cache między pytaniami), bez ponowień", async () => {
    const fetchImpl = vi.fn(async () => html(listing(10))) as unknown as typeof fetch;
    const check = targetPresenceChecker(brand, fetchImpl);
    await check(["https://a.pl/1", "https://b.pl/2"]);
    await check(["https://b.pl/2", "https://c.pl/3"]);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    const failing = vi.fn(async () => { throw new Error("timeout"); }) as unknown as typeof fetch;
    await targetPresenceChecker(brand, failing)(["https://a.pl/1"]);
    expect(failing).toHaveBeenCalledTimes(1);
  });
  it("najwyżej MAX_TARGETS stron na pytanie", async () => {
    const fetchImpl = vi.fn(async () => html(listing(10))) as unknown as typeof fetch;
    const r = await targetPresenceChecker(brand, fetchImpl)(Array.from({ length: 10 }, (_, i) => `https://s${i}.pl/`));
    expect(r).toHaveLength(MAX_TARGETS); expect(fetchImpl).toHaveBeenCalledTimes(MAX_TARGETS);
  });
});
