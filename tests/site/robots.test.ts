import { describe, it, expect } from "vitest";
import { isAllowedByRobots } from "@/lib/site/robots";
describe("isAllowedByRobots", () => {
  const txt = `User-agent: Googlebot\nDisallow: /g\n\nUser-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /tmp/\n`;
  it("blokuje prefiksy z grupy *", () => {
    expect(isAllowedByRobots(txt, "/admin/x")).toBe(false);
    expect(isAllowedByRobots(txt, "/tmp/a")).toBe(false);
  });
  it("przepuszcza resztę i ignoruje grupy innych botów", () => {
    expect(isAllowedByRobots(txt, "/g")).toBe(true);
    expect(isAllowedByRobots(txt, "/szkolenia.html")).toBe(true);
  });
  it("pusty robots → wszystko dozwolone", () => { expect(isAllowedByRobots("", "/x")).toBe(true); });
});
