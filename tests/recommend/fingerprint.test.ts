import { describe, it, expect } from "vitest";
import { normalizeTitle, fingerprint, fingerprintFor, mergeEvidence } from "@/lib/recommend/fingerprint";
describe("fingerprint", () => {
  it("ten sam tytuł z różną wielkością liter/diakrytykami daje ten sam fingerprint", () => {
    expect(fingerprint("content_new", "Opublikuj stronę: Szkolenia AI dla firm")).toBe(fingerprint("content_new", "opublikuj strone  szkolenia ai dla firm!"));
  });
  it("NFC i NFD dają ten sam fingerprint", () => {
    expect(fingerprint("offsite", "Zażółć gęślą jaźń".normalize("NFC"))).toBe(fingerprint("offsite", "Zażółć gęślą jaźń".normalize("NFD")));
  });
  it("inny typ → inny fingerprint", () => { expect(fingerprint("offsite", "x")).not.toBe(fingerprint("technical", "x")); });
  it("fingerprint to sha1 hex", () => { expect(fingerprint("offsite", "x")).toMatch(/^[0-9a-f]{40}$/); });
  it("normalizeTitle usuwa nazwę marki", () => {
    expect(normalizeTitle("PSAI: dodaj FAQ")).toBe("dodaj faq");
    expect(normalizeTitle("Polska Szkoła AI — dodaj FAQ")).toBe("dodaj faq");
    expect(normalizeTitle("Dodaj FAQ do Polska Szkola AI!")).toBe("dodaj faq do");
  });
  it("normalizeTitle nie rusza słów zawierających 'psai' w środku", () => {
    expect(normalizeTitle("Wypsaic strone")).toBe("wypsaic strone");
  });
});
describe("mergeEvidence", () => {
  const a = { prompt_ids: ["p1"], visibility_by_engine: { openai: 0 }, cited_domains: [{ domain: "parp.gov.pl", count: 2 }], cited_urls: ["u1"], competitors_mentioned: [{ name: "EY", count: 1 }], sample_quotes: ["q1", "q2", "q3", "q4"] };
  const b = { prompt_ids: ["p1", "p2"], visibility_by_engine: { gemini: 0.2 }, cited_domains: [{ domain: "parp.gov.pl", count: 1 }, { domain: "ey.pl", count: 1 }], cited_urls: ["u1", "u2"], competitors_mentioned: [{ name: "EY", count: 2 }], sample_quotes: ["q5", "q6", "q7"] };
  it("łączy prompt_ids, bierze maksimum liczników domen i konkurentów, limituje cytaty", () => {
    const m = mergeEvidence(a, b);
    expect(m.prompt_ids).toEqual(["p1", "p2"]);
    expect(m.cited_domains).toEqual([{ domain: "parp.gov.pl", count: 2 }, { domain: "ey.pl", count: 1 }]);
    expect(m.cited_urls).toEqual(["u1", "u2"]);
    expect(m.competitors_mentioned).toEqual([{ name: "EY", count: 2 }]);
    expect(m.sample_quotes).toHaveLength(6);
    expect(m.visibility_by_engine).toEqual({ openai: 0, gemini: 0.2 });
  });
  it("limituje URL do 20, nie mutuje argumentów, późniejsza widoczność wygrywa", () => {
    const many = { ...a, cited_urls: Array.from({ length: 15 }, (_, i) => `a${i}`) };
    const more = { ...b, cited_urls: Array.from({ length: 15 }, (_, i) => `b${i}`), visibility_by_engine: { openai: 0.5 } };
    const snapshot = JSON.stringify([many, more]);
    const m = mergeEvidence(many, more);
    expect(m.cited_urls).toHaveLength(20);
    expect(m.visibility_by_engine.openai).toBe(0.5);
    expect(JSON.stringify([many, more])).toBe(snapshot);
  });
  it("jest idempotentne: ponowne scalenie tych samych dowodów nic nie zmienia", () => {
    const once = mergeEvidence(a, b);
    expect(mergeEvidence(once, b)).toEqual(once);
    const few = { ...a, sample_quotes: ["q1"] };
    const onceFew = mergeEvidence(few, b);
    expect(mergeEvidence(onceFew, b)).toEqual(onceFew);
    expect(onceFew.sample_quotes).toEqual(["q1", "q5", "q6", "q7"]);
  });
});

describe("fingerprintFor", () => {
  const f = (type: string, title: string, target_url: string | null) => fingerprintFor({ type, title, target_url });
  it("content_improve: ta sama ścieżka, różne tytuły → ten sam fingerprint", () => {
    expect(f("content_improve", "Dodać FAQ", "/szkolenia.html")).toBe(f("content_improve", "Tabela porównawcza programów", "/szkolenia.html"));
  });
  it("content_improve: wielkość liter, ukośnik końcowy, query, hash i pełny URL nie mają znaczenia", () => {
    const base = f("content_improve", "a", "/szkolenia.html");
    expect(f("content_improve", "b", "/Szkolenia.html?utm=1#faq")).toBe(base);
    expect(f("content_improve", "c", "https://www.polskaszkola.ai/szkolenia.html")).toBe(base);
    expect(f("content_improve", "d", "/oferta/")).toBe(f("content_improve", "e", "/oferta"));
  });
  it("content_improve: inna ścieżka → inny fingerprint; inny typ → inny fingerprint", () => {
    expect(f("content_improve", "a", "/a")).not.toBe(f("content_improve", "a", "/b"));
    expect(f("content_improve", "a", "/a")).not.toBe(f("content_new", "a", "/a"));
  });
  it("offsite: ten sam host, różne ścieżki → ten sam fingerprint (www ignorowane)", () => {
    const a = f("offsite", "Wpis w BUR", "https://uslugirozwojowe.parp.gov.pl/");
    expect(f("offsite", "Inny tytuł", "https://uslugirozwojowe.parp.gov.pl/wyszukiwarka/uslugi/podglad?id=1")).toBe(a);
    expect(f("offsite", "x", "https://www.myskills.pl/a")).toBe(f("offsite", "y", "https://myskills.pl/b"));
    expect(f("offsite", "x", "https://a.pl/")).not.toBe(f("offsite", "x", "https://b.pl/"));
  });
  it("offsite bez URL-a absolutnego wraca do tytułu", () => {
    expect(f("offsite", "Wpis w BUR", "/sciezka")).toBe(fingerprint("offsite", "Wpis w BUR"));
    expect(f("offsite", "Wpis w BUR", null)).toBe(fingerprint("offsite", "Wpis w BUR"));
  });
  it("content_new: ścieżka gdy jest, inaczej tytuł", () => {
    expect(f("content_new", "a", "/poradnik")).toBe(f("content_new", "b", "/poradnik/"));
    expect(f("content_new", "Poradnik", null)).toBe(fingerprint("content_new", "Poradnik"));
    expect(f("content_new", "Poradnik", "to nie jest url")).toBe(fingerprint("content_new", "Poradnik"));
  });
  it("technical i fact_fix zawsze po tytule, nawet z targetem", () => {
    expect(f("technical", "Dodaj sitemap", "/sitemap.xml")).toBe(fingerprint("technical", "Dodaj sitemap"));
    expect(f("fact_fix", "Popraw cenę", "/cennik")).toBe(fingerprint("fact_fix", "Popraw cenę"));
    expect(f("technical", "A", "/x")).not.toBe(f("technical", "B", "/x"));
  });
  it("offsite na serwisach UGC: różne posty LinkedIn się nie scalają, subdomeny i www tak", () => {
    expect(f("offsite", "a", "https://pl.linkedin.com/posts/a-1")).not.toBe(f("offsite", "a", "https://pl.linkedin.com/posts/b-2"));
    expect(f("offsite", "x", "https://pl.linkedin.com/posts/a")).toBe(f("offsite", "y", "https://www.linkedin.com/posts/a/"));
  });
  it("offsite YouTube: różne parametry v się nie scalają, ten sam v tak; youtu.be po ścieżce", () => {
    expect(f("offsite", "a", "https://www.youtube.com/watch?v=AbC123")).not.toBe(f("offsite", "a", "https://www.youtube.com/watch?v=abc123"));
    expect(f("offsite", "a", "https://youtube.com/watch?v=AbC123&t=5")).toBe(f("offsite", "b", "https://www.youtube.com/watch?v=AbC123"));
    expect(f("offsite", "a", "https://youtu.be/AbC123")).not.toBe(f("offsite", "a", "https://youtu.be/XyZ789"));
  });
  it("offsite parp.gov.pl nadal scala różne ścieżki", () => {
    expect(f("offsite", "a", "https://uslugirozwojowe.parp.gov.pl/a?id=1")).toBe(f("offsite", "b", "https://uslugirozwojowe.parp.gov.pl/b"));
  });
});
