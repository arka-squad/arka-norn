import { describe, expect, it } from "vitest";

import type { FeatureTrackingView, HumanDocumentView } from "../../../src/application/web/contracts";
import { buildDocumentGroups, documentFilterCounts } from "./document-index-model";

describe("document index model", () => {
  it("groups, filters and orders real document projections", () => {
    const feature = featureWith([
      document("report-1", "development_report", 1, true),
      document("brief-1", "feature_brief", 1, false),
      document("report-2", "development_report", 2, false),
      document("audit-1", "delivery_audit", 1, false),
    ]);
    const groups = buildDocumentGroups([feature], "all", "");
    expect(groups[0]?.entries.map((entry) => entry.document.id)).toEqual(["brief-1", "report-2", "report-1", "audit-1"]);
    expect(buildDocumentGroups([feature], "review", "audit")[0]?.entries).toHaveLength(1);
    expect(documentFilterCounts([feature])).toMatchObject({ all: 4, framing: 1, review: 1, tasks: 2, obsolete: 1 });
  });
});

function document(id: string, type: string, sequence: number, obsolete: boolean): HumanDocumentView {
  return { id, type, title: id, stepId: type, valid: true, obsolete, dependencies: [], presentation: {}, sections: [], metadata: {}, raw: { sequence }, errors: [] };
}

function featureWith(documents: readonly HumanDocumentView[]): FeatureTrackingView {
  return {
    id: "feature", name: "Feature", root: "/feature", projectId: "project", pipelineId: "arka-norn-complete",
    status: "incomplete", health: "attention", progress: { completed: 1, required: 3 }, updatedAt: "2026-08-24T00:00:00Z",
    documentCount: documents.length, invalidDocumentCount: 0, documentContractVersion: 5, documents, anomalies: [],
    steps: [
      { id: "feature_brief", order: 1, required: true, status: "completed", businessStatus: "completed", documentIds: ["brief-1"] },
      { id: "development_report", order: 2, required: true, status: "completed", businessStatus: "completed", documentIds: ["report-1", "report-2"] },
      { id: "delivery_audit", order: 3, required: true, status: "completed", businessStatus: "completed", documentIds: ["audit-1"] },
    ],
  };
}
