import { AlertTriangle, CheckCircle2, Wrench, XCircle } from "lucide-react";

import type { DoctorCheck, DoctorReport, DoctorStatus } from "../../../src/ports/inbound/for-doctor";
import { useI18n } from "../i18n/i18n";

export function DoctorReportView({ report }: { readonly report: DoctorReport }) {
  const { t } = useI18n();
  const needsAttention = report.summary.warn > 0 || report.summary.fail > 0;
  const mode = report.mode === "inspect"
    ? t("web.settings.doctorModeInspect")
    : report.mode === "repair-dry-run"
      ? t("web.settings.doctorModePreview")
      : t("web.settings.doctorModeApplied");
  const title = needsAttention ? t("web.settings.doctorAttention") : t("web.settings.doctorHealthy");
  return <section className={`doctor-report ${needsAttention ? "attention" : "healthy"}`} aria-live="polite">
    <header>
      <span className="doctor-report-icon">{needsAttention ? <AlertTriangle size={20} /> : <CheckCircle2 size={20} />}</span>
      <div><small>{mode}</small><h3>{title}</h3><p>{report.checks.length} {t("web.settings.doctorChecks").toLowerCase()}</p></div>
      <dl className="doctor-summary">
        <SummaryCount label={t("web.settings.doctorPassed")} value={report.summary.pass} tone="pass" />
        <SummaryCount label={t("web.settings.doctorWarnings")} value={report.summary.warn} tone="warn" />
        <SummaryCount label={t("web.settings.doctorFailures")} value={report.summary.fail} tone="fail" />
      </dl>
    </header>
    <div className="doctor-checks">{report.checks.map((check) => <DoctorCheckRow key={check.id} check={check} />)}</div>
    {report.mode === "inspect" ? null : <DoctorRepairList repairs={report.repairs} />}
  </section>;
}

function SummaryCount({ label, value, tone }: { readonly label: string; readonly value: number; readonly tone: DoctorStatus }) {
  return <div className={tone}><dt>{label}</dt><dd>{value}</dd></div>;
}

function DoctorCheckRow({ check }: { readonly check: DoctorCheck }) {
  const { contractLabel, t } = useI18n();
  const Icon = check.status === "pass" ? CheckCircle2 : check.status === "warn" ? AlertTriangle : XCircle;
  const status = check.status === "pass"
    ? t("web.settings.doctorPassed")
    : check.status === "warn"
      ? t("web.settings.doctorWarnings")
      : t("web.settings.doctorFailures");
  return <article className={`doctor-check doctor-check-${check.status}`}>
    <Icon size={17} />
    <div><strong>{doctorCheckLabel(check.id, contractLabel)}</strong><p>{check.message}</p></div>
    <span className="doctor-check-status">{status}</span>
    {check.repairable ? <span className="doctor-repairable"><Wrench size={13} />{t("web.settings.doctorRepairable")}</span> : null}
  </article>;
}

function doctorCheckLabel(id: string, contractLabel: (field: string) => string): string {
  return id.split(".").map((part) => contractLabel(part)).join(" · ");
}

function DoctorRepairList({ repairs }: { readonly repairs: DoctorReport["repairs"] }) {
  const { t } = useI18n();
  if (repairs.length === 0) return <p className="doctor-no-repairs">{t("web.settings.repairNone")}</p>;
  return <section className="doctor-repair-list"><h4>{t("web.settings.repairTargets")}</h4>{repairs.map((repair) => <article key={`${repair.action}:${repair.target}`}>
    <Wrench size={15} /><div><strong>{t(`web.settings.repair.${repair.action}`)}</strong><code>{repair.target}</code></div>
  </article>)}</section>;
}
