import { ArrowRight, FileText } from "lucide-react";

import type { FeatureTrackingView, ProjectOverview } from "../../../src/application/web/contracts";
import { documentRoute } from "../app/router";
import { EmptyState, PageTitle } from "../components/ui";
import { useI18n } from "../i18n/i18n";

export function DocumentsView({ project, features, navigate }: { readonly project: ProjectOverview; readonly features: readonly FeatureTrackingView[]; readonly navigate: (path: string) => void }) {
  const { t, date } = useI18n();
  const documents = features.flatMap((feature) => feature.documents.map((document) => ({ feature, document })));
  return <div className="page"><PageTitle title={t("web.nav.documents")} summary={`${documents.length} framework productions across ${project.features.length} Features`} />{documents.length === 0 ? <EmptyState>{t("web.document.empty")}</EmptyState> : <div className="document-index">{documents.map(({ feature, document }) => <button key={`${feature.id}:${document.id}`} onClick={() => navigate(documentRoute(project.id, feature.id, document.id))}><FileText size={19} /><span className="document-index-main"><strong>{document.title}</strong><small>{feature.name} · {document.stepId.replaceAll("_", " ")}</small></span><span className="document-index-meta">{document.createdAt === undefined ? "—" : date(document.createdAt)}{document.valid ? "" : " · invalid"}</span><ArrowRight size={16} /></button>)}</div>}</div>;
}
