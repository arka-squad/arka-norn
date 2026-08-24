import {
  AlertTriangle, CheckCircle2, FileText, FlaskConical, ShieldCheck, Target,
} from "lucide-react";
import ReactMarkdown from "react-markdown";

import type { HumanDocumentSection } from "../../../src/application/web/contracts";
import { useI18n } from "../i18n/i18n";

export function DocumentContent({ sections }: { readonly sections: readonly HumanDocumentSection[] }) {
  return <div className="document-content">{sections.map((section, index) => <DocumentSection key={section.id} section={section} index={index} />)}</div>;
}

function DocumentSection({ section, index }: { readonly section: HumanDocumentSection; readonly index: number }) {
  const { contractLabel } = useI18n();
  const tone = sectionTone(section.id);
  const Icon = sectionIcon(tone);
  return <section className={`document-section document-section-${tone}`}>
    <div className="document-section-title">
      <span><Icon size={15} /></span>
      <div><p>{String(index + 1).padStart(2, "0")}</p><h2>{contractLabel(section.id)}</h2></div>
    </div>
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
  const titleKey = ["title", "titre", "name", "subject", "criterion", "id"].find((key) => typeof row[key] === "string");
  const title = titleKey === undefined ? undefined : String(row[titleKey]);
  const badge = titleKey === "id" ? undefined : primitiveString(row["id"] ?? row["dimension"]);
  const entries = Object.entries(row).filter(([key]) => key !== titleKey && !(badge !== undefined && (key === "id" || key === "dimension")));
  return <article className="record-card">
    <header><span className="record-number">{String(index + 1).padStart(2, "0")}</span><div>{badge === undefined ? null : <small>{badge.replaceAll("_", " ")}</small>}{title === undefined ? <strong>{contractLabel("result")}</strong> : <strong>{title}</strong>}</div></header>
    {entries.length === 0 ? null : <dl>{entries.map(([key, item]) => <div key={key}><dt>{contractLabel(key)}</dt><dd><SectionValue value={item} kind="fields" /></dd></div>)}</dl>}
  </article>;
}

function FieldGroup({ value }: { readonly value: Readonly<Record<string, unknown>> }) {
  const { contractLabel } = useI18n();
  return <dl className="document-field-group">{Object.entries(value).map(([key, item]) => <div key={key}><dt>{contractLabel(key)}</dt><dd><SectionValue value={item} kind="fields" /></dd></div>)}</dl>;
}

function sectionTone(id: string): "key" | "risk" | "proof" | "governance" | "neutral" {
  if (/summary|objective|outcome|principle|recommendation|definition_of_done|result_expected/.test(id)) return "key";
  if (/risk|debt|finding|anomal|block|ecart/.test(id)) return "risk";
  if (/test|evidence|proof|validation|acceptance|criteria|critere/.test(id)) return "proof";
  if (/decision|invariant|correction|scope|perimetre/.test(id)) return "governance";
  return "neutral";
}

function sectionIcon(tone: ReturnType<typeof sectionTone>) {
  if (tone === "key") return Target;
  if (tone === "risk") return AlertTriangle;
  if (tone === "proof") return FlaskConical;
  if (tone === "governance") return ShieldCheck;
  return FileText;
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
