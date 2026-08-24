/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
const ENVELOPE_FIELDS = new Set([
    "schema_version", "version_schema", "id", "type", "feature_id", "project_id", "content_locale",
    "author_agent_id", "auteur_agent_id", "created_at", "date_creation", "sequence", "depends_on_document_ids",
    "depend_de_documents", "provenance",
]);
const PRESENTATION_FIELDS = new Set(["title", "titre", "version", "date", "status", "statut"]);
export function createHumanDocumentView(input) {
    const id = input.summary.id ?? stringValue(input.raw, "id") ?? basenameWithoutExtension(input.summary.filePath);
    const type = input.summary.type ?? stringValue(input.raw, "type") ?? input.stepId;
    const dependencies = input.summary.dependencyDocumentIds.map((dependencyId) => {
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
function optionalString(key, value) {
    return typeof value === "string" && value.length > 0 ? { [key]: value } : {};
}
export function humanize(value) {
    return value.replaceAll("_", " ").replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
function sectionFrom(key, value) {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null) {
        return { id: key, title: humanize(key), kind: "text", value };
    }
    if (Array.isArray(value)) {
        const table = value.length > 0 && value.every(isRecord);
        return { id: key, title: humanize(key), kind: table ? "table" : "list", value };
    }
    return { id: key, title: humanize(key), kind: "fields", value };
}
function stringValue(value, key) {
    return typeof value[key] === "string" ? value[key] : undefined;
}
function basenameWithoutExtension(path) {
    return path.replaceAll("\\", "/").split("/").at(-1)?.replace(/\.json$/i, "") ?? "document";
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
//# sourceMappingURL=human-document.js.map