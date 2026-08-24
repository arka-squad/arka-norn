import { useState } from "react";
import {
  AlertTriangle, ArrowUpRight, Braces, ChevronDown, ChevronRight, FileCheck2, Link2, ShieldCheck, Text,
} from "lucide-react";

import type { HumanDocumentView } from "../../../src/application/web/contracts";
import { useI18n } from "../i18n/i18n";
import { DocumentContent, DocumentIdentity, splitDocumentSections } from "./document-content";
import { JsonPanel } from "./json-panel";
import { StatusBadge } from "./ui";

export function DocumentRenderer({ document, onOpenDependency }: { readonly document: HumanDocumentView; readonly onOpenDependency?: (id: string) => void }) {
  const [raw, setRaw] = useState(false);
  const [metadata, setMetadata] = useState(true);
  const { t, date, contractLabel } = useI18n();
  const presentation = document.presentation;
  const sections = splitDocumentSections(document.sections);
  const identity = [
    ...sections.identity,
    ...(presentation.version === undefined ? [] : [{ id: "document_version", title: "Document version", kind: "text" as const, value: presentation.version }]),
    ...(presentation.contentLocale === undefined ? [] : [{ id: "content_locale", title: "Content language", kind: "text" as const, value: t(presentation.contentLocale.toLowerCase().startsWith("fr") ? "web.language.french" : "web.language.english") }]),
  ];
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
      <div className="document-view-switch" role="group" aria-label={t("web.document.viewMode")}>
        <button className={raw ? "" : "active"} onClick={() => setRaw(false)}><Text size={13} />{t("web.action.viewHuman")}</button>
        <button className={raw ? "active" : ""} onClick={() => setRaw(true)}><Braces size={13} />JSON</button>
      </div>
    </header>
    <div className="document-facts" aria-label={t("web.document.metadata")}>
      <StatusBadge health={document.valid ? "healthy" : "invalid"} label={document.valid ? t("web.document.contractValid") : t("web.status.invalid")} />
      <Fact label={t("web.feature.pipelineTitle")} value={contractLabel(document.stepId)} />
      {presentation.status === undefined ? null : <Fact label={t("web.table.status")} value={contractLabel(presentation.status)} />}
    </div>
    {!document.valid && <div className="notice notice-error"><AlertTriangle size={18} /><span>{t("web.document.invalid")}</span></div>}
    {document.obsolete && <div className="notice notice-warn"><AlertTriangle size={18} /><span>{t("web.document.obsolete")}</span></div>}
    {raw ? <JsonPanel value={document.raw} /> : <>{identity.length === 0 ? null : <DocumentIdentity sections={identity} />}<DocumentContent sections={sections.content} /></>}
    {document.dependencies.length > 0 && <section className="document-links">
      <div className="document-section-title"><span><Link2 size={15} /></span><div><p>{t("web.document.references")}</p><h2>{t("web.document.dependencies")}</h2></div></div>
      <ul>{document.dependencies.map((dependency) => <li key={dependency.id} className={dependency.resolved ? "" : "broken"}>{dependency.resolved && onOpenDependency !== undefined ? <button onClick={() => onOpenDependency(dependency.id)}><ShieldCheck size={14} /><span>{dependency.title ?? dependency.id}</span><ArrowUpRight size={13} /></button> : <span><ShieldCheck size={14} />{dependency.title ?? dependency.id}{dependency.resolved ? null : ` · ${t("web.document.brokenLink")}`}</span>}</li>)}</ul>
    </section>}
    <section className="metadata-section"><button aria-expanded={metadata} onClick={() => setMetadata((value) => !value)}>{metadata ? <ChevronDown size={15} /> : <ChevronRight size={15} />}{t("web.document.metadata")}</button>{metadata ? <MetadataTable document={document} /> : null}</section>
  </article>;
}

function Fact({ label, value }: { readonly label: string; readonly value: string }) {
  return <span className="document-fact"><small>{label}</small><strong>{value.replaceAll("_", " ")}</strong></span>;
}

function MetadataTable({ document }: { readonly document: HumanDocumentView }) {
  const { contractLabel, date } = useI18n();
  const hidden = new Set(["type", "content_locale", "depends_on_document_ids", "depend_de_documents"]);
  const order = ["id", "schema_version", "version_schema", "provenance", "author_agent_id", "auteur_agent_id", "created_at", "date_creation", "feature_id", "project_id", "sequence"];
  const entries = Object.entries(document.metadata)
    .filter(([key]) => !hidden.has(key))
    .sort(([left], [right]) => metadataRank(left, order) - metadataRank(right, order));
  return <dl className="document-metadata-table">{entries.map(([key, value]) => <div key={key}><dt>{contractLabel(key)}</dt><dd><MetadataValue field={key} value={value} documentType={document.type} date={date} /></dd></div>)}</dl>;
}

function metadataRank(field: string, order: readonly string[]): number {
  const index = order.indexOf(field);
  return index === -1 ? order.length : index;
}

function MetadataValue({ field, value, documentType, date }: { readonly field: string; readonly value: unknown; readonly documentType: string; readonly date: (value: string | Date) => string }) {
  if (field === "schema_version" && (typeof value === "number" || typeof value === "string")) return <code>{`framework.${documentType}.v${String(value)}`}</code>;
  if ((field === "created_at" || field === "date_creation") && typeof value === "string") return <span>{date(value)}</span>;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return <code>{String(value)}</code>;
  if (Array.isArray(value)) return <span>{value.map(String).join(", ")}</span>;
  if (value !== null && typeof value === "object") return <dl className="metadata-provenance">{Object.entries(value).map(([key, item]) => <div key={key}><dt>{key.replaceAll("_", " ")}</dt><dd>{typeof item === "object" ? JSON.stringify(item) : String(item)}</dd></div>)}</dl>;
  return <span>—</span>;
}
