import { ArrowRight, FileCheck2, FileText, GitBranch, Search } from "lucide-react";
import { useState } from "react";

import type { FeatureTrackingView, ProjectOverview } from "../../../src/application/web/contracts";
import { documentRoute } from "../app/router";
import { EmptyState, PageTitle, StatusBadge } from "../components/ui";
import { useI18n } from "../i18n/i18n";
import { buildDocumentGroups, documentFilterCounts, type DocumentFilter } from "./document-index-model";

export function DocumentsView({ project, features, navigate }: { readonly project: ProjectOverview; readonly features: readonly FeatureTrackingView[]; readonly navigate: (path: string) => void }) {
  const { t, date } = useI18n();
  const [filter, setFilter] = useState<DocumentFilter>("all");
  const [query, setQuery] = useState("");
  const counts = documentFilterCounts(features);
  const groups = buildDocumentGroups(features, filter, query);
  const filters: readonly DocumentFilter[] = ["all", "framing", "review", "tasks", "obsolete"];
  const total = counts.all;
  return <div className="page documents-page">
    <PageTitle title={t("web.nav.documents")} summary={t("web.document.indexSummary")} actions={<label className="document-search"><Search size={14} /><span className="sr-only">{t("web.document.search")}</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("web.document.search")} /></label>} />
    {total === 0 ? <EmptyState title={t("web.document.empty")} description={t("web.document.emptyDetail")} icon={<FileText size={16} />} /> : <>
      <div className="document-filters" aria-label={t("web.document.filters")}>{filters.map((value) => <button key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{t(`web.document.filter.${value}`)}<span>{counts[value]}</span></button>)}</div>
      {groups.length === 0 ? <EmptyState title={t("web.document.noResults")} description={t("web.document.noResultsDetail")} icon={<Search size={16} />} /> : <div className="document-groups">{groups.map((group) => <section className="document-group" key={group.feature.id}>
        <header><GitBranch size={15} /><strong>{group.feature.name}</strong><StatusBadge health={group.feature.health} label={t(group.feature.status === "completed" ? "web.status.completed" : "web.status.incomplete")} /><i /><span>{group.entries.length} {t(group.entries.length === 1 ? "web.document.countOne" : "web.document.countMany")}</span></header>
        <div className="document-index">{group.entries.map(({ document, revision }) => <button key={document.id} onClick={() => navigate(documentRoute(project.id, group.feature.id, document.id))}>
          <span className="document-index-icon"><FileCheck2 size={15} /></span>
          <span className="document-index-main"><span><strong>{document.title}</strong>{revision === undefined ? null : <em>{t("web.document.revision")} {revision}</em>}</span><small>{document.stepId.replaceAll("_", " ")}</small></span>
          <span className={`document-index-state ${document.obsolete || !document.valid ? "attention" : "valid"}`}><i />{document.obsolete ? t("web.document.replaced") : document.valid ? t("web.document.signedShort") : t("web.status.invalid")}</span>
          <span className="document-index-meta">{document.createdAt === undefined ? "—" : date(document.createdAt)}</span><ArrowRight className="document-index-go" size={16} />
        </button>)}</div>
      </section>)}</div>}
    </>}
  </div>;
}
