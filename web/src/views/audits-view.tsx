import { useEffect, useState, type FormEvent } from "react";
import { CheckCircle2, FileSearch, GitBranch, Play, Plus, RotateCcw, XCircle } from "lucide-react";

import type { AuditRunView, AuditTrackingView, FeatureSummary } from "../../../src/application/web/contracts";
import type { AuditDepth, AuditMode, AuditModuleId } from "../../../src/domain/audit/audit-types";
import { useBridge } from "../bridge/context";
import { Modal } from "../components/modal";
import { Button, EmptyState, LoadingState, PageTitle } from "../components/ui";
import { useI18n } from "../i18n/i18n";
import { AUDIT_PURPOSE_DEFAULTS, auditModeMessageKey, auditStatusMessageKey, moduleIntents, type AuditPurpose } from "./audit-form-model";
import { AuditRunPanel } from "./audit-run-panel";
import { AuditSetupForm } from "./audit-setup-form";

export function AuditsView({ projectId, features, audits, onChanged }: { readonly projectId: string; readonly features: readonly FeatureSummary[]; readonly audits: readonly AuditTrackingView[]; readonly onChanged: () => void }) {
  const { t, date } = useI18n();
  const [selectedAuditId, setSelectedAuditId] = useState<string>();
  const close = () => setSelectedAuditId(undefined);
  const changed = () => { close(); onChanged(); };

  return <div className="page">
    <PageTitle title={t("web.audits.title")} summary={t("web.audits.summary")} actions={<Button variant="primary" onClick={() => setSelectedAuditId("new")}><Plus size={16} />{t("web.action.newAudit")}</Button>} />
    {audits.length === 0
      ? <EmptyState title={t("web.audits.empty")} description={t("web.audits.emptyDetail")} icon={<GitBranch size={16} />} />
      : <div className="audit-list">{audits.map((audit) => {
        const modeKey = auditModeMessageKey(audit.mode);
        const statusKey = auditStatusMessageKey(audit.status);
        return <button className="audit-row" key={audit.id} onClick={() => setSelectedAuditId(audit.id)}><GitBranch size={18} /><span><strong>{modeKey === undefined ? audit.mode : t(modeKey)}</strong><small>{audit.featureId ?? t("web.common.project")} · {audit.id}</small></span><span className={`audit-status audit-${audit.status}`}>{statusKey === undefined ? audit.status.replaceAll("_", " ") : t(statusKey)}</span><time>{date(audit.updatedAt)}</time></button>;
      })}</div>}
    {selectedAuditId === undefined ? null : <AuditDialog projectId={projectId} features={features} {...(selectedAuditId === "new" ? {} : { auditId: selectedAuditId })} onClose={close} onChanged={changed} />}
  </div>;
}

function AuditDialog({ projectId, features, auditId, onClose, onChanged }: { readonly projectId: string; readonly features: readonly FeatureSummary[]; readonly auditId?: string; readonly onClose: () => void; readonly onChanged: () => void }) {
  const bridge = useBridge();
  const { t } = useI18n();
  const defaults = AUDIT_PURPOSE_DEFAULTS.health;
  const [purpose, setPurpose] = useState<AuditPurpose | null>("health");
  const [objective, setObjective] = useState(() => t("web.audits.purpose.health.objective"));
  const [featureId, setFeatureId] = useState("");
  const [mode, setMode] = useState<AuditMode>(defaults.mode);
  const [depth, setDepth] = useState<Extract<AuditDepth, "inventory" | "static">>(defaults.depth);
  const [modules, setModules] = useState<readonly AuditModuleId[]>(defaults.modules);
  const [run, setRun] = useState<AuditRunView>();
  const [busy, setBusy] = useState(auditId !== undefined);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (auditId === undefined) return;
    let active = true;
    void bridge.getAudit(projectId, auditId)
      .then((value) => { if (active) setRun(value); })
      .catch((reason: unknown) => { if (active) setError(errorMessage(reason)); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [auditId, bridge, projectId]);

  const changePurpose = (nextPurpose: AuditPurpose) => {
    const next = AUDIT_PURPOSE_DEFAULTS[nextPurpose];
    setPurpose(nextPurpose);
    setObjective(t(`web.audits.purpose.${nextPurpose}.objective`));
    setMode(next.mode);
    setDepth(next.depth);
    setModules(next.modules);
    setError(undefined);
  };
  const changeMode = (nextMode: AuditMode) => { setPurpose(null); setMode(nextMode); };
  const changeDepth = (nextDepth: Extract<AuditDepth, "inventory" | "static">) => { setPurpose(null); setDepth(nextDepth); };
  const changeModules = (nextModules: readonly AuditModuleId[]) => { setPurpose(null); setModules(nextModules); };
  const canPrepare = !busy && objective.trim().length > 0 && modules.length > 0 && (mode !== "mixed" || modules.length > 1);

  const prepare = async (event: FormEvent) => {
    event.preventDefault();
    if (!canPrepare) return;
    setBusy(true);
    setError(undefined);
    try {
      const selectedFeature = features.find((feature) => feature.id === featureId);
      const intents = moduleIntents(mode, modules);
      setRun(await bridge.prepareAudit(projectId, {
        ...(featureId === "" ? {} : { featureId }),
        objective: objective.trim(),
        mode,
        paths: selectedFeature === undefined ? ["."] : [selectedFeature.id],
        modules: modules.map((moduleId) => ({ moduleId, intent: intents.get(moduleId) ?? "audit", depth, criteria: [] })),
      }));
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  };

  const mutate = async (action: "advance" | "cancel" | "resume") => {
    if (run === undefined) return;
    setBusy(true);
    setError(undefined);
    try {
      const next = action === "cancel" ? await bridge.cancelAudit(projectId, run.id)
        : action === "resume" ? await bridge.resumeAudit(projectId, run.id)
          : run.status === "planned" ? await bridge.startAudit(projectId, run.id, run.fingerprint)
            : await bridge.finalizeAudit(projectId, run.id);
      setRun(next);
      if (["completed", "partial", "failed", "cancelled"].includes(next.status)) onChanged();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  };

  const loadingExisting = auditId !== undefined && run === undefined && busy;
  const terminal = run !== undefined && ["completed", "partial", "failed", "cancelled"].includes(run.status);
  const footer = loadingExisting
    ? <Button onClick={onClose}>{t("web.action.close")}</Button>
    : run === undefined
      ? <><span className="modal-footer-copy">{t("web.audits.reviewBeforeStart")}</span><Button onClick={onClose}>{t("web.action.cancel")}</Button><Button form="prepare-audit" type="submit" variant="primary" disabled={!canPrepare}><FileSearch size={15} />{t("web.audits.reviewPlan")}</Button></>
      : <><Button onClick={onClose}>{t("web.action.close")}</Button>{!terminal && run.status !== "interrupted" ? <Button variant="danger" disabled={busy} onClick={() => void mutate("cancel")}><XCircle size={15} />{t("web.action.cancelAudit")}</Button> : null}{run.status === "interrupted" ? <Button variant="primary" disabled={busy} onClick={() => void mutate("resume")}><RotateCcw size={15} />{t("web.action.resumeAudit")}</Button> : null}{run.status === "planned" || run.status === "analyzing" ? <Button variant="primary" disabled={busy} onClick={() => void mutate("advance")}>{run.status === "planned" ? <Play size={15} /> : <CheckCircle2 size={15} />}{t(run.status === "planned" ? "web.action.startAudit" : "web.action.finalizeAudit")}</Button> : null}</>;

  return <Modal size="wide" title={t(run === undefined ? "web.audits.prepareTitle" : "web.audits.detailsTitle")} description={t(run === undefined ? "web.audits.prepareDetail" : "web.audits.detailsDetail")} icon={<GitBranch size={16} />} onClose={onClose} footer={footer}>
    {loadingExisting ? <LoadingState /> : run === undefined
      ? <AuditSetupForm features={features} purpose={purpose} objective={objective} featureId={featureId} mode={mode} depth={depth} modules={modules} busy={busy} {...(error === undefined ? {} : { error })} onPurposeChange={changePurpose} onObjectiveChange={setObjective} onFeatureChange={setFeatureId} onModeChange={changeMode} onDepthChange={changeDepth} onModulesChange={changeModules} onSubmit={(event) => void prepare(event)} />
      : <AuditRunPanel run={run} {...(error === undefined ? {} : { error })} />}
  </Modal>;
}

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}
