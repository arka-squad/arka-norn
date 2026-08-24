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
  dependencies: [],
  presentation: { status: "valid", contentLocale: "en" },
  sections: [
    { id: "objective", title: "Objective", kind: "text", value: "Make signed evidence understandable." },
    { id: "acceptance_criteria", title: "Acceptance Criteria", kind: "table", value: [{ id: "AC-1", dimension: "ux", criterion: "Readable without JSON", expected_evidence: "Rendered document" }] },
  ],
  metadata: {},
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
    expect(html).not.toContain("acceptance_criteria");
  });
});
