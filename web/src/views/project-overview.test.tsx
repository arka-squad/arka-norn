import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { ProjectOverview } from "../../../src/application/web/contracts";
import { I18nProvider } from "../i18n/i18n";
import { FeatureTable } from "./project-overview";

const project: ProjectOverview = {
  id: "norn",
  name: "Norn",
  root: "/products/norn",
  health: "healthy",
  orchestrationMode: "manual",
  coverage: { tracked: 1, total: 1 },
  freshness: { observedAt: "2026-08-25T00:00:00Z", stale: false },
  counts: { features: 1, completedFeatures: 0, blockedFeatures: 0, invalidDocuments: 0, openDecisions: 0, openCorrections: 0, audits: 0, activeOrchestrations: 0 },
  features: [{ id: "human-ui", name: "Human UI", pipelineId: "arka-norn-essential", status: "in_progress", health: "healthy", progress: { completed: 2, required: 5 }, nextStepId: "current_state_audit", updatedAt: "2026-08-25T00:00:00Z", documentCount: 2, invalidDocumentCount: 0 }],
};

describe("FeatureTable", () => {
  it("uses the same indexed-list grammar as signed documents", () => {
    const html = renderToStaticMarkup(<I18nProvider initialLocale="fr"><FeatureTable project={project} navigate={() => undefined} /></I18nProvider>);
    expect(html).toContain("feature-index");
    expect(html).toContain("feature-index-icon");
    expect(html).toContain("feature-index-main");
    expect(html).toContain("feature-index-state");
    expect(html).toContain("feature-index-meta");
    expect(html).not.toContain("data-table");
    expect(html).not.toContain("data-head");
  });

  it("labels only actual legacy pipeline definitions", () => {
    const legacy: ProjectOverview = {
      ...project,
      features: [
        { ...project.features[0]!, id: "legacy", pipelineDefinitionVersion: "legacy-2.0" },
        { ...project.features[0]!, id: "current", pipelineDefinitionVersion: "2.3" },
      ],
    };
    const html = renderToStaticMarkup(<I18nProvider initialLocale="fr"><FeatureTable project={legacy} navigate={() => undefined} /></I18nProvider>);
    expect(html.match(/compatibility-badge/g)).toHaveLength(1);
    expect(html).toContain("Legacy");
  });
});
