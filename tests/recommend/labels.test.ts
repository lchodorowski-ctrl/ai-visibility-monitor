import { describe, it, expect } from "vitest";
import { effortLabel, priorityLabel, TYPE_LABEL, STATUS_LABEL } from "@/lib/recommend/labels";
describe("labels", () => {
  it("effort", () => { expect(effortLabel(1)).toBe("mały"); expect(effortLabel(3)).toBe("średni"); expect(effortLabel(5)).toBe("duży"); });
  it("priority", () => { expect(priorityLabel(9)).toBe("wysoki"); expect(priorityLabel(6)).toBe("wysoki"); expect(priorityLabel(5)).toBe("średni"); expect(priorityLabel(2)).toBe("niski"); expect(priorityLabel(-3)).toBe("niski"); });
  it("ma etykiety dla wszystkich typów i statusów", () => { expect(Object.keys(TYPE_LABEL)).toHaveLength(5); expect(Object.keys(STATUS_LABEL)).toHaveLength(4); });
});
