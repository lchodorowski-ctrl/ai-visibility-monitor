import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/app/app/calibration/actions", () => ({
  addAliasFromCalibration: async () => {},
  saveCheck: async () => {},
  closeCalibration: async () => {},
  createCalibration: async () => {},
}));

import { ResultsSection } from "@/app/app/calibration/ResultsSection";
import type { CalibrationCheckView, CalibrationView } from "@/lib/calibration/queries";

const ALIAS = "Polska Szkoła Sztucznej Inteligencji";

function check(over: Partial<CalibrationCheckView> & Pick<CalibrationCheckView, "id" | "promptText" | "result">): CalibrationCheckView {
  return {
    promptId: `p-${over.id}`, engineId: "openai", manualMentioned: null, manualUrls: [], manualAlias: null,
    api: "absent", apiResponseId: null, apiDomains: [], ...over,
  };
}

const view: CalibrationView = {
  id: "cal-1", status: "open", created_at: "2026-10-13T08:00:00Z", closed_at: null,
  run: { id: "run-1", started_at: "2026-10-12T08:00:00Z" },
  checks: [
    check({ id: "c1", promptText: "Pytanie zgodne", result: "match", manualMentioned: true, api: "mentioned" }),
    check({ id: "c2", promptText: "Pytanie tylko API", result: "api_only", manualMentioned: false, api: "mentioned", apiResponseId: "resp-api-1" }),
    check({ id: "c3", promptText: "Pytanie tylko czat", result: "manual_only", manualMentioned: true, manualAlias: ALIAS, api: "absent", apiResponseId: "resp-api-3", engineId: "perplexity" }),
    check({ id: "c4", promptText: "Pytanie pominięte", result: "skipped", engineId: "google_ai_overview" }),
  ],
};

const render = (v: CalibrationView = view, brandAliases: string[] = []) =>
  renderToStaticMarkup(<ResultsSection view={v} brandAliases={brandAliases} />);

describe("ResultsSection", () => {
  it("pokazuje kafel ChatGPT z 1 z 2 i czerwonym tonem (50% < 60%)", () => {
    const html = render();
    expect(html).toContain("ChatGPT");
    expect(html).toContain("1 z 2");
    expect(html).toContain("text-red");
    expect(html).toContain("50%");
  });

  it("pokazuje rozbieżność API: wzmianka, czat: brak z linkiem do odpowiedzi API", () => {
    const html = render();
    expect(html).toContain("API: wzmianka, czat: brak");
    expect(html).toContain("Pytanie tylko API");
    expect(html).toContain('href="/app/responses/resp-api-1"');
  });

  it("pokazuje przycisk dodania aliasu dla czat: wzmianka, API: brak", () => {
    const html = render();
    expect(html).toContain("czat: wzmianka, API: brak");
    expect(html).toContain("Pytanie tylko czat");
    expect(html).toContain(`Dodaj „${ALIAS}” do aliasów`);
  });

  it("zamiast przycisku pokazuje „już w aliasach”, gdy alias istnieje w innej pisowni", () => {
    const html = render(view, ["polska szkola sztucznej inteligencji"]);
    expect(html).toContain("już w aliasach");
    expect(html).not.toContain("do aliasów");
  });

  it("nie pokazuje wierszy skipped w rozbieżnościach", () => {
    expect(render()).not.toContain("Pytanie pominięte");
  });

  it("pokazuje stan pusty bez rozbieżności i nic nie sprawdzono dla silnika bez danych", () => {
    const html = render({ ...view, checks: [view.checks[0]] });
    expect(html).toContain("Brak rozbieżności");
    expect(html).toContain("nic nie sprawdzono");
  });

  it("podsumowuje pokrycie cytowań albo informuje o braku adresów", () => {
    expect(render()).toContain("Nie wpisano cytowanych adresów");
    const withUrls: CalibrationView = { ...view, checks: [check({ id: "c9", promptText: "Q", result: "match", manualMentioned: true, api: "mentioned", manualUrls: ["https://www.a.pl/x", "https://b.pl"], apiDomains: ["a.pl"] })] };
    expect(render(withUrls)).toContain("Aplikacja widziała 1 z 2 domen wskazanych ręcznie");
  });
});
