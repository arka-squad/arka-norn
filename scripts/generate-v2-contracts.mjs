#!/usr/bin/env node

import { cpSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const schemasRoot = resolve(root, "schemas");
const legacySchemasRoot = resolve(schemasRoot, "legacy", "fr");
const legacyPipelinesRoot = resolve(root, "pipelines", "legacy", "fr");
const compatibility = JSON.parse(readFileSync(resolve(root, "src", "domain", "compatibility", "legacy-fr-contract.json"), "utf8"));

const schemaNames = {
  "annexe-contrat-technique.schema.json": "technical-contract-appendix.schema.json",
  "audit-etat-reel.schema.json": "current-state-audit.schema.json",
  "audit-livraison.schema.json": "delivery-audit.schema.json",
  "cadrage-essentiel.schema.json": "feature-brief.schema.json",
  "cadrage-rework.schema.json": "rework-brief.schema.json",
  "cr-dev.schema.json": "development-report.schema.json",
  "invariants-figes.schema.json": "frozen-invariants.schema.json",
  "recette-qa.schema.json": "qa-review.schema.json",
  "registre-dettes.schema.json": "debt-register.schema.json",
  "spec-integration-technique.schema.json": "technical-integration-specification.schema.json",
  "tache-agent.schema.json": "agent-task.schema.json",
  "validation-livraison.schema.json": "delivery-validation.schema.json",
};

const pipelineSources = {
  complete: resolve(root, "pipeline.json"),
  fastdev: resolve(root, "pipelines", "arka-norn-fastdev.json"),
  essential: resolve(root, "pipelines", "arka-norn-essentiel.json"),
};

mkdirSync(legacySchemasRoot, { recursive: true });
mkdirSync(legacyPipelinesRoot, { recursive: true });

for (const file of topLevelSchemaFiles()) {
  const legacyPath = resolve(legacySchemasRoot, file);
  if (!existsSync(legacyPath)) cpSync(resolve(schemasRoot, file), legacyPath);
}
for (const [name, source] of Object.entries(pipelineSources)) {
  const legacyPath = resolve(legacyPipelinesRoot, `${name}.json`);
  if (!existsSync(legacyPath)) cpSync(source, legacyPath);
}

for (const file of topLevelSchemaFiles()) {
  if (file === "document-envelope.schema.json") continue;
  if (file === "project-audit-envelope.schema.json") continue;
  const source = JSON.parse(readFileSync(resolve(legacySchemasRoot, file), "utf8"));
  const outputName = schemaNames[file] ?? file;
  const schema = transformSchema(source, outputName);
  if (outputName === "current-state-audit.schema.json") {
    schema.allOf = [{ if: { properties: { project_id: {} }, required: ["project_id"] }, then: { $ref: "project-audit-envelope.schema.json" }, else: { $ref: "document-envelope.schema.json" } }];
  }
  writeJson(resolve(schemasRoot, outputName), schema);
}

writeJson(resolve(schemasRoot, "document-envelope.schema.json"), documentEnvelope("feature_id"));
writeJson(resolve(schemasRoot, "project-audit-envelope.schema.json"), documentEnvelope("project_id"));

for (const [legacyName, canonicalName] of Object.entries(schemaNames)) {
  const oldPath = resolve(schemasRoot, legacyName);
  if (legacyName !== canonicalName && existsSync(oldPath)) unlinkSync(oldPath);
}

const definitions = [
  canonicalPipeline("complete", "arka-norn-complete", "Complete", "Full ten-step workflow for structural, uncertain or migration-heavy Features."),
  canonicalPipeline("essential", "arka-norn-essential", "Essential", "Five-step default workflow for delivering a well-understood Feature."),
  canonicalPipeline("fastdev", "arka-norn-fastdev", "FastDev", "Short controlled workflow for bounded fixes, refactors and UX improvements."),
];
writeJson(resolve(root, "pipeline.json"), definitions[0]);
writeJson(resolve(root, "pipelines", "arka-norn-essential.json"), definitions[1]);
writeJson(resolve(root, "pipelines", "arka-norn-fastdev.json"), definitions[2]);
if (existsSync(resolve(root, "pipelines", "arka-norn-essentiel.json"))) unlinkSync(resolve(root, "pipelines", "arka-norn-essentiel.json"));
writeJson(resolve(root, "pipelines", "catalog.json"), {
  schemaVersion: 2,
  defaultPipelineId: "arka-norn-essential",
  pipelines: [
    { id: "arka-norn-complete", aliases: ["complete", "standard", "arka-norn-default"], name: "Complete", description: definitions[0].description, definition: "pipeline.json" },
    { id: "arka-norn-essential", aliases: ["essential", "essentiel", "arka-norn-essentiel"], name: "Essential", description: definitions[1].description, definition: "pipelines/arka-norn-essential.json" },
    { id: "arka-norn-fastdev", aliases: ["fastdev"], name: "FastDev", description: definitions[2].description, definition: "pipelines/arka-norn-fastdev.json" },
    { id: "arka-norn-essential-2.3", aliases: ["essential-2.3"], name: "Essential 2.3", description: "Delivery pipeline for a grounded framing plan: development, audit and validation.", definition: "pipelines/arka-norn-essential-2.3.json" },
    { id: "arka-norn-complete-2.3", aliases: ["complete-2.3"], name: "Complete 2.3", description: "Delivery pipeline for a grounded higher-risk plan, with optional technical artifacts only when consumed.", definition: "pipelines/arka-norn-complete-2.3.json" },
  ],
});

function topLevelSchemaFiles() {
  return Array.from(new Set([...Object.keys(schemaNames),
    "agent-registry.schema.json", "agent-session.schema.json", "audit-canonical.schema.json", "audit-kb-record.schema.json",
    "audit-module-result.schema.json", "audit-request.schema.json", "audit-run.schema.json", "concept.schema.json",
    "document-envelope.schema.json", "executions-registry.schema.json", "feature-marker.schema.json", "handoff.schema.json",
    "orchestration-policy.schema.json", "plan.schema.json", "project-audit-envelope.schema.json", "project-marker.schema.json",
  ])).sort();
}

function transformSchema(source, outputName) {
  const transformed = transformNode(source, "root");
  transformed.$id = outputName;
  transformed.title = titleFrom(outputName);
  const schemaVersion = transformed.properties?.schema_version;
  if (schemaVersion !== undefined) transformed.properties.schema_version = { const: 5 };
  if (outputName === "feature-marker.schema.json") {
    transformed.properties.schemaVersion = { enum: [4, 5] };
    transformed.properties.documentContractVersion = { const: 5 };
    transformed.properties.pipelineDefinitionVersion = { const: "2.3" };
    transformed.properties.framingPlanRef = {
      type: "object", additionalProperties: false,
      required: ["planId", "revision", "fingerprint", "relativePath"],
      properties: {
        planId: { type: "string", pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$" },
        revision: { type: "integer", minimum: 1 },
        fingerprint: { type: "string", pattern: "^[a-f0-9]{64}$" },
        relativePath: { type: "string", pattern: "^\\.arka-norn/plans/" },
      },
    };
    transformed.required = [...transformed.required, "documentContractVersion"];
    transformed.allOf = [{
      if: { properties: { schemaVersion: { const: 5 } }, required: ["schemaVersion"] },
      then: {
        properties: { pipelineDefinitionVersion: true, framingPlanRef: true },
        required: ["pipelineDefinitionVersion", "framingPlanRef"],
      },
      else: { properties: { pipelineDefinitionVersion: false, framingPlanRef: false } },
    }];
  }
  return transformed;
}

function transformNode(value, context) {
  if (Array.isArray(value)) {
    if (context === "required") return value.map(item => compatibility.fields[item] ?? item);
    if (context === "enum") return value.map(mapLiteral);
    return value.map(item => transformNode(item, context));
  }
  if (value === null || typeof value !== "object") return typeof value === "string" ? mapLiteral(value) : value;
  const target = {};
  for (const [key, child] of Object.entries(value)) {
    if (key === "title" || key === "description" || key === "examples") continue;
    if (key === "$ref" && typeof child === "string") {
      target[key] = Object.entries(schemaNames).reduce((result, [from, to]) => result.replace(from, to), child);
      continue;
    }
    if (key === "properties") {
      target.properties = Object.fromEntries(Object.entries(child).map(([field, schema]) => [compatibility.fields[field] ?? field, transformNode(schema, "schema")]));
      continue;
    }
    if (key === "required") {
      target.required = transformNode(child, "required");
      continue;
    }
    if (key === "enum") {
      target.enum = transformNode(child, "enum");
      continue;
    }
    if (key === "default") {
      target.default = transformData(child);
      continue;
    }
    if (key === "const" && typeof child === "string") {
      target.const = mapLiteral(child);
      continue;
    }
    target[key] = transformNode(child, key);
  }
  return target;
}

function transformData(value) {
  if (Array.isArray(value)) return value.map(transformData);
  if (value === null || typeof value !== "object") return typeof value === "string" ? mapLiteral(value) : value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [compatibility.fields[key] ?? key, transformData(child)]));
}

function canonicalPipeline(name, pipelineId, title, description) {
  const legacyDefinition = JSON.parse(readFileSync(resolve(legacyPipelinesRoot, `${name}.json`), "utf8"));
  return {
    $id: name === "complete" ? "pipeline.json" : `pipelines/arka-norn-${name}.json`,
    schemaVersion: 3,
    pipelineId,
    version: "2.0.0",
    name: title,
    description,
    steps: legacyDefinition.steps.map(step => ({
      id: compatibility.documentTypes[step.id] ?? step.id,
      order: step.ordre,
      schema: schemaPath(step.schema),
      required: step.obligatoire,
      multiple: step.multiple,
      dependsOn: step.depend_de.map(type => compatibility.documentTypes[type] ?? type),
      ...(step.peut_boucler_vers === undefined ? {} : { loopTo: compatibility.documentTypes[step.peut_boucler_vers] ?? step.peut_boucler_vers }),
      ...(step.business_policy === undefined ? {} : { businessPolicy: transformPolicy(step.business_policy) }),
    })),
    transversal: { handoff: { schema: "schemas/handoff.schema.json", description: "Optional handoff between agents or providers." } },
    definitionOfDone: "Every required document validates, every dependency resolves and the latest delivery review passes.",
  };
}

function transformPolicy(policy) {
  return {
    type: policy.type,
    ...(policy.target_step === undefined ? {} : { targetStep: compatibility.documentTypes[policy.target_step] ?? policy.target_step }),
    ...(policy.target_document_field === undefined ? {} : { targetDocumentField: compatibility.fields[policy.target_document_field] ?? policy.target_document_field }),
    verdictField: compatibility.fields[policy.verdict_field] ?? policy.verdict_field,
    passValues: policy.pass_values.map(mapLiteral),
    ...(policy.fail_values === undefined ? {} : { failValues: policy.fail_values.map(mapLiteral) }),
    ...(policy.in_progress_values === undefined ? {} : { inProgressValues: policy.in_progress_values.map(mapLiteral) }),
    ...(policy.retry_step === undefined ? {} : { retryStep: compatibility.documentTypes[policy.retry_step] ?? policy.retry_step }),
  };
}

function documentEnvelope(ownerField) {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: ownerField === "feature_id" ? "document-envelope.schema.json" : "project-audit-envelope.schema.json",
    title: ownerField === "feature_id" ? "Arka Norn Feature document envelope" : "Arka Norn Project audit envelope",
    type: "object",
    required: ["schema_version", "id", ownerField, "type", "sequence", "created_at", "depends_on_document_ids", "content_locale"],
    properties: {
      schema_version: { const: 5 },
      author_agent_id: { type: "string", pattern: "^[A-Z][A-Za-z0-9-]{0,39}_[a-z][a-z0-9-]{0,39}_[0-9]{8}(?:_[0-9]{2})?$" },
      id: { type: "string", minLength: 1, pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$" },
      [ownerField]: { type: "string", minLength: 1 },
      type: { type: "string", minLength: 1 },
      sequence: { type: "integer", minimum: 1 },
      created_at: { type: "string", format: "date-time" },
      depends_on_document_ids: { type: "array", uniqueItems: true, items: { type: "string", minLength: 1 } },
      content_locale: { enum: ["en", "fr"] },
      migration: {
        type: "object", additionalProperties: false,
        required: ["source_schema_version", "source_document_type", "migrated_at", "source_sha256"],
        properties: {
          source_schema_version: { type: "integer", minimum: 1 },
          source_document_type: { type: "string", minLength: 1 },
          migrated_at: { type: "string", format: "date-time" },
          source_sha256: { type: "string", pattern: "^[0-9a-f]{64}$" },
        },
      },
    },
    allOf: [{
      if: {
        required: ["migration"],
        properties: { migration: { type: "object", required: ["source_schema_version"], properties: { source_schema_version: { const: 2 } } } },
      },
      then: {},
      else: { required: ["author_agent_id"], properties: { author_agent_id: { type: "string" } } },
    }],
  };
}

function schemaPath(value) {
  const file = basename(value);
  return `schemas/${schemaNames[file] ?? file}`;
}

function mapLiteral(value) {
  return compatibility.enumValues[value] ?? compatibility.documentTypes[value] ?? value;
}

function titleFrom(file) {
  return file.replace(".schema.json", "").split("-").map(word => word[0].toUpperCase() + word.slice(1)).join(" ");
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
