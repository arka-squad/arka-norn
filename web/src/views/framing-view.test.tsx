import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { FramingDetailView } from "../../../src/application/web/contracts";
import { I18nProvider } from "../i18n/i18n";
import { FramingView } from "./framing-view";

const framing: FramingDetailView = {
  planId: "plan-test",
  resumeContext: "Reprise de cadrage Norn\nPlan: plan-test",
  framingId: "feature-new-test",
  targetKind: "feature",
  targetTitle: "Reprise fiable",
  revision: 4,
  repositoryNature: "implemented",
  attention: "human_stabilization",
  published: false,
  summary: "Une personne reprend exactement là où le cadrage s'est arrêté.", // language-gate: allow-fr
  nextMove: "Relire et stabiliser la révision exacte du plan fondé.", // language-gate: allow-fr
  recommendedPipelineId: "arka-norn-essential-2.3",
  updatedAt: "2026-08-26T10:00:00.000Z",
  sections: [{ id: "intent.problem", title: "Problème", items: [{ id: "problem", text: "La session est perdue.", source: "Décision humaine", active: true }] }], // language-gate: allow-fr
  evidence: {
    snapshot: "a".repeat(64), gitCommit: "b".repeat(40),
    inventory: { files: 12, sourceFiles: 4, testFiles: 2, manifestFiles: 1, constraintFiles: 1 },
    claims: [{ id: "claim", text: "Le store écrit des révisions atomiques.", reference: "src/store.ts:42" }], // language-gate: allow-fr
    limitations: [],
  },
  decomposition: { kind: "lots", entries: [{ id: "lot-store", title: "Journal", outcome: "La reprise retrouve le front exact.", dependsOn: [] }] },
  history: [{ revision: 4, updatedAt: "2026-08-26T10:00:00.000Z", fingerprint: "c".repeat(64), milestone: "Plan enrichi" }],
  stabilizations: [{ label: "Intention stabilisée", confirmedAt: "2026-08-26T09:00:00.000Z", actorId: "human-owner", fingerprint: "d".repeat(64) }], // language-gate: allow-fr
};

describe("FramingView", () => {
  it("renders the live plan as human sections without raw JSON or enum labels", () => {
    const html = renderToStaticMarkup(<I18nProvider initialLocale="fr"><FramingView projectId="norn" framing={framing} view="plan" navigate={() => undefined} /></I18nProvider>);
    expect(html).toContain("Reprise fiable");
    expect(html).toContain("La session est perdue.");
    expect(html).toContain("Décision humaine"); // language-gate: allow-fr
    expect(html).toContain("Plan");
    expect(html).toContain("Preuves");
    expect(html).not.toContain("intent.problem");
    expect(html).not.toContain("human_stabilization");
    expect(html).not.toContain("json-panel");
    expect(html).not.toContain("{&quot;");
  });

  it("renders evidence with file:line anchors and a readable inventory", () => {
    const html = renderToStaticMarkup(<I18nProvider initialLocale="fr"><FramingView projectId="norn" framing={framing} view="evidence" navigate={() => undefined} /></I18nProvider>);
    expect(html).toContain("src/store.ts:42");
    expect(html).toContain("Fichiers observés"); // language-gate: allow-fr
    expect(html).toContain(">12<");
    expect(html).not.toContain(framing.evidence.snapshot);
  });
});
