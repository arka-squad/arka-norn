import { describe, expect, it } from "vitest";

import { isSafeRememberedRoute } from "./navigation-memory";

describe("navigation memory", () => {
  it("accepts only local Project routes", () => {
    expect(isSafeRememberedRoute("/projects/norn/features/customer-export")).toBe(true);
    expect(isSafeRememberedRoute("/projects/norn/framing/plan-1/plan")).toBe(true);
    expect(isSafeRememberedRoute("https://example.test")).toBe(false);
    expect(isSafeRememberedRoute("/settings")).toBe(false);
  });
});
