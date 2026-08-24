import { describe, expect, it } from "vitest";

import { AUDIT_PURPOSE_DEFAULTS, auditModeMessageKey, auditStatusMessageKey, humanSelectedModules, moduleIntents, USER_AUDIT_MODULES } from "./audit-form-model";

describe("audit form model", () => {
  it("keeps the technical provenance module out of the human domain picker", () => {
    expect(USER_AUDIT_MODULES).toHaveLength(11);
    expect(USER_AUDIT_MODULES.some((module) => module.id === "M00")).toBe(false);
  });

  it("provides complete, valid defaults for every guided purpose", () => {
    for (const defaults of Object.values(AUDIT_PURPOSE_DEFAULTS)) {
      expect(defaults.modules.length).toBeGreaterThan(0);
      expect(new Set(defaults.modules).size).toBe(defaults.modules.length);
      expect(defaults.modules.every((moduleId) => USER_AUDIT_MODULES.some((module) => module.id === moduleId))).toBe(true);
    }
  });

  it("assigns homogeneous intents to discovery and audit modes", () => {
    expect([...moduleIntents("discovery", ["M01", "M02"]).values()]).toEqual(["discover", "discover"]);
    expect([...moduleIntents("audit", ["M01", "M02"]).values()]).toEqual(["audit", "audit"]);
  });

  it("makes mixed mode valid without asking the user to classify each domain", () => {
    const intents = [...moduleIntents("mixed", ["M01", "M03", "M05"]).values()];
    expect(intents).toContain("discover");
    expect(intents).toContain("audit");
  });

  it("rejects an impossible one-domain mixed selection", () => {
    expect(() => moduleIntents("mixed", ["M01"])).toThrow(/at least two/);
  });

  it("removes the automatically added provenance module from the review", () => {
    expect(humanSelectedModules(["M00", "M01", "M05"]).map((module) => module.id)).toEqual(["M01", "M05"]);
  });

  it("keeps human labels centralized for audit lists and details", () => {
    expect(auditModeMessageKey("discovery")).toBe("web.audits.mode.discovery");
    expect(auditStatusMessageKey("completed")).toBe("web.audits.status.completed");
    expect(auditStatusMessageKey("future-status")).toBeUndefined();
  });
});
