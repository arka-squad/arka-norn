import { AlertTriangle, ArrowRight, FileText } from "lucide-react";

import type { FeatureTrackingView } from "../../../src/application/web/contracts";
import { documentRoute, projectRoute } from "../app/router";
import { MetricStrip } from "../components/metric-strip";
import { PipelineRail } from "../components/pipeline-rail";
import { BackButton, EmptyState, PageTitle, StatusBadge } from "../components/ui";
import { useI18n } from "../i18n/i18n";

export function FeatureView({ feature, navigate }: { readonly feature: FeatureTrackingView; readonly navigate: (path: string) => void }) {
  const { t, date } = useI18n();
  return <div className="page feature-page">
    <PageTitle title={feature.name} summary={feature.root} actions={<><BackButton onClick={() => navigate(projectRoute(feature.projectId, "features"))} /><StatusBadge health={feature.health} /></>} />
    <MetricStrip items={[
      { label: t("web.feature.pipeline"), value: feature.pipelineId.replace("arka-norn-", "") },
      { label: t("web.feature.progress"), value: `${feature.progress.completed}/${feature.progress.required}` },
      { label: t("web.feature.nextStep"), value: feature.nextStepId?.replaceAll("_", " ") ?? "—" },
      { label: t("web.feature.documents"), value: feature.documentCount },
      { label: t("web.feature.anomalies"), value: feature.anomalies.length, tone: feature.anomalies.length > 0 ? "bad" : "good" },
      { label: t("web.feature.updated"), value: date(feature.updatedAt) },
    ]} />
    <section className="pipeline-section"><h2>{t("web.feature.pipelineTitle")}</h2><PipelineRail steps={feature.steps} /></section>
    <div className="feature-columns">
      <section><div className="section-heading"><h2>{t("web.feature.documents")}</h2></div>{feature.documents.length === 0 ? <EmptyState title={t("web.document.empty")} description={t("web.document.emptyDetail")} icon={<FileText size={16} />} /> : <div className="document-list">{feature.documents.map((document) => <button key={document.id} onClick={() => navigate(documentRoute(feature.projectId, feature.id, document.id))}><FileText size={18} /><span><strong>{document.title}</strong><small>{document.stepId.replaceAll("_", " ")}{document.createdAt === undefined ? "" : ` · ${date(document.createdAt)}`}</small></span>{!document.valid ? <AlertTriangle className="danger" size={17} /> : null}<ArrowRight size={16} /></button>)}</div>}</section>
      <section><div className="section-heading"><h2>{t("web.feature.anomalies")}</h2></div>{feature.anomalies.length === 0 ? <div className="positive-state">{t("web.feature.noAnomalies")}</div> : <ul className="anomaly-list">{feature.anomalies.map((anomaly, index) => <li key={`${anomaly.code}-${index}`}><AlertTriangle size={17} /><span><strong>{anomaly.code.replaceAll("_", " ")}</strong>{anomaly.message}</span></li>)}</ul>}</section>
    </div>
  </div>;
}
