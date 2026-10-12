import { describe, it, expect } from "vitest";
import { getAdapter, isEngineId } from "@/lib/engines/registry";

describe("isEngineId", () => {
  it("akceptuje znane identyfikatory silników", () => {
    expect(isEngineId("openai")).toBe(true);
  });
  it("odrzuca właściwości z prototypu zamiast traktować je jak silniki", () => {
    expect(isEngineId("constructor")).toBe(false);
    expect(isEngineId("toString")).toBe(false);
    expect(isEngineId("__proto__")).toBe(false);
  });
});

describe("getAdapter", () => {
  it("zwraca adapter dla znanego id", () => {
    expect(getAdapter("openai").id).toBe("openai");
  });
  it("rzuca błąd dla nieznanego id", () => {
    expect(() => getAdapter("nope" as never)).toThrow(/Nieznany silnik/);
  });
  it("rzuca błąd dla właściwości z prototypu", () => {
    expect(() => getAdapter("constructor" as never)).toThrow(/Nieznany silnik/);
  });
});
