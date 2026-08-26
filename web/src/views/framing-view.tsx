import { useState } from "react";
import { ArrowRight, Boxes, Check, CheckCircle2, Compass, Copy, FileCheck2, GitBranch, History, Map as MapIcon, ShieldAlert } from "lucide-react";

import type { FramingDetailView } from "../../../src/application/web/contracts";
import { framingRoute, projectRoute } from "../app/router";
import { BackButton, EmptyState, PageTitle } from "../components/ui";
import { useI18n } from "../i18n/i18n";

type View = "plan" | "evidence" | "map" | "history";

export function FramingView({ projectId, framing, view, navigate }: { readonly projectId: string; readonly framing: FramingDetailView; readonly view: View; readonly navigate: (path: string) => void }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  return <div className="page framing-page">
    <PageTitle title={framing.targetTitle} summary={framing.summary} actions={<><button type="button" className="secondary-button framing-copy" onClick={() => void copyResume()}>{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? t("web.framing.copied") : t("web.framing.copyResume")}</button><BackButton onClick={() => navigate(projectRoute(projectId))} /></>} />
    <span className="sr-only" aria-live="polite">{copied ? t("web.framing.copyConfirmed") : ""}</span>
    <section className="framing-next"><Compass size={19} /><div><small>{framing.published ? t("web.framing.published") : t("web.framing.next")}</small><strong>{framing.nextMove}</strong></div>{framing.recommendedPipelineId === null ? null : <span>{pipelineLabel(framing.recommendedPipelineId)}</span>}</section>
    <nav className="framing-tabs" aria-label={t("web.framing.views")} role="tablist">
      <Tab icon={<FileCheck2 size={15} />} label={t("web.framing.plan")} selected={view === "plan"} onClick={() => open("plan")} />
      <Tab icon={<ShieldAlert size={15} />} label={t("web.framing.evidence")} selected={view === "evidence"} onClick={() => open("evidence")} />
      <Tab icon={<MapIcon size={15} />} label={t("web.framing.map")} selected={view === "map"} onClick={() => open("map")} />
      <Tab icon={<History size={15} />} label={t("web.framing.history")} selected={view === "history"} onClick={() => open("history")} />
    </nav>
    {view === "plan" ? <Plan framing={framing} /> : view === "evidence" ? <Evidence framing={framing} /> : view === "map" ? <FramingMap framing={framing} /> : <FramingHistory framing={framing} />}
  </div>;

  function open(next: View): void {
    navigate(framingRoute(projectId, framing.framingId, next));
  }

  async function copyResume(): Promise<void> {
    await navigator.clipboard.writeText(framing.resumeContext);
    setCopied(true);
  }
}

function Tab(props: { readonly icon: React.ReactNode; readonly label: string; readonly selected: boolean; readonly onClick: () => void }) {
  return <button type="button" role="tab" aria-selected={props.selected} className={props.selected ? "active" : ""} onClick={props.onClick}>{props.icon}{props.label}</button>;
}

function Plan({ framing }: { readonly framing: FramingDetailView }) {
  const { t } = useI18n();
  if (framing.sections.length === 0) return <EmptyState title={t("web.framing.planEmpty")} description={t("web.framing.planEmptyDetail")} icon={<Compass size={16} />} />;
  return <div className="framing-sections">{framing.sections.map((section) => <section key={section.id}><h2>{section.title}</h2><div>{section.items.map((item) => <article key={`${item.id}-${item.text}`} className={item.active ? "" : "superseded"}><p>{item.text}</p><small>{item.source}</small></article>)}</div></section>)}</div>;
}

function Evidence({ framing }: { readonly framing: FramingDetailView }) {
  const { t } = useI18n();
  const inventory = framing.evidence.inventory;
  return <div className="framing-evidence">
    <dl><div><dt>{t("web.framing.files")}</dt><dd>{inventory.files}</dd></div><div><dt>{t("web.framing.sources")}</dt><dd>{inventory.sourceFiles}</dd></div><div><dt>{t("web.framing.tests")}</dt><dd>{inventory.testFiles}</dd></div><div><dt>{t("web.framing.constraints")}</dt><dd>{inventory.manifestFiles + inventory.constraintFiles}</dd></div></dl>
    <section><h2>{t("web.framing.establishedFacts")}</h2>{framing.evidence.claims.length === 0 ? <p className="framing-muted">{t("web.framing.noEvidenceYet")}</p> : framing.evidence.claims.map((claim) => <article key={claim.id}><CheckCircle2 size={16} /><div><p>{claim.text}</p><code>{claim.reference}</code></div></article>)}</section>
    {framing.evidence.limitations.length === 0 ? null : <section><h2>{t("web.framing.limitations")}</h2>{framing.evidence.limitations.map((limitation) => <article key={limitation}><ShieldAlert size={16} /><p>{limitation}</p></article>)}</section>}
  </div>;
}

function FramingMap({ framing }: { readonly framing: FramingDetailView }) {
  const { t } = useI18n();
  if (framing.decomposition === null) return <EmptyState title={t("web.framing.mapEmpty")} description={t("web.framing.mapEmptyDetail")} icon={<Boxes size={16} />} />;
  const byId = new Map(framing.decomposition.entries.map((entry) => [entry.id, entry.title]));
  return <section className="framing-map"><header><h2>{framing.decomposition.kind === "features" ? t("web.framing.featureCandidates") : t("web.framing.lots")}</h2><span>{framing.decomposition.entries.length}</span></header><div>{framing.decomposition.entries.map((entry) => <article key={entry.id}><span>{framing.decomposition?.kind === "features" ? <GitBranch size={17} /> : <Boxes size={17} />}</span><div><small>{entry.id}</small><h3>{entry.title}</h3><p>{entry.outcome}</p>{entry.dependsOn.length === 0 ? null : <footer>{t("web.framing.after")} {entry.dependsOn.map((id) => byId.get(id) ?? id).join(", ")}</footer>}</div><ArrowRight size={16} /></article>)}</div></section>;
}

function FramingHistory({ framing }: { readonly framing: FramingDetailView }) {
  const { date, t } = useI18n();
  return <div className="framing-history"><h2>{t("web.framing.historyTitle")}</h2>{[...framing.history].reverse().map((item) => <article key={item.revision}><span>{item.revision}</span><div><strong>{item.milestone}</strong><small>{date(item.updatedAt)}</small><code>{item.fingerprint.slice(0, 12)}</code></div></article>)}{framing.stabilizations.map((item) => <article className="stabilization" key={item.fingerprint}><CheckCircle2 size={17} /><div><strong>{item.label}</strong><small>{item.actorId} · {date(item.confirmedAt)}</small></div></article>)}</div>;
}

function pipelineLabel(id: string): string {
  return id.includes("complete") ? "Complete 2.3" : "Essential 2.3";
}
