import { describe, it, expect } from "vitest";
import { isValidCursor, nextPageHref } from "@/lib/responses/paging";

describe("responses paging", () => {
  it("zachowuje filtry i koduje kursor", () => {
    const href = nextPageHref({ engine: "openai", prompt: "abc" }, "2026-10-12T10:00:00.123456+00:00");
    const u = new URL(href, "http://x");
    expect(u.pathname).toBe("/app/responses");
    expect(u.searchParams.get("engine")).toBe("openai");
    expect(u.searchParams.get("prompt")).toBe("abc");
    expect(u.searchParams.get("before")).toBe("2026-10-12T10:00:00.123456+00:00");
  });
  it("pomija puste filtry", () => {
    expect(nextPageHref({}, "2026-10-12T10:00:00Z")).toBe("/app/responses?before=2026-10-12T10%3A00%3A00Z");
  });
  it("walidacja kursora", () => {
    expect(isValidCursor("2026-10-12T10:00:00Z")).toBe(true);
    expect(isValidCursor("śmieci")).toBe(false);
    expect(isValidCursor(undefined)).toBe(false);
  });
});
