import { describe, it, expect } from "vitest";
import { GOOD_VISIBILITY, TONE_LABEL, toneDotClass, toneTextClass, visibilityTone } from "@/lib/metrics/tone";

describe("visibilityTone (próg dolny 0,34)", () => {
  it("granice: 0,33 bardzo źle, 0,34 słabo, 0,66 słabo, 0,67 dobrze", () => {
    expect(visibilityTone(0.33, 0.34)).toBe("bad");
    expect(visibilityTone(0.34, 0.34)).toBe("weak");
    expect(visibilityTone(0.66, 0.34)).toBe("weak");
    expect(visibilityTone(0.67, 0.34)).toBe("good");
  });
  it("skraje: 0 bardzo źle, 1 dobrze", () => {
    expect(visibilityTone(0, 0.34)).toBe("bad");
    expect(visibilityTone(1, 0.34)).toBe("good");
  });
  it("liczy z zaokrąglonego procentu, jak etykieta heatmapy", () => {
    expect(visibilityTone(0.6667, 0.34)).toBe("good");
    expect(visibilityTone(0.335, 0.34)).toBe("weak");
    expect(visibilityTone(0.3349, 0.34)).toBe("bad");
    expect(visibilityTone(0.6649, 0.34)).toBe("weak");
  });
  it("próg dolny pochodzi z ustawień projektu", () => {
    expect(visibilityTone(0.2, 0.2)).toBe("weak");
    expect(visibilityTone(0.19, 0.2)).toBe("bad");
    expect(visibilityTone(0, 0)).toBe("weak");
    expect(visibilityTone(0.5, 0.5)).toBe("weak");
    expect(visibilityTone(0.49, 0.5)).toBe("bad");
  });
  it("stała dobrego poziomu to 0,67", () => { expect(GOOD_VISIBILITY).toBe(0.67); });
});

describe("etykiety i klasy tonu", () => {
  it("etykiety po polsku", () => {
    expect(TONE_LABEL).toEqual({ good: "dobrze", weak: "słabo", bad: "bardzo źle" });
  });
  it("klasy tekstu i kropki używają tokenów motywu", () => {
    expect(toneTextClass("good")).toBe("text-teal");
    expect(toneTextClass("weak")).toBe("text-t0");
    expect(toneTextClass("bad")).toBe("text-red");
    expect(toneDotClass("good")).toBe("bg-teal");
    expect(toneDotClass("weak")).toBe("bg-ink/40");
    expect(toneDotClass("bad")).toBe("bg-red");
  });
});
