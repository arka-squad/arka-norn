import { describe, expect, it } from "vitest";

import { catalogs } from "./catalogs";
import { contracts } from "./contracts";

describe("generated Web contracts", () => {
  it("keeps EN and FR message keys identical", () => {
    expect(Object.keys(catalogs.fr).sort()).toEqual(Object.keys(catalogs.en).sort());
  });

  it("ships the three canonical workflows with Essential as default", () => {
    expect(contracts.defaultPipelineId).toBe("arka-norn-essential");
    expect(contracts.pipelines.map((pipeline) => pipeline.id)).toEqual([
      "arka-norn-complete",
      "arka-norn-essential",
      "arka-norn-fastdev",
    ]);
  });
});
