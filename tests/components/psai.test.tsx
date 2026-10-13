import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Button } from "@/components/ui/button";
import { StatTile, Rows, Row, Dots, EmptyState, PageHero, ToneDot } from "@/components/psai";

describe("komponenty PSAI", () => {
  it("StatTile pokazuje liczbę, jednostkę i pasek postępu", () => {
    const html = renderToStaticMarkup(<StatTile label="Visibility" value="22" unit="%" progress={0.22} />);
    expect(html).toContain("rounded-[28px]");
    expect(html).toContain("bg-s1");
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="22"');
    expect(html).toContain(">22<");
  });
  it("StatTile z tonem koloruje liczbę, bez tonu nie dodaje koloru", () => {
    expect(renderToStaticMarkup(<StatTile label="V" value="80" tone="good" />)).toContain("text-teal");
    expect(renderToStaticMarkup(<StatTile label="V" value="10" tone="bad" />)).toContain("text-red");
    expect(renderToStaticMarkup(<StatTile label="V" value="50" tone="weak" />)).toContain("text-t0");
    const plain = renderToStaticMarkup(<StatTile label="V" value="50" />);
    expect(plain).not.toContain("text-teal"); expect(plain).not.toContain("text-red");
  });
  it("ToneDot ma kolor tokenu i etykietę stanu", () => {
    const h = (t: "good" | "weak" | "bad") => renderToStaticMarkup(<ToneDot tone={t} />);
    expect(h("good")).toContain("bg-teal"); expect(h("good")).toContain('aria-label="dobrze"');
    expect(h("weak")).toContain("bg-s3"); expect(h("weak")).toContain('aria-label="słabo"');
    expect(h("bad")).toContain("bg-red"); expect(h("bad")).toContain('aria-label="bardzo źle"');
    expect(h("bad")).toContain("h-2 w-2 shrink-0 rounded-full");
  });
  it("Rows renderuje listę z hairline", () => {
    const html = renderToStaticMarkup(<Rows><Row>a</Row><Row href="/x">b</Row></Rows>);
    expect(html).toContain("<ul");
    expect(html).toContain('href="/x"');
    expect(html).toContain("border-line");
  });
  it("Dots ma etykietę dostępności", () => {
    expect(renderToStaticMarkup(<Dots value={3} label="wpływ" />)).toContain('aria-label="wpływ 3 z 5"');
    expect(renderToStaticMarkup(<Dots value={3} label="wpływ" />)).toContain('role="img"');
  });
  it("EmptyState z tonem error ma kolor red", () => {
    expect(renderToStaticMarkup(<EmptyState title="Błąd" description="x" tone="error" />)).toContain("text-red");
  });
  it("PageHero ma eyebrow w mono i h1", () => {
    const html = renderToStaticMarkup(<PageHero eyebrow="PSAI · TEST" title="Tytuł" />);
    expect(html).toContain("font-mono");
    expect(html).toContain("<h1");
  });
  it("Button quiet/danger-quiet nie ma wypełnienia ani stałej wysokości", () => {
    for (const variant of ["quiet", "danger-quiet"] as const) {
      const html = renderToStaticMarkup(<Button variant={variant}>x</Button>);
      const cls = html.match(/class="([^"]*)"/)?.[1] ?? "";
      const tokens = cls.split(" ");
      expect(tokens).toContain("h-auto");
      expect(tokens).toContain("px-0");
      expect(tokens).not.toContain("h-8");
      expect(tokens).not.toContain("px-2.5");
    }
  });
});
