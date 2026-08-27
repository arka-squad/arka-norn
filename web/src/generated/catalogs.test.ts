import { describe, expect, it } from "vitest";

import packageManifest from "../../../package.json";
import { catalogs } from "./catalogs";
import { contracts } from "./contracts";

describe("generated Web contracts", () => {
  it("keeps EN and FR message keys identical", () => {
    expect(Object.keys(catalogs.fr).sort()).toEqual(Object.keys(catalogs.en).sort());
  });

  it("keeps historical workflows and exposes the 2.3 delivery routes", () => {
    expect(contracts.appVersion).toBe(packageManifest.version);
    expect(contracts.compatibilityFallbackPipelineId).toBe("arka-norn-essential");
    expect(contracts.pipelines.map((pipeline) => pipeline.id)).toEqual([
      "arka-norn-complete-2.3",
      "arka-norn-essential-2.3",
      "arka-norn-complete",
      "arka-norn-essential",
      "arka-norn-fastdev",
    ]);
  });

  it("publishes the capability registry without advertising unfinished Web mutations", () => {
    expect(contracts.capabilitySchemaVersion).toBe(1);
    expect(contracts.capabilities).toHaveLength(15);
    expect(contracts.capabilities.find((capability) => capability.id === "framing.start")?.surfaces).toContain("web");
    expect(contracts.capabilities.find((capability) => capability.id === "doctor.inspect")?.surfaces).toContain("web");
    expect(contracts.capabilities.find((capability) => capability.id === "project.set_orchestration_mode")?.surfaces).toContain("web");
    expect(contracts.capabilities.find((capability) => capability.id === "agent.replace")?.surfaces).toContain("web");
    expect(contracts.capabilities.find((capability) => capability.id === "doctor.repair_preview")?.surfaces).toContain("web");
    expect(contracts.capabilities.find((capability) => capability.id === "doctor.repair_apply")?.surfaces).toContain("web");
    expect(contracts.capabilities.find((capability) => capability.id === "orchestration.authorize")?.surfaces).not.toContain("web");
  });
});
