import { AlertTriangle, ArrowRight, CheckCircle2, FileWarning, GitPullRequest, Radio } from "lucide-react";

import type { ProjectOverview } from "../../../src/application/web/contracts";
import { featureRoute, projectRoute } from "../app/router";
import { MetricStrip } from "../components/metric-strip";
import { PageTitle, StatusBadge } from "../components/ui";
import { useI18n } from "../i18n/i18n";

export function ProjectOverviewView({ project, navigate }: { readonly project: ProjectOverview; readonly navigate: (path: string) => void }) {
  const { t, date } = useI18n();
  const attention = project.features.filter((feature) => feature.health !== "healthy");
  return <div className="page">
    <PageTitle title={project.name} summary={project.root} actions={<StatusBadge health={project.health} />} />
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
  const { t } = useI18n();
  return <div className="data-table"><div className="data-row data-head"><span>{t("web.table.feature")}</span><span>{t("web.table.workflow")}</span><span>{t("web.table.status")}</span><span>{t("web.table.progress")}</span><span>{t("web.table.next")}</span></div>{project.features.map((feature) => <button className="data-row" key={feature.id} onClick={() => navigate(featureRoute(project.id, feature.id))}><span><strong>{feature.name}</strong><small>{feature.id}</small></span><span>{feature.pipelineId.replace("arka-norn-", "")}</span><span><StatusBadge health={feature.health} /></span><span>{feature.progress.completed}/{feature.progress.required}</span><span>{feature.nextStepId?.replaceAll("_", " ") ?? "—"}</span></button>)}</div>;
}
