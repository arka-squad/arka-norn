import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { HumanDocumentView } from "../../../src/application/web/contracts";
import { catalogs } from "../generated/catalogs";
import { I18nProvider } from "../i18n/i18n";
import { DocumentRenderer } from "./document-renderer";

const document: HumanDocumentView = {
  id: "brief-1",
  type: "feature_brief",
  title: "Human-readable delivery",
  stepId: "feature_brief",
  valid: true,
  obsolete: false,
  authorAgentId: "agent-product",
  createdAt: "2026-08-24T00:00:00Z",
  dependencies: [{ id: "concept-1", resolved: true, title: "Source concept" }],
  presentation: { version: "2.2.1", status: "valid", contentLocale: "en" },
  sections: [
    { id: "target", title: "Target", kind: "text", value: "Ship a complete document reader." },
    { id: "source_concepts", title: "Source concepts", kind: "list", value: ["concept-1"] },
    { id: "objective", title: "Objective", kind: "text", value: "Make signed evidence understandable." },
    { id: "acceptance_criteria", title: "Acceptance Criteria", kind: "table", value: [{ id: "AC-1", dimension: "ux", criterion: "Readable without JSON", expected_evidence: "Rendered document" }] },
  ],
  metadata: { schema_version: 5, id: "brief-1", author_agent_id: "agent-product", content_locale: "en", depends_on_document_ids: ["concept-1"] },
  raw: {},
  errors: [],
};

describe("DocumentRenderer", () => {
  it("renders a signed document as an editorial hierarchy in French", () => {
    const html = renderToStaticMarkup(<I18nProvider initialLocale="fr"><DocumentRenderer document={document} /></I18nProvider>);
    expect(html).toContain("Human-readable delivery");
    expect(html).toContain(catalogs.fr["web.document.signed"]);
    expect(html).toContain(catalogs.fr["web.contract.acceptance_criteria"].replace("'", "&#x27;"));
    expect(html).toContain("record-card");
    expect(html).toContain("record-code");
    expect(html).toContain("document-identity");
    expect(html).toContain("Version du document");
    expect(html).toContain("Anglais");
    expect(html).toContain("document-metadata-table");
    expect(html).toContain("framework.feature_brief.v5");
    expect(html).toContain("Source concept");
    expect(html).not.toContain("document-section-key");
    expect(html).not.toContain("acceptance_criteria");
  });
});
