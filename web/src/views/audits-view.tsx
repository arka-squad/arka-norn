import { useEffect, useState, type FormEvent } from "react";
import { GitBranch, Plus } from "lucide-react";

import type { AuditRunView, AuditTrackingView, FeatureSummary } from "../../../src/application/web/contracts";
import { useBridge } from "../bridge/context";
import { Modal } from "../components/modal";
import { Button, EmptyState, PageTitle } from "../components/ui";
import { useI18n } from "../i18n/i18n";

const MODULES = ["M01", "M02", "M03", "M04", "M05", "M06", "M07", "M08", "M09", "M10", "M11"] as const;

export function AuditsView({ projectId, features, audits, onChanged }: { readonly projectId: string; readonly features: readonly FeatureSummary[]; readonly audits: readonly AuditTrackingView[]; readonly onChanged: () => void }) {
  const { t, date } = useI18n();
  const [selectedAuditId, setSelectedAuditId] = useState<string>();
  const close = () => setSelectedAuditId(undefined);
  const changed = () => { close(); onChanged(); };
  return <div className="page">
    <PageTitle title={t("web.audits.title")} summary={t("web.audits.summary")} actions={<Button variant="primary" onClick={() => setSelectedAuditId("new")}><Plus size={16} />{t("web.action.newAudit")}</Button>} />
    {audits.length === 0 ? <EmptyState title={t("web.audits.empty")} description={t("web.audits.emptyDetail")} icon={<GitBranch size={16} />} /> : <div className="audit-list">{audits.map((audit) => <button className="audit-row" key={audit.id} onClick={() => setSelectedAuditId(audit.id)}><GitBranch size={18} /><span><strong>{audit.id}</strong><small>{audit.mode} · {audit.featureId ?? t("web.common.project")}</small></span><span className={`audit-status audit-${audit.status}`}>{audit.status.replaceAll("_", " ")}</span><time>{date(audit.updatedAt)}</time></button>)}</div>}
    {selectedAuditId === undefined ? null : <AuditDialog projectId={projectId} features={features} {...(selectedAuditId === "new" ? {} : { auditId: selectedAuditId })} onClose={close} onChanged={changed} />}
  </div>;
}

function AuditDialog({ projectId, features, auditId, onClose, onChanged }: { readonly projectId: string; readonly features: readonly FeatureSummary[]; readonly auditId?: string; readonly onClose: () => void; readonly onChanged: () => void }) {
  const bridge = useBridge();
  const { t } = useI18n();
  const [objective, setObjective] = useState("");
  const [featureId, setFeatureId] = useState("");
  const [mode, setMode] = useState<"discovery" | "audit" | "mixed">("audit");
  const [depth, setDepth] = useState<"inventory" | "static">("static");
  const [modules, setModules] = useState<readonly string[]>(["M01", "M02", "M05", "M07"]);
  const [run, setRun] = useState<AuditRunView>();
  const [busy, setBusy] = useState(auditId !== undefined);

  useEffect(() => {
    if (auditId === undefined) return;
    let active = true;
    void bridge.getAudit(projectId, auditId).then((value) => { if (active) setRun(value); }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [auditId, bridge, projectId]);

  const prepare = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const selectedFeature = features.find((feature) => feature.id === featureId);
      setRun(await bridge.prepareAudit(projectId, {
        ...(featureId === "" ? {} : { featureId }), objective, mode,
        paths: selectedFeature === undefined ? ["."] : [selectedFeature.id],
        modules: modules.map((moduleId) => ({ moduleId, intent: mode === "discovery" ? "discover" : "audit", depth, criteria: [] })),
      }));
    } finally { setBusy(false); }
  };
  const mutate = async (action: "advance" | "cancel" | "resume") => {
    if (run === undefined) return;
    setBusy(true);
    try {
      const next = action === "cancel" ? await bridge.cancelAudit(projectId, run.id)
        : action === "resume" ? await bridge.resumeAudit(projectId, run.id)
          : run.status === "planned" ? await bridge.startAudit(projectId, run.id, run.fingerprint)
            : await bridge.finalizeAudit(projectId, run.id);
      setRun(next);
      if (["completed", "partial", "failed", "cancelled"].includes(next.status)) onChanged();
    } finally { setBusy(false); }
  };
  const terminal = run !== undefined && ["completed", "partial", "failed", "cancelled"].includes(run.status);
  const footer = run === undefined
    ? <><Button onClick={onClose}>{t("web.action.cancel")}</Button><Button form="prepare-audit" type="submit" variant="primary" disabled={busy || modules.length === 0}>{t("web.action.prepareAudit")}</Button></>
    : <><Button onClick={onClose}>{t("web.action.close")}</Button>{!terminal && run.status !== "interrupted" ? <Button variant="danger" disabled={busy} onClick={() => void mutate("cancel")}>{t("web.action.cancelAudit")}</Button> : null}{run.status === "interrupted" ? <Button variant="primary" disabled={busy} onClick={() => void mutate("resume")}>{t("web.action.resumeAudit")}</Button> : null}{run.status === "planned" || run.status === "analyzing" ? <Button variant="primary" disabled={busy} onClick={() => void mutate("advance")}>{t(run.status === "planned" ? "web.action.startAudit" : "web.action.finalizeAudit")}</Button> : null}</>;
  return <Modal title={t("web.audits.dialogTitle")} description={t("web.audits.summary")} icon={<GitBranch size={16} />} onClose={onClose} footer={footer}>
    {run === undefined ? <form id="prepare-audit" className="form-grid" onSubmit={(event) => void prepare(event)}><label className="full">{t("web.audits.objective")}<textarea required rows={4} maxLength={2000} value={objective} onChange={(event) => setObjective(event.target.value)} /></label><label>{t("web.audits.scope")}<select value={featureId} onChange={(event) => setFeatureId(event.target.value)}><option value="">{t("web.audits.wholeProject")}</option>{features.map((feature) => <option key={feature.id} value={feature.id}>{feature.name}</option>)}</select></label><label>{t("web.audits.mode")}<select value={mode} onChange={(event) => setMode(event.target.value as typeof mode)}><option value="audit">{t("web.audits.audit")}</option><option value="discovery">{t("web.audits.discovery")}</option><option value="mixed">{t("web.audits.mixed")}</option></select></label><label>{t("web.audits.depth")}<select value={depth} onChange={(event) => setDepth(event.target.value as typeof depth)}><option value="inventory">{t("web.audits.inventory")}</option><option value="static">{t("web.audits.static")}</option></select></label><fieldset className="module-fieldset"><legend>{t("web.audits.domains")}</legend>{MODULES.map((module) => <label key={module}><input type="checkbox" checked={modules.includes(module)} onChange={(event) => setModules(event.target.checked ? [...modules, module] : modules.filter((value) => value !== module))} />{module}</label>)}</fieldset></form> : <div className="audit-plan"><span className={`audit-status audit-${run.status}`}>{run.status.replaceAll("_", " ")}</span><h3>{run.id}</h3><dl><div><dt>{t("web.audits.scope")}</dt><dd>{run.plan.scopePaths.join(", ")}</dd></div><div><dt>{t("web.audits.domains")}</dt><dd>{run.selectedModules.join(", ")}</dd></div><div><dt>{t("web.audits.estimatedDuration")}</dt><dd>{run.plan.estimatedDuration}</dd></div><div><dt>{t("web.audits.operations")}</dt><dd>{run.plan.logicalCommands.join(", ")}</dd></div></dl><p className="fingerprint">{t("web.audits.fingerprint")}: <code>{run.fingerprint}</code></p></div>}
  </Modal>;
}
