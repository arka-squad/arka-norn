import { Activity, Clock3, FileDiff, FolderLock, Gauge, Radio, ShieldCheck, WalletCards } from "lucide-react";
import type { ReactNode } from "react";

import type { OrchestrationTrackingView } from "../../../src/application/web/contracts";
import { EmptyState, PageTitle } from "../components/ui";
import { useI18n } from "../i18n/i18n";

export function LiveView({ orchestrations }: { readonly orchestrations: readonly OrchestrationTrackingView[] }) {
  const { t, date, duration } = useI18n();
  if (orchestrations.length === 0) {
    return <div className="page"><PageTitle title={t("web.live.title")} summary={t("web.live.summary")} /><EmptyState title={t("web.live.empty")} description={t("web.live.emptyDetail")} icon={<Radio size={16} />} /></div>;
  }
  return <div className="page">
    <PageTitle title={t("web.live.title")} summary={t("web.live.summary")} />
    <div className="execution-list">{orchestrations.map((execution) => <ExecutionCard key={execution.id} execution={execution} date={date} duration={duration} />)}</div>
  </div>;
}

function ExecutionCard({ execution, date, duration }: {
  readonly execution: OrchestrationTrackingView;
  readonly date: (value: string) => string;
  readonly duration: (value: number) => string;
}) {
  const { t } = useI18n();
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

function Metric({ icon, label, value }: { readonly icon: ReactNode; readonly label: string; readonly value: string }) {
  return <div><dt>{icon}{label}</dt><dd>{value}</dd></div>;
}
