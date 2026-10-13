import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// actions.ts pulls in the Trigger.dev SDK and Supabase; the forms only need a function reference.
vi.mock("@/app/app/recommendations/actions", () => ({ setRecommendationStatus: async () => {}, refreshRecommendations: async () => {} }));

import { RecommendationCard } from "@/app/app/recommendations/RecommendationCard";
import { StatusForm } from "@/app/app/recommendations/StatusForm";
import type { RecommendationRow } from "@/lib/recommend/queries";

const base = {
  id: "11111111-1111-4111-8111-111111111111", project_id: "p", prompt_id: "q", run_id: null, type: "content_new",
  title: "Opublikuj stronę o szkoleniach AI dla firm", summary: "Asystenci cytują konkurencję, bo Wasza oferta nie ma osobnej strony.",
  action_steps: [], target_url: "https://example.com/szkolenia-ai", suggested_outline: null, evidence: {},
  impact: 5, effort: 2, priority: 8, status: "todo", fingerprint: "f", created_at: "2026-10-13T10:00:00Z", updated_at: "2026-10-13T10:00:00Z",
  prompts: { text: "Jakie są najlepsze szkolenia z AI dla firm w Polsce?" },
} as RecommendationRow;

describe("RecommendationCard", () => {
  it("pokazuje typ, tytuł, priorytet, wysiłek, pytanie i link zewnętrzny", () => {
    const html = renderToStaticMarkup(<RecommendationCard r={base} />);
    expect(html).toContain("Nowa treść");
    expect(html).toContain("Opublikuj stronę o szkoleniach AI dla firm");
    expect(html).toContain("priorytet wysoki");
    expect(html).toContain("wysiłek mały");
    expect(html).toContain("Pytanie: Jakie są najlepsze szkolenia");
    expect(html).toContain('href="https://example.com/szkolenia-ai"');
    expect(html).toContain('rel="noreferrer"');
    expect(html).toContain(`href="/app/recommendations/${base.id}"`);
    expect(html).not.toContain("bg-ink");
  });
  it("wewnętrzny target_url to zwykły link, a priority null liczy się z impact i effort", () => {
    const html = renderToStaticMarkup(<RecommendationCard r={{ ...base, target_url: "/llms.txt", priority: null, impact: 1, effort: 5, prompts: null }} />);
    expect(html).toContain('href="/llms.txt"');
    expect(html).not.toContain("noreferrer");
    expect(html).toContain("priorytet niski");
    expect(html).toContain("wysiłek duży");
    expect(html).not.toContain("Pytanie:");
  });
  it("wersja odwrócona używa tła ink", () => {
    expect(renderToStaticMarkup(<RecommendationCard r={base} inverse />)).toContain("bg-ink");
  });
  it("odrzucona pokazuje status na czerwono", () => {
    expect(renderToStaticMarkup(<RecommendationCard r={{ ...base, status: "dismissed" }} />)).toContain("text-red");
  });
});

describe("StatusForm", () => {
  const labels = (html: string) => [...html.matchAll(/<button[^>]*>([^<]*)<\/button>/g)].map((m) => m[1]);
  it.each([
    ["todo", ["Zaczynam", "Odrzuć"]],
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
    expect(html).toContain('name="status" value="dismissed"');
  });
});
