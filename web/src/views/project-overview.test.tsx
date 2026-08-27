import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { NornBridge, ProjectOverview } from "../../../src/application/web/contracts";
import { BridgeContext } from "../bridge/context";
import { I18nProvider } from "../i18n/i18n";
import { FeatureTable, ProjectOverviewView } from "./project-overview";

const project: ProjectOverview = {
  id: "norn",
  name: "Norn",
  root: "/products/norn",
  updatedAt: "2026-08-25T00:00:00Z",
  health: "healthy",
  orchestrationMode: "manual",
  orchestration: { activeRuns: [], preflight: { readyForPreview: false, configurationPresent: false, configuredProfiles: 0, enabledProfiles: 0, missing: ["configuration_missing"] } },
  lifecycle: "materialized",
  availability: { markerReady: true, reason: null },
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

  it("keeps a ProjectDraft focused on its resumable framing and hides marker mutations", () => {
    const draft: ProjectOverview = {
      ...project,
      lifecycle: "draft",
      materialization: "draft",
      health: "attention",
      availability: { markerReady: false, reason: "framing_publication_required" },
      coverage: { tracked: 0, total: 0 },
      counts: { features: 0, completedFeatures: 0, blockedFeatures: 0, invalidDocuments: 0, openDecisions: 0, openCorrections: 0, audits: 0, activeOrchestrations: 0 },
      features: [],
      framing: {
        planId: "plan-project", framingId: "project", targetKind: "project", targetTitle: "Norn", revision: 2,
        repositoryNature: "implemented", attention: "agent", published: false, summary: "Plan vivant",
        nextMove: "Confronter le plan", recommendedPipelineId: null, updatedAt: "2026-08-26T00:00:00Z",
      },
    };
    const bridge = { startFraming: () => Promise.reject(new Error("not used")) } as unknown as NornBridge;
    const html = renderToStaticMarkup(<BridgeContext.Provider value={bridge}><I18nProvider initialLocale="fr"><ProjectOverviewView project={draft} navigate={() => undefined} /></I18nProvider></BridgeContext.Provider>);
    expect(html).toContain("Ce Project est encore en cadrage");
    expect(html).toContain("Plan vivant");
    expect(html).not.toContain("feature-index");
    expect(html).not.toContain("compact-summary");
  });

  it("shows the current launch mode and its prerequisites without starting a run", () => {
    const bridge = { startFraming: () => Promise.reject(new Error("not used")) } as unknown as NornBridge;
    const html = renderToStaticMarkup(<BridgeContext.Provider value={bridge}><I18nProvider initialLocale="en"><ProjectOverviewView project={project} navigate={() => undefined} /></I18nProvider></BridgeContext.Provider>);
    expect(html).toContain("How assistants are launched");
    expect(html).toContain("Manual launch");
    expect(html).toContain("0 enabled profile(s) out of 0");
    expect(html).toContain("Change mode");
  });

  it("surfaces Doctor from a Project that needs attention", () => {
    const bridge = { startFraming: () => Promise.reject(new Error("not used")) } as unknown as NornBridge;
    const attention = { ...project, health: "attention" as const, features: [{ ...project.features[0]!, health: "attention" as const }] };
    const html = renderToStaticMarkup(<BridgeContext.Provider value={bridge}><I18nProvider initialLocale="en"><ProjectOverviewView project={attention} navigate={() => undefined} /></I18nProvider></BridgeContext.Provider>);
    expect(html).toContain("Inspect Doctor");
  });
});
