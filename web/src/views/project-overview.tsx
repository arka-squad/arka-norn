import { AlertTriangle, ArrowRight, Boxes, CheckCircle2, FileWarning, GitBranch, GitPullRequest, LockKeyhole, Radio } from "lucide-react";

import type { ProjectOverview } from "../../../src/application/web/contracts";
import { featureRoute, framingRoute, projectRoute } from "../app/router";
import { pipelineName } from "../app/product-labels";
import { useBridge } from "../bridge/context";
import { FramingCard } from "../components/framing-card";
import { MetricStrip } from "../components/metric-strip";
import { EmptyState, PageTitle, StatusBadge } from "../components/ui";
import { useI18n } from "../i18n/i18n";
import { OrchestrationModeControl } from "./orchestration-mode-control";

export function ProjectOverviewView({ project, navigate, onChanged = () => undefined }: { readonly project: ProjectOverview; readonly navigate: (path: string) => void; readonly onChanged?: () => void }) {
  const { t, date } = useI18n();
  const bridge = useBridge();
  if (project.lifecycle === "draft") {
    const recovery = project.availability.reason === "project_recovery_required";
    return <div className="page">
      <PageTitle title={project.name} summary={project.root} actions={<StatusBadge health={project.health} />} />
      <section className={recovery ? "draft-project-state recovery" : "draft-project-state"}>
        <LockKeyhole size={22} />
        <div><h2>{t(recovery ? "web.project.recoveryTitle" : "web.project.draftTitle")}</h2><p>{t(recovery ? "web.project.recoveryDetail" : "web.project.draftDetail")}</p></div>
      </section>
      <FramingCard {...(project.framing === undefined ? { onStart: async () => { const framing = await bridge.startFraming(project.id, {}); navigate(framingRoute(project.id, framing.framingId)); } } : { framing: project.framing, onOpen: () => navigate(framingRoute(project.id, project.framing!.framingId)) })} startLabel={t("web.framing.frameProject")} />
    </div>;
  }
  const attention = project.features.filter((feature) => feature.health !== "healthy");
  return <div className="page">
    <PageTitle title={project.name} summary={project.root} actions={<StatusBadge health={project.health} />} />
    <FramingCard {...(project.framing === undefined ? { onStart: async () => { const framing = await bridge.startFraming(project.id, {}); navigate(framingRoute(project.id, framing.framingId)); } } : { framing: project.framing, onOpen: () => navigate(framingRoute(project.id, project.framing!.framingId)) })} startLabel={t("web.framing.frameProject")} />
    <OrchestrationModeControl project={project} onChanged={onChanged} />
    <MetricStrip items={[
      { label: t("web.project.features"), value: project.counts.features },
      { label: t("web.project.completed"), value: project.counts.completedFeatures, tone: "good" },
      { label: t("web.project.blocked"), value: project.counts.blockedFeatures, tone: project.counts.blockedFeatures > 0 ? "bad" : "neutral" },
      { label: t("web.project.invalidDocuments"), value: project.counts.invalidDocuments, tone: project.counts.invalidDocuments > 0 ? "bad" : "neutral" },
      { label: t("web.project.openDecisions"), value: project.counts.openDecisions, tone: project.counts.openDecisions > 0 ? "warn" : "neutral" },
      { label: t("web.project.activeOrchestrations"), value: project.counts.activeOrchestrations },
    ]} />
    <div className="overview-bands">
      <section className="overview-section">
        <div className="section-heading"><div><h2>{t("web.project.nextAttention")}</h2><p>{project.coverage.tracked}/{project.coverage.total} {t("web.project.coverage").toLowerCase()} · {date(project.freshness.observedAt)}</p></div></div>
        {attention.length === 0 ? <div className="positive-state"><CheckCircle2 size={20} /><span>{t("web.project.allHealthy")}</span></div> : <div className="attention-list">{attention.map((feature) => <button key={feature.id} onClick={() => navigate(featureRoute(project.id, feature.id))}>
          <span className={`attention-icon health-${feature.health}`}>{feature.health === "invalid" ? <FileWarning size={18} /> : <AlertTriangle size={18} />}</span>
          <span><strong>{feature.name}</strong><small>{feature.nextStepId ?? feature.status} · {feature.progress.completed}/{feature.progress.required}</small></span>
          <ArrowRight size={17} />
        </button>)}</div>}
      </section>
      <section className="overview-section compact-summary">
        <h2>{t("web.project.signals")}</h2>
        <button onClick={() => navigate(projectRoute(project.id, "decisions"))}><GitPullRequest size={18} /><span><strong>{project.counts.openDecisions + project.counts.openCorrections}</strong><small>{t("web.nav.decisions")}</small></span><ArrowRight size={16} /></button>
        <button onClick={() => navigate(projectRoute(project.id, "live"))}><Radio size={18} /><span><strong>{project.counts.activeOrchestrations}</strong><small>{t("web.nav.live")}</small></span><ArrowRight size={16} /></button>
      </section>
    </div>
    <section className="feature-table-section"><div className="section-heading"><h2>{t("web.nav.features")}</h2><button className="text-link" onClick={() => navigate(projectRoute(project.id, "features"))}>{t("web.action.open")}<ArrowRight size={14} /></button></div><FeatureTable project={project} navigate={navigate} /></section>
  </div>;
}

export function FeatureTable({ project, navigate }: { readonly project: ProjectOverview; readonly navigate: (path: string) => void }) {
  const { t, contractLabel } = useI18n();
  if (project.features.length === 0) return <EmptyState title={t("web.feature.empty")} description={t("web.feature.emptyDetail")} icon={<Boxes size={16} />} />;
  return <div className="feature-index">{project.features.map((feature) => <button key={feature.id} onClick={() => navigate(featureRoute(project.id, feature.id))}>
    <span className="feature-index-icon"><GitBranch size={15} /></span>
    <span className="feature-index-main"><span><strong>{feature.name}</strong>{feature.pipelineDefinitionVersion === "legacy-2.0" ? <em className="compatibility-badge">{t("web.feature.legacy")}</em> : null}<em>{pipelineName(feature.pipelineId)}</em></span><small>{feature.id}</small></span>
    <span className={`feature-index-state health-${feature.health}`}><i />{t(feature.status === "completed" ? "web.status.completed" : "web.status.incomplete")}</span>
    <span className="feature-index-meta"><strong>{feature.nextStepId === undefined ? "—" : contractLabel(feature.nextStepId)}</strong><small>{feature.progress.completed}/{feature.progress.required} {t("web.table.progress").toLowerCase()}</small></span>
    <ArrowRight className="feature-index-go" size={16} />
  </button>)}</div>;
}
