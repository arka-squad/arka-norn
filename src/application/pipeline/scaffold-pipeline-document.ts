/*
 * Copyright 2026 Arka Labs
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { findScaffoldSentinels, scaffoldFromSchema } from "../../domain/pipeline/scaffold-schema.js";
import { AgentId } from "../../domain/agent/agent-id.js";
import { ProjectId } from "../../domain/project/project-id.js";
import type { PipelineScaffoldResult } from "../../ports/inbound/for-pipeline.js";
import type { PipelineDocumentSource } from "../../ports/outbound/pipeline-document-source.js";
import { activeLocale, translate } from "../localization/locale.js";
import { canonicalDocumentType, isDocumentType } from "../compatibility/legacy-french-contract.js";

export function scaffoldPipelineDocumentUseCaseFactory(deps: { readonly source: PipelineDocumentSource }) {
  return async (input: { readonly stepId: string; readonly outputPath: string; readonly authorAgentId: string; readonly featureId?: string; readonly projectId?: string; readonly pipelineId?: string; readonly documentContractVersion?: 3 | 5; readonly force?: boolean; readonly allowedRoot?: string }): Promise<PipelineScaffoldResult> => {
    const authorAgentId = AgentId.of(input.authorAgentId).value;
    if (input.projectId !== undefined && input.featureId !== undefined) {
      throw new Error("A scaffold cannot target both a Project and a Feature.");
    }
    const contractVersion = input.documentContractVersion ?? 5;
    const stepId = contractVersion === 3 ? input.stepId : canonicalDocumentType(input.stepId);
    if (input.projectId !== undefined && !isDocumentType(stepId, "current_state_audit")) {
      throw new Error("Project-scoped scaffolds are supported only for current_state_audit.");
    }
    const definition = await deps.source.loadDefinition(input.pipelineId, contractVersion);
    let schemaPath = schemaFor(definition, stepId);
    if (schemaPath === undefined && input.pipelineId === undefined) {
      const catalog = await deps.source.loadCatalog();
      for (const entry of catalog.pipelines) {
        schemaPath = schemaFor(await deps.source.loadDefinition(entry.id, contractVersion), stepId);
        if (schemaPath !== undefined) break;
      }
    }
    if (schemaPath === undefined) throw new Error(`Unknown pipeline step: ${stepId}.`);
    const [schema, envelope] = await Promise.all([
      deps.source.loadSchema(schemaPath),
      deps.source.loadSchema(contractVersion === 3
        ? input.projectId === undefined ? "schemas/legacy/fr/document-envelope.schema.json" : "schemas/legacy/fr/project-audit-envelope.schema.json"
        : input.projectId === undefined ? "schemas/document-envelope.schema.json" : "schemas/project-audit-envelope.schema.json"),
    ]);
    const locale = activeLocale();
    const generated = scaffoldFromSchema(
      mergeObjectSchemas(envelope, schema),
      stepId,
      {
        fill: translate("pipeline.scaffold.fill", {}, locale),
        choosePrefix: translate("pipeline.scaffold.choosePrefix", {}, locale),
      },
    );
    const scaffold = {
      ...generated,
      schema_version: contractVersion === 3 ? input.projectId === undefined ? 3 : 4 : 5,
      ...(contractVersion === 5 ? { content_locale: locale } : {}),
      author_agent_id: authorAgentId,
      type: stepId,
      ...(input.featureId === undefined ? {} : { feature_id: input.featureId }),
      ...(input.projectId === undefined ? {} : { project_id: ProjectId.of(input.projectId).value }),
    };
    await deps.source.write(input.outputPath, scaffold, {
      ...(input.force === undefined ? {} : { force: input.force }),
      ...(input.allowedRoot === undefined ? {} : { allowedRoot: input.allowedRoot }),
    });
    return { stepId, outputPath: input.outputPath, sentinelPaths: findScaffoldSentinels(scaffold) };
  };
}

function schemaFor(definition: Awaited<ReturnType<PipelineDocumentSource["loadDefinition"]>>, stepId: string): string | undefined {
  return definition.steps.find((step) => step.id === stepId)?.schemaPath
    ?? definition.transversalDocuments.find((document) => document.type === stepId)?.schemaPath;
}

function mergeObjectSchemas(
  envelope: Readonly<Record<string, unknown>>,
  document: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  const envelopeProperties = recordField(envelope, "properties");
  const documentProperties = recordField(document, "properties");
  return {
    type: "object",
    required: [...stringArrayField(envelope, "required"), ...stringArrayField(document, "required")].filter((value, index, values) => values.indexOf(value) === index),
    properties: { ...envelopeProperties, ...documentProperties },
    ...(hasDefs(document) || hasDefs(envelope) ? { $defs: { ...defsOf(envelope), ...defsOf(document) } } : {}),
  };
}

function hasDefs(value: Readonly<Record<string, unknown>>): boolean {
  return isRecord(value["$defs"]);
}

function defsOf(value: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  const defs = value["$defs"];
  return isRecord(defs) ? defs : {};
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function recordField(value: Readonly<Record<string, unknown>>, key: string): Readonly<Record<string, unknown>> {
  const field = value[key];
  return typeof field === "object" && field !== null && !Array.isArray(field) ? field as Readonly<Record<string, unknown>> : {};
}

function stringArrayField(value: Readonly<Record<string, unknown>>, key: string): readonly string[] {
  const field = value[key];
  return Array.isArray(field) && field.every((item) => typeof item === "string") ? field : [];
}
