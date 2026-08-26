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
});
