import { describe, it, expect, vi, afterEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import GoogleError from "@/app/app/google/error";

describe("GoogleError", () => {
  afterEach(() => vi.restoreAllMocks());

  const render = (message: string) => renderToStaticMarkup(<GoogleError error={new Error(message)} retry={() => {}} />);

  it("po polsku: tytuł, wskazówka i przycisk „Spróbuj ponownie”", () => {
    const html = render("Nie udało się pobrać sumy z Search Console: boom");
    expect(html).toContain("Nie udało się wczytać danych z Search Console");
    expect(html).toContain("Spróbuj ponownie za chwilę");
    expect(html).toMatch(/<button[^>]*type="button"[^>]*>Spróbuj ponownie<\/button>/);
  });

  it("nie pokazuje surowego komunikatu błędu (produkcja i tak go ukrywa)", () => {
    expect(render("duplicate key value violates unique constraint")).not.toContain("duplicate key");
  });

  it("żadnej półpauzy ani pauzy w treści", () => {
    expect(render("x")).not.toMatch(/[–—]/);
  });
});
