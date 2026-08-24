import { AlertTriangle, Check, Clock3, FileSearch, FolderSearch, ShieldCheck, TerminalSquare } from "lucide-react";

import type { AuditRunView } from "../../../src/application/web/contracts";
import type { MessageKey } from "../i18n/i18n";
import { useI18n } from "../i18n/i18n";
import { auditStatusMessageKey, humanSelectedModules } from "./audit-form-model";

export function AuditRunPanel({ run, error }: { readonly run: AuditRunView; readonly error?: string }) {
  const { t } = useI18n();
  const modules = humanSelectedModules(run.selectedModules);
  const statusKey = auditStatusMessageKey(run.status);
  const scope = run.plan.scopePaths.length === 1 && run.plan.scopePaths[0] === "."
    ? t("web.audits.wholeProject")
    : run.plan.scopePaths.join(", ");

  return <div className="audit-plan">
    <div className="audit-plan-lead">
      <span className={`audit-status audit-${run.status}`}>{statusKey === undefined ? run.status.replaceAll("_", " ") : t(statusKey)}</span>
      <h3>{run.status === "planned" ? t("web.audits.planReady") : t("web.audits.runSummary")}</h3>
      <p>{run.status === "planned" ? t("web.audits.planReadyDetail") : t("web.audits.runSummaryDetail")}</p>
    </div>

    <dl className="audit-plan-overview">
      <div><dt><FolderSearch size={14} />{t("web.audits.scope")}</dt><dd>{scope}</dd></div>
      <div><dt><FileSearch size={14} />{t("web.audits.domains")}</dt><dd>{modules.length}</dd></div>
      <div><dt><Clock3 size={14} />{t("web.audits.estimatedDuration")}</dt><dd>{run.plan.estimatedDuration}</dd></div>
    </dl>

    <section className="audit-plan-section">
      <h4>{t("web.audits.reviewedDomains")}</h4>
      <p>{t("web.audits.reviewedDomainsDetail")}</p>
      <div className="audit-plan-domains">{modules.map((module) => <span key={module.id}><Check size={13} />{t(auditModuleKey(module.key, "title"))}</span>)}</div>
      <div className="audit-automatic-foundation"><ShieldCheck size={15} /><span><strong>{t("web.audits.automaticFoundation")}</strong>{t("web.audits.automaticFoundationDetail")}</span></div>
    </section>

    {run.plan.requiresAdditionalConfirmation ? <div className="notice notice-warn"><AlertTriangle size={16} />{t("web.audits.additionalConfirmation")}</div> : null}
    {error === undefined ? null : <p className="form-error"><AlertTriangle size={15} /><span>{t("web.audits.actionError")}<small>{error}</small></span></p>}

    <details className="audit-technical-plan">
      <summary>{t("web.audits.technicalPlan")}</summary>
      <dl>
        <div><dt><TerminalSquare size={13} />{t("web.audits.operations")}</dt><dd>{run.plan.logicalCommands.join(", ") || t("web.common.none")}</dd></div>
        <div><dt>{t("web.audits.auditIdentifier")}</dt><dd><code>{run.id}</code></dd></div>
        <div><dt>{t("web.audits.fingerprint")}</dt><dd><code>{run.fingerprint}</code></dd></div>
      </dl>
    </details>
  </div>;
}

function auditModuleKey(key: string, field: "title" | "description"): MessageKey {
  return `web.audits.module.${key}.${field}` as MessageKey;
}
