/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import type { DocumentSummary } from "../../domain/pipeline/pipeline-report.js";
import type { DocumentReference, HumanDocumentSection, HumanDocumentView } from "./contracts.js";

const ENVELOPE_FIELDS = new Set([
  "schema_version", "version_schema", "id", "type", "feature_id", "project_id", "content_locale",
  "author_agent_id", "auteur_agent_id", "created_at", "date_creation", "sequence", "depends_on_document_ids",
  "depend_de_documents", "provenance",
]);

const PRESENTATION_FIELDS = new Set(["title", "titre", "version", "date", "status", "statut"]);

export function createHumanDocumentView(input: {
  readonly summary: DocumentSummary;
  readonly stepId: string;
  readonly raw: Readonly<Record<string, unknown>>;
  readonly knownDocuments: ReadonlyMap<string, { readonly title: string }>;
  readonly selectedDocumentIds: ReadonlySet<string>;
}): HumanDocumentView {
  const id = input.summary.id ?? stringValue(input.raw, "id") ?? basenameWithoutExtension(input.summary.filePath);
  const type = input.summary.type ?? stringValue(input.raw, "type") ?? input.stepId;
  const dependencies = input.summary.dependencyDocumentIds.map((dependencyId): DocumentReference => {
    const resolved = input.knownDocuments.get(dependencyId);
    return { id: dependencyId, resolved: resolved !== undefined, ...(resolved === undefined ? {} : { title: resolved.title }) };
  });
  const contentEntries = Object.entries(input.raw).filter(([key]) => !ENVELOPE_FIELDS.has(key) && !PRESENTATION_FIELDS.has(key));
  const documentTitle = stringValue(input.raw, "title") ?? stringValue(input.raw, "titre") ?? humanize(type);
  return {
    id,
    type,
    title: documentTitle,
    ...(input.summary.featureId === undefined ? {} : { featureId: input.summary.featureId }),
    stepId: input.stepId,
    valid: input.summary.valid,
    obsolete: input.summary.valid && input.summary.id !== undefined && !input.selectedDocumentIds.has(input.summary.id),
    ...(input.summary.authorAgentId === undefined ? {} : { authorAgentId: input.summary.authorAgentId }),
    ...(input.summary.createdAt === undefined ? {} : { createdAt: input.summary.createdAt }),
    dependencies,
    presentation: {
      ...optionalString("version", input.raw["version"]),
      ...optionalString("documentDate", input.raw["date"]),
      ...optionalString("status", input.raw["status"] ?? input.raw["statut"]),
      ...optionalString("contentLocale", input.raw["content_locale"]),
    },
    sections: contentEntries.map(([key, value]) => sectionFrom(key, value)),
    metadata: Object.fromEntries(Object.entries(input.raw).filter(([key]) => ENVELOPE_FIELDS.has(key))),
    raw: input.raw,
    errors: input.summary.errors,
  };
}

function optionalString<Key extends string>(key: Key, value: unknown): Readonly<Record<Key, string>> | Record<string, never> {
  return typeof value === "string" && value.length > 0 ? { [key]: value } as Readonly<Record<Key, string>> : {};
}

export function humanize(value: string): string {
  return value.replaceAll("_", " ").replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function sectionFrom(key: string, value: unknown): HumanDocumentSection {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null) {
    return { id: key, title: humanize(key), kind: "text", value };
  }
  if (Array.isArray(value)) {
    const table = value.length > 0 && value.every(isRecord);
    return { id: key, title: humanize(key), kind: table ? "table" : "list", value };
  }
  return { id: key, title: humanize(key), kind: "fields", value };
}

function stringValue(value: Readonly<Record<string, unknown>>, key: string): string | undefined {
  return typeof value[key] === "string" ? value[key] : undefined;
}

function basenameWithoutExtension(path: string): string {
  return path.replaceAll("\\", "/").split("/").at(-1)?.replace(/\.json$/i, "") ?? "document";
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
