import { describe, it, expect } from "vitest";
import { normalizeTitle, fingerprint, mergeEvidence } from "@/lib/recommend/fingerprint";
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
