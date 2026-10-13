import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// actions.ts pulls in the Trigger.dev SDK and Supabase; the forms only need a function reference.
vi.mock("@/app/app/recommendations/actions", () => ({ setRecommendationStatus: async () => {}, refreshRecommendations: async () => {} }));

import { RecommendationCard } from "@/app/app/recommendations/RecommendationCard";
import { StatusForm } from "@/app/app/recommendations/StatusForm";
import type { RecommendationRow } from "@/lib/recommend/queries";
import { resolveTargetUrl } from "@/lib/recommend/target-url";

const SITE = "https://www.polskaszkola.ai";

const base = {
  id: "11111111-1111-4111-8111-111111111111", project_id: "p", prompt_id: "q", run_id: null, type: "content_new",
  title: "Opublikuj stronę o szkoleniach AI dla firm", summary: "Asystenci cytują konkurencję, bo Wasza oferta nie ma osobnej strony.",
  action_steps: [], target_url: "https://example.com/szkolenia-ai", suggested_outline: null, evidence: {}, rationale: null,
  impact: 5, effort: 2, priority: 8, status: "todo", fingerprint: "f", created_at: "2026-10-13T10:00:00Z", updated_at: "2026-10-13T10:00:00Z",
  prompts: { text: "Jakie są najlepsze szkolenia z AI dla firm w Polsce?" },
} as RecommendationRow;

describe("RecommendationCard", () => {
  it("pokazuje typ, tytuł, priorytet, wysiłek, pytanie i link zewnętrzny", () => {
    const html = renderToStaticMarkup(<RecommendationCard r={base} siteUrl={SITE} />);
    expect(html).toContain("Nowa treść");
    expect(html).toContain("Opublikuj stronę o szkoleniach AI dla firm");
    expect(html).toContain('priorytet <span class="text-red">wysoki</span>');
    expect(html).toContain('aria-label="wpływ 5 z 5"');
    expect(html).toContain('aria-label="wysiłek 2 z 5"');
    expect(html).toContain("●●●●●");
    expect(html).toContain("●●○○○");
    expect(html).toContain("Pytanie: Jakie są najlepsze szkolenia");
    expect(html).toContain('href="https://example.com/szkolenia-ai"');
    expect(html).toContain('rel="noreferrer"');
    expect(html).toContain(`href="/app/recommendations/${base.id}"`);
    expect(html).not.toContain("bg-ink");
  });
  it("ścieżka w target_url prowadzi na stronę marki (site_url), nie do aplikacji; priority null liczy się z impact i effort", () => {
    const html = renderToStaticMarkup(<RecommendationCard r={{ ...base, target_url: "/llms.txt", priority: null, impact: 1, effort: 5, prompts: null }} siteUrl={SITE} />);
    expect(html).toContain('href="https://www.polskaszkola.ai/llms.txt"');
    expect(html).not.toContain('href="/llms.txt"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noreferrer"');
    expect(html).toContain(">/llms.txt<");
    expect(html).toContain("priorytet <span>niski</span>");
    expect(html).toContain('aria-label="wpływ 1 z 5"');
    expect(html).toContain('aria-label="wysiłek 5 z 5"');
    expect(html).not.toContain("Pytanie:");
  });
  it("wersja odwrócona używa tła ink", () => {
    expect(renderToStaticMarkup(<RecommendationCard r={base} siteUrl={SITE} inverse />)).toContain("bg-ink");
  });
  it("słowa wpływ/wysiłek są ukryte przed czytnikiem (etykietę niosą kropki), a nie ma starego „wysiłek mały”", () => {
    const html = renderToStaticMarkup(<RecommendationCard r={base} siteUrl={SITE} />);
    expect(html).toContain('<span aria-hidden="true">wpływ</span>');
    expect(html).toContain('<span aria-hidden="true">wysiłek</span>');
    expect(html).not.toContain("wysiłek mały");
  });
  it("odrzucona pokazuje status na czerwono", () => {
    const html = renderToStaticMarkup(<RecommendationCard r={{ ...base, priority: 4, status: "dismissed" }} siteUrl={SITE} />);
    expect(html).toContain('<span class="text-red">odrzucone</span>');
  });
  it("tylko wysoki priorytet jest na czerwono; średni i niski bez zmian", () => {
    const html = (priority: number) => renderToStaticMarkup(<RecommendationCard r={{ ...base, priority }} siteUrl={SITE} />);
    expect(html(6)).toContain('priorytet <span class="text-red">wysoki</span>');
    expect(html(5)).toContain("priorytet <span>średni</span>");
    expect(html(5)).not.toContain('class="text-red"');
    expect(html(2)).toContain("priorytet <span>niski</span>");
  });
  it("na odwróconym tle (ink) wysoki priorytet nie jest czerwony, bo kontrast byłby za mały", () => {
    const html = renderToStaticMarkup(<RecommendationCard r={base} siteUrl={SITE} inverse />);
    expect(html).toContain("priorytet <span>wysoki</span>");
    expect(html).not.toContain('class="text-red"');
  });
});

describe("resolveTargetUrl", () => {
  it("rozwiązuje ścieżkę względem site_url, zostawia http(s), uzupełnia samą domenę", () => {
    expect(resolveTargetUrl("/szkolenia-ai", "https://staging.example.netlify.app/")).toBe("https://staging.example.netlify.app/szkolenia-ai");
    expect(resolveTargetUrl("https://parp.gov.pl/kurs", SITE)).toBe("https://parp.gov.pl/kurs");
    expect(resolveTargetUrl("parp.gov.pl/kurs", SITE)).toBe("https://parp.gov.pl/kurs");
  });
  it("nie robi linku z //host, „TBD” ani javascript:", () => {
    expect(resolveTargetUrl("//evil.example/x", SITE)).toBeNull();
    expect(resolveTargetUrl("TBD", SITE)).toBeNull();
    expect(resolveTargetUrl("javascript:alert(1)", SITE)).toBeNull();
  });
  it("niepoprawny target_url jest pokazany jako tekst, bez linku", () => {
    const html = renderToStaticMarkup(<RecommendationCard r={{ ...base, target_url: "TBD" }} siteUrl={SITE} />);
    expect(html).toContain(">TBD<");
    expect(html).not.toContain('href="TBD"');
  });
});

describe("StatusForm", () => {
  const labels = (html: string) => [...html.matchAll(/<button[^>]*>([^<]*)<\/button>/g)].map((m) => m[1]);
  it.each([
    ["todo", ["Zaczynam", "Zrobione", "Odrzuć"]],
    ["doing", ["Zrobione", "Wróć do listy"]],
    ["done", ["Otwórz ponownie"]],
    ["dismissed", ["Przywróć"]],
  ] as const)("status %s ma przyciski %j", (status, expected) => {
    expect(labels(renderToStaticMarkup(<StatusForm id={base.id} status={status} />))).toEqual(expected);
  });
  it("formularz niesie id i docelowy status w ukrytych polach", () => {
    const html = renderToStaticMarkup(<StatusForm id={base.id} status="todo" />);
    expect(html).toContain(`name="id" value="${base.id}"`);
    expect(html).toContain('name="status" value="doing"');
    expect(html).toContain('name="status" value="done"');
    expect(html).toContain('name="status" value="dismissed"');
  });
});
