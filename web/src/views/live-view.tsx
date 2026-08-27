import { Activity, Clock3, FileDiff, FolderLock, Gauge, Radio, ShieldCheck, WalletCards } from "lucide-react";
import { useState, type ReactNode } from "react";

import type { OrchestrationTrackingView } from "../../../src/application/web/contracts";
import { BridgeError } from "../bridge/http-bridge";
import { useBridge } from "../bridge/context";
import { Modal } from "../components/modal";
import { Button, EmptyState, PageTitle } from "../components/ui";
import { useI18n } from "../i18n/i18n";

export function LiveView({ orchestrations, projectId, onApplied }: { readonly orchestrations: readonly OrchestrationTrackingView[]; readonly projectId: string; readonly onApplied: () => void }) {
  const { t, date, duration } = useI18n();
  if (orchestrations.length === 0) {
    return <div className="page"><PageTitle title={t("web.live.title")} summary={t("web.live.summary")} /><EmptyState title={t("web.live.empty")} description={t("web.live.emptyDetail")} icon={<Radio size={16} />} /></div>;
  }
  return <div className="page">
    <PageTitle title={t("web.live.title")} summary={t("web.live.summary")} />
    <div className="execution-list">{orchestrations.map((execution) => <ExecutionCard key={execution.id} execution={execution} date={date} duration={duration} projectId={projectId} onApplied={onApplied} />)}</div>
  </div>;
}

function ExecutionCard({ execution, date, duration, projectId, onApplied }: {
  readonly execution: OrchestrationTrackingView;
  readonly date: (value: string) => string;
  readonly duration: (value: number) => string;
  readonly projectId: string;
  readonly onApplied: () => void;
}) {
  const { t } = useI18n();
  if (execution.dag !== undefined) return <DagExecutionCard execution={execution} date={date} duration={duration} projectId={projectId} onApplied={onApplied} />;
  return <article>
    <header>
      <span className={execution.heartbeatAlive ? "execution-pulse alive" : "execution-pulse"}><Activity size={18} /></span>
      <div><h2>{execution.stepId.replaceAll("_", " ")}</h2><p>{execution.featureId ?? t("web.common.project")} · {execution.role ?? "—"} · {execution.provider}{execution.model === undefined ? "" : ` / ${execution.model}`}</p></div>
      <span className={`execution-status execution-${execution.status}`}>{execution.projection?.state ?? execution.status}</span>
    </header>
    <dl>
      <Metric icon={<Clock3 size={14} />} label={t("web.live.duration")} value={execution.durationMs === undefined ? "—" : duration(execution.durationMs)} />
      <Metric icon={<Radio size={14} />} label={t("web.live.heartbeat")} value={execution.heartbeatAt === undefined ? "—" : date(execution.heartbeatAt)} />
      <Metric icon={<Activity size={14} />} label={t("web.live.lastEvent")} value={execution.lastEvent?.type ?? "—"} />
      <Metric icon={<ShieldCheck size={14} />} label={t("web.live.proofs")} value={String(execution.proofReferences.length)} />
      <Metric icon={<WalletCards size={14} />} label={t("web.live.consumption")} value={execution.providerUsage.available ? `${execution.providerUsage.consumed} ${execution.providerUsage.unit}` : t("web.live.consumptionUnavailable")} />
      {execution.campaign === undefined ? null : <>
        <Metric icon={<FolderLock size={14} />} label={t("web.live.workspace")} value={execution.campaign.workspaceMode} />
        <Metric icon={<Gauge size={14} />} label={t("web.live.budget")} value={`${execution.campaign.completedMissions}/${execution.campaign.maximumMissions}`} />
        <Metric icon={<Activity size={14} />} label={t("web.live.currentStep")} value={execution.campaign.currentStepId.replaceAll("_", " ")} />
        {execution.campaign.runtimeVersion === undefined ? null : <Metric icon={<ShieldCheck size={14} />} label={t("web.live.runtimeVersion")} value={execution.campaign.runtimeVersion} />}
        {execution.campaign.changedFiles === undefined ? null : <Metric icon={<FileDiff size={14} />} label={t("web.live.changedFiles")} value={`${execution.campaign.changedFiles.total} (${execution.campaign.changedFiles.created} / ${execution.campaign.changedFiles.modified} / ${execution.campaign.changedFiles.deleted} / ${execution.campaign.changedFiles.renamed})`} />}
      </>}
    </dl>
    {execution.stale ? <div className="notice notice-warn" role="status">{t("web.live.stale")}</div> : null}
    {execution.campaign?.actionRequired === undefined ? null : <div className="notice notice-warn" role="status"><strong>{execution.campaign.actionRequired.kind}</strong> · {execution.campaign.actionRequired.reason}</div>}
    {execution.suspension === undefined ? null : <div className="notice notice-warn">{execution.suspension.code} · {execution.suspension.detail}</div>}
    {execution.campaign?.changedFiles === undefined ? null : <details>
      <summary>{t("web.live.changeDetails")}</summary>
      <ul className="compact-list">{execution.campaign.changedFiles.files.map((file) => <li key={`${file.kind}:${file.path}`}><span className={`risk risk-${file.risk}`}>{file.risk}</span> · {file.kind} · {file.previousPath === undefined ? null : <><code>{file.previousPath}</code> → </>}<code>{file.path}</code>{file.binary ? ` · ${t("web.live.binary")}` : ""}</li>)}</ul>
    </details>}
    {execution.proofReferences.length === 0 ? null : <details><summary>{t("web.live.proofDetails")}</summary><ul className="compact-list">{execution.proofReferences.map((proof) => <li key={proof}><code>{proof}</code></li>)}</ul></details>}
    <details>
      <summary>{t("web.live.timeline")}</summary>
      <ol className="compact-list">{execution.timeline.map((event, index) => <li key={`${event.at}:${event.type}:${index}`}>{date(event.at)} · {event.type}</li>)}</ol>
    </details>
  </article>;
}

function DagExecutionCard({ execution, date, duration, projectId, onApplied }: { readonly execution: OrchestrationTrackingView; readonly date: (value: string) => string; readonly duration: (value: number) => string; readonly projectId: string; readonly onApplied: () => void }) {
  const { t } = useI18n();
  const dag = execution.dag!;
  return <article className="dag-card">
    <header>
      <span className="execution-pulse"><FolderLock size={18} /></span>
      <div><h2>{execution.featureId ?? execution.id}</h2><p>{t("web.live.dag")} · {dag.tasks.length} · {execution.campaign?.completedMissions ?? 0}/{execution.campaign?.maximumMissions ?? dag.tasks.length}</p></div>
      <span className={`execution-status execution-${execution.status}`}>{execution.status.replaceAll("_", " ")}</span>
    </header>
    <div className="dag-summary">
      <Metric icon={<Clock3 size={14} />} label={t("web.live.duration")} value={execution.durationMs === undefined ? "—" : duration(execution.durationMs)} />
      <Metric icon={<ShieldCheck size={14} />} label={t("web.live.proofs")} value={String(execution.proofReferences.length)} />
      <Metric icon={<Gauge size={14} />} label={t("web.live.riskScore")} value={dag.risk === undefined ? "—" : `${dag.risk.score} / 20`} />
      <Metric icon={<Activity size={14} />} label={t("web.live.lastEvent")} value={execution.lastEvent?.type ?? "—"} />
    </div>
    <div className={dag.requiresHumanApproval ? "notice notice-warn" : "notice notice-ok"} role="status">{dag.requiresHumanApproval ? t("web.live.applicationGate") : t("web.live.applicationReady")}</div>
    {dag.applicationGate === undefined ? null : <div className="notice notice-warn"><strong>{t("web.live.applicationReason")}</strong> · {dag.applicationGate.code.replaceAll("_", " ")} · {dag.applicationGate.message}</div>}
    {dag.requiresHumanApproval && dag.applicationFingerprint !== undefined && (dag.risk?.hardDenials.length ?? 0) === 0 ? <ApplyControl projectId={projectId} campaignId={execution.id} fingerprint={dag.applicationFingerprint} onApplied={onApplied} /> : null}
    <div className="dag-task-list" aria-label={t("web.live.dag")}>
      {dag.tasks.map((task) => <section className="dag-task-row" key={task.id}>
        <div className="dag-task-state"><span className={`execution-status execution-${task.status}`}>{task.status.replaceAll("_", " ")}</span><strong>{task.id.replaceAll("-", " ")}</strong><small>{task.role} · {task.agentId}</small></div>
        <dl>
          <Metric icon={<WalletCards size={14} />} label={t("web.live.profile")} value={task.profileId ?? "—"} />
          <Metric icon={<Activity size={14} />} label={t("web.live.dependencies")} value={task.dependencies.join(", ") || "—"} />
          <Metric icon={<FolderLock size={14} />} label={t("web.live.readScopes")} value={task.readScopes.join(", ")} />
          <Metric icon={<FileDiff size={14} />} label={t("web.live.writeScopes")} value={task.writeScopes.join(", ")} />
        </dl>
      </section>)}
    </div>
    <details><summary>{t("web.live.planFingerprint")}</summary><code className="fingerprint-value">{dag.planFingerprint}</code></details>
    {dag.discardedHunkCount === 0 ? null : <div className="notice notice-warn">{t("web.live.discardedHunks")} · {dag.discardedHunkCount}</div>}
    <details><summary>{t("web.live.timeline")}</summary><ol className="compact-list">{execution.timeline.map((event, index) => <li key={`${event.at}:${event.type}:${index}`}>{date(event.at)} · {event.type.replaceAll("_", " ")}</li>)}</ol></details>
  </article>;
}

function ApplyControl({ projectId, campaignId, fingerprint, onApplied }: { readonly projectId: string; readonly campaignId: string; readonly fingerprint: string; readonly onApplied: () => void }) {
  const { t } = useI18n();
  const bridge = useBridge();
  const [open, setOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const apply = async () => {
    setBusy(true); setError("");
    try {
      await bridge.applyOrchestration(projectId, { campaignId, confirmationFingerprint: fingerprint });
      setOpen(false); setConfirmed(false); onApplied();
    } catch (reason) {
      setError(reason instanceof BridgeError && reason.displayMessage.length > 0 ? reason.displayMessage : t("web.error.generic"));
    } finally {
      setBusy(false);
    }
  };

  return <><div className="apply-action"><Button variant="primary" onClick={() => setOpen(true)}><ShieldCheck size={15} />{t("web.live.apply")}</Button></div>
    {open ? <Modal title={t("web.live.applyTitle")} description={t("web.live.applySummary")} icon={<ShieldCheck size={16} />} onClose={() => setOpen(false)} footer={<><Button onClick={() => setOpen(false)}>{t("web.live.applyCancel")}</Button><Button variant="primary" disabled={busy || !confirmed} onClick={() => void apply()}>{t("web.live.applySubmit")}</Button></>}>
      <div className="apply-sheet">
        <div className="authorize-fingerprint"><span>{t("web.live.planFingerprint")}</span><code>{fingerprint}</code></div>
        <label className="authorize-confirm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />{t("web.live.applyConfirm")}</label>
        {error.length === 0 ? null : <p className="form-error" role="alert">{error}</p>}
      </div>
    </Modal> : null}
  </>;
}

function Metric({ icon, label, value }: { readonly icon: ReactNode; readonly label: string; readonly value: string }) {
  return <div><dt>{icon}{label}</dt><dd>{value}</dd></div>;
}
