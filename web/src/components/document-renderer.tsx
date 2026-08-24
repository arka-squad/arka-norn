import { useState } from "react";
import {
  AlertTriangle, ChevronDown, ChevronRight, FileCheck2, FileJson, Link2, ShieldCheck,
} from "lucide-react";

import type { HumanDocumentView } from "../../../src/application/web/contracts";
import { useI18n } from "../i18n/i18n";
import { DocumentContent } from "./document-content";
import { Button, StatusBadge } from "./ui";

export function DocumentRenderer({ document }: { readonly document: HumanDocumentView }) {
  const [raw, setRaw] = useState(false);
  const [metadata, setMetadata] = useState(false);
  const { t, date, contractLabel } = useI18n();
  const presentation = document.presentation;
  return <article className="document-view">
    <header className="document-header">
      <div className="document-heading">
        <span className="document-mark" aria-hidden="true"><FileCheck2 size={19} /></span>
        <div className="document-heading-copy">
          <div className="document-kicker"><span>{contractLabel(document.type)}</span><i />{t("web.document.signed")}</div>
          <h1>{document.title}</h1>
          <p className="document-byline">{t("web.document.producedBy")} <strong>{document.authorAgentId ?? t("web.common.unknownAuthor")}</strong>{document.createdAt === undefined ? "" : ` · ${date(document.createdAt)}`}</p>
        </div>
      </div>
      <Button variant="ghost" onClick={() => setRaw((value) => !value)}><FileJson size={15} />{t(raw ? "web.action.viewHuman" : "web.action.viewJson")}</Button>
    </header>
    <div className="document-facts" aria-label={t("web.document.metadata")}>
      <StatusBadge health={document.valid ? "healthy" : "invalid"} label={document.valid ? t("web.document.contractValid") : t("web.status.invalid")} />
      <Fact label={t("web.feature.pipelineTitle")} value={contractLabel(document.stepId)} />
      {presentation.version === undefined ? null : <Fact label={t("web.document.version")} value={presentation.version} />}
      {presentation.status === undefined ? null : <Fact label={t("web.table.status")} value={contractLabel(presentation.status)} />}
      {presentation.contentLocale === undefined ? null : <Fact label={t("web.document.contentLanguage")} value={presentation.contentLocale.toUpperCase()} />}
    </div>
    {!document.valid && <div className="notice notice-error"><AlertTriangle size={18} /><span>{t("web.document.invalid")}</span></div>}
    {document.obsolete && <div className="notice notice-warn"><AlertTriangle size={18} /><span>{t("web.document.obsolete")}</span></div>}
    {raw ? <pre className="json-view"><code>{JSON.stringify(document.raw, null, 2)}</code></pre> : <DocumentContent sections={document.sections} />}
    {document.dependencies.length > 0 && <section className="document-links">
      <div className="document-section-title"><span><Link2 size={15} /></span><div><p>{t("web.document.references")}</p><h2>{t("web.document.dependencies")}</h2></div></div>
      <ul>{document.dependencies.map((dependency) => <li key={dependency.id} className={dependency.resolved ? "" : "broken"}><ShieldCheck size={14} />{dependency.title ?? dependency.id}{dependency.resolved ? null : ` · ${t("web.document.brokenLink")}`}</li>)}</ul>
    </section>}
    <section className="metadata-section"><button onClick={() => setMetadata((value) => !value)}>{metadata ? <ChevronDown size={15} /> : <ChevronRight size={15} />}{t("web.document.metadata")}</button>{metadata ? <pre>{JSON.stringify(document.metadata, null, 2)}</pre> : null}</section>
  </article>;
}

function Fact({ label, value }: { readonly label: string; readonly value: string }) {
  return <span className="document-fact"><small>{label}</small><strong>{value.replaceAll("_", " ")}</strong></span>;
}
