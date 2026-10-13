import { describe, it, expect, vi } from "vitest";

const ctor = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({ default: class { constructor(opts: unknown) { ctor(opts); } } }));

import { createAnthropic } from "@/lib/anthropic";

describe("createAnthropic", () => {
  it("bez ANTHROPIC_WORKSPACE_ID nie ustawia defaultHeaders", () => {
    const prev = process.env.ANTHROPIC_WORKSPACE_ID;
    delete process.env.ANTHROPIC_WORKSPACE_ID;
    try {
      ctor.mockClear();
      createAnthropic();
      expect(ctor).toHaveBeenCalledTimes(1);
      expect(ctor.mock.calls[0][0].defaultHeaders).toBeUndefined();
    } finally {
      if (prev === undefined) delete process.env.ANTHROPIC_WORKSPACE_ID; else process.env.ANTHROPIC_WORKSPACE_ID = prev;
    }
  });
  it("z ANTHROPIC_WORKSPACE_ID wysyła nagłówek anthropic-workspace-id", () => {
    const prev = process.env.ANTHROPIC_WORKSPACE_ID;
    process.env.ANTHROPIC_WORKSPACE_ID = "wrkspc_test";
    try {
      ctor.mockClear();
      createAnthropic();
      expect(ctor.mock.calls[0][0].defaultHeaders).toEqual({ "anthropic-workspace-id": "wrkspc_test" });
    } finally {
      if (prev === undefined) delete process.env.ANTHROPIC_WORKSPACE_ID; else process.env.ANTHROPIC_WORKSPACE_ID = prev;
    }
  });
});
