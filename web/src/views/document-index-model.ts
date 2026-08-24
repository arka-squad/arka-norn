import type { FeatureTrackingView, HumanDocumentView } from "../../../src/application/web/contracts";

export type DocumentFilter = "all" | "framing" | "review" | "tasks" | "obsolete";

export interface DocumentIndexEntry {
  readonly feature: FeatureTrackingView;
  readonly document: HumanDocumentView;
  readonly revision?: number;
}

export interface DocumentIndexGroup {
  readonly feature: FeatureTrackingView;
  readonly entries: readonly DocumentIndexEntry[];
}

export function buildDocumentGroups(
  features: readonly FeatureTrackingView[],
  filter: DocumentFilter,
  query: string,
): readonly DocumentIndexGroup[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  return features.flatMap((feature) => {
    const stepOrder = new Map(feature.steps.map((step) => [step.id, step.order]));
    const entries = feature.documents
      .map((document) => ({ feature, document, ...revisionOf(document) }))
      .filter((entry) => matchesFilter(entry.document, filter))
      .filter((entry) => normalizedQuery.length === 0 || searchableText(entry).includes(normalizedQuery))
      .sort((left, right) => {
        const stepDifference = (stepOrder.get(left.document.stepId) ?? Number.MAX_SAFE_INTEGER)
          - (stepOrder.get(right.document.stepId) ?? Number.MAX_SAFE_INTEGER);
        if (stepDifference !== 0) return stepDifference;
        return (right.revision ?? 0) - (left.revision ?? 0)
          || (right.document.createdAt ?? "").localeCompare(left.document.createdAt ?? "");
      });
    return entries.length === 0 ? [] : [{ feature, entries }];
  });
}

export function documentFilterCounts(features: readonly FeatureTrackingView[]): Readonly<Record<DocumentFilter, number>> {
  const documents = features.flatMap((feature) => feature.documents);
  return {
    all: documents.length,
    framing: documents.filter((document) => matchesFilter(document, "framing")).length,
    review: documents.filter((document) => matchesFilter(document, "review")).length,
    tasks: documents.filter((document) => matchesFilter(document, "tasks")).length,
    obsolete: documents.filter((document) => document.obsolete).length,
  };
}

function matchesFilter(document: HumanDocumentView, filter: DocumentFilter): boolean {
  if (filter === "all") return true;
  if (filter === "obsolete") return document.obsolete;
  const id = `${document.type} ${document.stepId}`.toLocaleLowerCase();
  if (filter === "framing") return /brief|concept|plan|appendix|invariant|debt/.test(id);
  if (filter === "review") return /audit|review|validation|qa/.test(id);
  return /task|development|report|specification|handoff/.test(id);
}

function searchableText(entry: DocumentIndexEntry): string {
  return [entry.document.title, entry.document.type, entry.document.stepId, entry.document.authorAgentId, entry.feature.name]
    .filter((value): value is string => value !== undefined)
    .join(" ")
    .toLocaleLowerCase();
}

function revisionOf(document: HumanDocumentView): { readonly revision?: number } {
  const value = document.raw["sequence"];
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? { revision: value } : {};
}
