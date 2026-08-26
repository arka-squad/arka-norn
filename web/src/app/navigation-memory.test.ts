import { describe, expect, it } from "vitest";

import type { NornBridge, ProjectOverview } from "../../../src/application/web/contracts";
import { isSafeRememberedRoute, resolveRememberedPath } from "./navigation-memory";

describe("navigation memory", () => {
  it("accepts only local Project routes", () => {
    expect(isSafeRememberedRoute("/projects/norn/features/customer-export")).toBe(true);
    expect(isSafeRememberedRoute("/projects/norn/framing/plan-1/plan")).toBe(true);
    expect(isSafeRememberedRoute("https://example.test")).toBe(false);
    expect(isSafeRememberedRoute("/settings")).toBe(false);
  });

  it("resumes a draft framing route without any Feature or provider session", async () => {
    const draft = {
      id: "norn-draft", lifecycle: "draft", features: [],
    } as unknown as ProjectOverview;
    const bridge = {
      getProject: () => Promise.resolve(draft),
      getFraming: () => Promise.resolve({ framingId: "project" }),
    } as unknown as NornBridge;
    await expect(resolveRememberedPath(bridge, "/projects/norn-draft/framing/project/plan")).resolves.toEqual({
      path: "/projects/norn-draft/framing/project/plan", recovered: false,
    });
    await expect(resolveRememberedPath(bridge, "/projects/norn-draft/features")).resolves.toEqual({
      path: "/projects/norn-draft/overview", recovered: true,
    });
  });
});
