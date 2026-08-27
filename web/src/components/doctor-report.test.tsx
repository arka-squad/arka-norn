import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { DoctorReport } from "../../../src/ports/inbound/for-doctor";
import { catalogs } from "../generated/catalogs";
import { I18nProvider } from "../i18n/i18n";
import { DoctorReportView } from "./doctor-report";

const report: DoctorReport = {
  schemaVersion: 1,
  ok: false,
  mode: "repair-dry-run",
  checks: [
    { id: "index.projects", status: "pass", message: "index valid and private", repairable: false },
    { id: "lock.features.lock", status: "fail", message: "abandoned lock", repairable: true },
  ],
  repairs: [{ target: "/tmp/features.lock", action: "remove_abandoned_lock", applied: false }],
  summary: { pass: 1, warn: 0, fail: 1 },
};

describe("DoctorReportView", () => {
  it("turns the Doctor contract into a human-readable health report", () => {
    const html = renderToStaticMarkup(<I18nProvider initialLocale="fr"><DoctorReportView report={report} /></I18nProvider>);
    expect(html).toContain(catalogs.fr["web.settings.doctorAttention"]);
    expect(html).toContain(catalogs.fr["web.settings.doctorModePreview"].replace("'", "&#x27;"));
    expect(html).toContain("Index · Projects");
    expect(html).toContain(catalogs.fr["web.settings.doctorRepairable"]);
    expect(html).toContain(catalogs.fr["web.settings.repair.remove_abandoned_lock"]);
    expect(html).toContain("/tmp/features.lock");
    expect(html).not.toContain("schemaVersion");
    expect(html).not.toContain("repair-dry-run");
    expect(html).not.toContain("remove_abandoned_lock");
  });
});
