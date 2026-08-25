import { CheckCircle2 } from "lucide-react";
import ReactMarkdown from "react-markdown";

import type { HumanDocumentSection } from "../../../src/application/web/contracts";
import { useI18n } from "../i18n/i18n";

export function DocumentContent({ sections }: { readonly sections: readonly HumanDocumentSection[] }) {
  return <div className="document-content">
    {sections.map((section) => <DocumentSection key={section.id} section={section} />)}
  </div>;
}

export function DocumentIdentity({ sections }: { readonly sections: readonly HumanDocumentSection[] }) {
  const { contractLabel } = useI18n();
  return <dl className="document-identity">{sections.map((section) => <div key={section.id}><dt>{contractLabel(section.id)}</dt><dd><IdentityValue value={section.value} /></dd></div>)}</dl>;
}

export function splitDocumentSections(sections: readonly HumanDocumentSection[]): {
  readonly identity: readonly HumanDocumentSection[];
  readonly content: readonly HumanDocumentSection[];
} {
  return {
    identity: sections.filter(isIdentitySection),
    content: sections.filter((section) => !isIdentitySection(section)),
  };
}

function DocumentSection({ section }: { readonly section: HumanDocumentSection }) {
  const { contractLabel } = useI18n();
  const principle = /principle|golden_rule|directive|principe_directeur/.test(section.id);
  return <section className={principle ? "document-section document-principle" : "document-section"}>
    <div className="document-section-title"><h2>{contractLabel(section.id)}</h2>{Array.isArray(section.value) ? <small>{section.value.length}</small> : null}</div>
    <SectionValue value={section.value} kind={section.kind} />
  </section>;
}

function SectionValue({ value, kind }: { readonly value: unknown; readonly kind: HumanDocumentSection["kind"] }) {
  if (typeof value === "string") return <div className="document-prose"><ReactMarkdown skipHtml>{value}</ReactMarkdown></div>;
  if (typeof value === "number" || typeof value === "boolean" || value === null) return <p className="document-primitive">{displayPrimitive(value)}</p>;
  if (isUnknownArray(value)) {
    if (value.length === 0) return <p className="document-empty">—</p>;
    if (value.every(isRecord)) return <RecordCollection rows={value} compact={kind !== "table"} />;
    return <ul className="document-check-list">{value.map((item, index) => <li key={index}><CheckCircle2 size={14} /><SectionValue value={item} kind="fields" /></li>)}</ul>;
  }
  if (isRecord(value)) return <FieldGroup value={value} />;
  return <p className="document-empty">—</p>;
}

function RecordCollection({ rows, compact }: { readonly rows: readonly Readonly<Record<string, unknown>>[]; readonly compact: boolean }) {
  return <div className={compact ? "record-collection compact" : "record-collection"}>{rows.map((row, index) => <RecordCard key={index} row={row} index={index} />)}</div>;
}

function RecordCard({ row, index }: { readonly row: Readonly<Record<string, unknown>>; readonly index: number }) {
  const { contractLabel } = useI18n();
  const titleKey = ["title", "titre", "name", "subject", "criterion"].find((key) => typeof row[key] === "string");
  const title = titleKey === undefined ? undefined : String(row[titleKey]);
  const badge = primitiveString(row["id"] ?? row["dimension"]);
  const entries = Object.entries(row).filter(([key]) => key !== titleKey && !(badge !== undefined && (key === "id" || key === "dimension")));
  const state = primitiveString(row["status"] ?? row["statut"] ?? row["verdict"]);
  const attention = state !== undefined && /discover|partial|fail|block|reject|invalid|warning/i.test(state);
  return <article className={attention ? "record-card attention" : "record-card"}>
    <header><div className="record-heading">{badge === undefined ? <span className="record-number">{String(index + 1).padStart(2, "0")}</span> : <span className="record-code">{badge.replaceAll("_", " ")}</span>}{title === undefined ? null : <strong>{title}</strong>}</div>{state === undefined ? null : <em>{state.replaceAll("_", " ")}</em>}</header>
    {entries.length === 0 ? null : <dl>{entries.map(([key, item]) => <div key={key}><dt>{contractLabel(key)}</dt><dd><SectionValue value={item} kind="fields" /></dd></div>)}</dl>}
  </article>;
}

function FieldGroup({ value }: { readonly value: Readonly<Record<string, unknown>> }) {
  const { contractLabel } = useI18n();
  return <dl className="document-field-group">{Object.entries(value).map(([key, item]) => <div key={key}><dt>{contractLabel(key)}</dt><dd><SectionValue value={item} kind="fields" /></dd></div>)}</dl>;
}

function isIdentitySection(section: HumanDocumentSection): boolean {
  if (!isCompactIdentityValue(section.value)) return false;
  return /^(target|source_concepts|concept_sources|task_id|task|tache|audited_repository|audited_reference|audit_date|date_audit|repository|reference|method|scope_model|technical_stack|appendix_of|assigned_agent)$/.test(section.id);
}

function IdentityValue({ value }: { readonly value: unknown }) {
  if (Array.isArray(value)) return <span>{value.map(String).join(", ")}</span>;
  return <span>{displayPrimitive(value as string | number | boolean | null)}</span>;
}

function isCompactIdentityValue(value: unknown): boolean {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null) return true;
  return Array.isArray(value) && value.length <= 4 && value.every((item) => typeof item === "string" || typeof item === "number");
}

function displayPrimitive(value: string | number | boolean | null): string {
  if (value === null) return "—";
  if (typeof value !== "string") return String(value);
  return value.length < 48 && /^[\w.:-]+$/.test(value) ? value.replaceAll("_", " ") : value;
}

function primitiveString(value: unknown): string | undefined {
  return typeof value === "string" || typeof value === "number" ? String(value) : undefined;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUnknownArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}
