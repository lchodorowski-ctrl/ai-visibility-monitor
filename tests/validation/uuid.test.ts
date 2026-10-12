import { describe, it, expect } from "vitest";
import { isUuid } from "@/lib/validation/uuid";

describe("isUuid", () => {
  it("akceptuje poprawny UUID", () => {
    expect(isUuid("11111111-1111-1111-1111-111111111111")).toBe(true);
    expect(isUuid("3F2504E0-4F89-41D3-9A0C-0305E82C3301")).toBe(true);
  });
  it("odrzuca niepoprawne wartości", () => {
    expect(isUuid("")).toBe(false);
    expect(isUuid("abc")).toBe(false);
    expect(isUuid("11111111-1111-1111-1111-11111111111z")).toBe(false);
    expect(isUuid("11111111-1111-1111-1111-111111111111 ")).toBe(false);
  });
});
