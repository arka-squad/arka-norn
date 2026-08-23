/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import { createHash } from "node:crypto";
import * as fs from "node:fs/promises";
import { basename, join, resolve } from "node:path";

import { normalizeLegacyDocument } from "../../../application/compatibility/legacy-french-contract.js";
import { canonicalDocumentType, canonicalPipelineId } from "../../../domain/compatibility/legacy-contract.js";
import { isFeatureMarkerV3, isFeatureMarkerV4, planFeatureMarkerMigration } from "../../../domain/shared/marker-formats.js";
import { AjvDocumentValidator } from "../pipeline/ajv-document-validator.js";
import { FsPipelineDocumentSource } from "../pipeline/fs-pipeline-document-source.js";
import { readRaw, writeFileAtomic } from "./_shared/atomic-json.js";

export interface FeatureContractMigrationResult {
  readonly featureRoot: string;
  readonly fromMarkerVersion: 3 | 4;
  readonly toMarkerVersion: 4;
  readonly pipelineId: string;
  readonly changed: boolean;
  readonly applied: boolean;
  readonly documents: readonly {
    readonly path: string;
    readonly type: string;
    readonly fromSchemaVersion: number;
    readonly toSchemaVersion: 5;
    readonly backupPath?: string;
  }[];
  readonly markerBackupPath?: string;
}

interface PlannedDocument {
  readonly path: string;
  readonly raw: string;
  readonly content: Readonly<Record<string, unknown>>;
  readonly migrated: Readonly<Record<string, unknown>>;
  readonly type: string;
  readonly sourceVersion: number;
  readonly backupPath: string;
}

export async function migrateLegacyFeatureContract(input: {
  readonly featureRoot: string;
  readonly frameworkRoot: string;
  readonly apply: boolean;
}): Promise<FeatureContractMigrationResult> {
  const featureRoot = await canonicalDirectory(input.featureRoot);
  const markerPath = join(featureRoot, ".arka-norn", "feature.json");
  const markerRaw = await requiredRaw(markerPath);
  const marker = parseRecord(markerRaw, markerPath);
  if (!isFeatureMarkerV3(marker) && !isFeatureMarkerV4(marker)) throw new Error(`Unsupported Feature marker for contract migration: ${markerPath}`);

  const pipelineId = canonicalPipelineId(marker.pipelineId);
  const source = new FsPipelineDocumentSource(input.frameworkRoot);
  const definition = await source.loadDefinition(pipelineId);
  const schemas = new Map([
    ...definition.steps.map((step) => [step.id, step.schemaPath] as const),
    ...definition.transversalDocuments.map((document) => [document.type, document.schemaPath] as const),
  ]);
  const validator = new AjvDocumentValidator(input.frameworkRoot);
  const planned = await planDocuments(featureRoot, schemas, validator);

  if (isFeatureMarkerV4(marker)) {
    if (planned.length > 0) throw new Error(`Feature ${marker.id} has a v4 marker but still contains legacy documents.`);
    return { featureRoot, fromMarkerVersion: 4, toMarkerVersion: 4, pipelineId, changed: false, applied: false, documents: [] };
  }

  const markerPlan = planFeatureMarkerMigration(marker);
  const markerBackupPath = `${markerPath}.v3.bak`;
  if (!input.apply) {
    return {
      featureRoot,
      fromMarkerVersion: 3,
      toMarkerVersion: 4,
      pipelineId,
      changed: true,
      applied: false,
      documents: planned.map(documentResult),
      markerBackupPath,
    };
  }

  await createBackup(markerBackupPath, markerRaw);
  for (const document of planned) await createBackup(document.backupPath, document.raw);
  const written: PlannedDocument[] = [];
  try {
    for (const document of planned) {
      await writeFileAtomic(document.path, `${JSON.stringify(document.migrated, null, 2)}\n`, { mode: 0o644 });
      written.push(document);
    }
    await writeFileAtomic(markerPath, `${JSON.stringify(markerPlan.output, null, 2)}\n`, { mode: 0o644 });
  } catch (error) {
    for (const document of written.reverse()) await writeFileAtomic(document.path, document.raw, { mode: 0o644 }).catch(() => undefined);
    await writeFileAtomic(markerPath, markerRaw, { mode: 0o644 }).catch(() => undefined);
    throw error;
  }
  return {
    featureRoot,
    fromMarkerVersion: 3,
    toMarkerVersion: 4,
    pipelineId,
    changed: true,
    applied: true,
    documents: planned.map((document) => ({ ...documentResult(document), backupPath: document.backupPath })),
    markerBackupPath,
  };
}

async function planDocuments(
  featureRoot: string,
  schemas: ReadonlyMap<string, string>,
  validator: AjvDocumentValidator,
): Promise<readonly PlannedDocument[]> {
  const entries = await fs.readdir(featureRoot, { withFileTypes: true });
  const planned: PlannedDocument[] = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const path = join(featureRoot, entry.name);
    const raw = await requiredRaw(path);
    let content: Readonly<Record<string, unknown>>;
    try {
      content = parseRecord(raw, path);
    } catch (error) {
      if (looksLikePipelineDocument(raw)) throw error;
      continue;
    }
    const sourceType = content["type"];
    const sourceVersion = content["schema_version"];
    if (sourceType === undefined && sourceVersion === undefined) continue;
    if (typeof sourceType !== "string" || typeof sourceVersion !== "number" || !Number.isInteger(sourceVersion)) {
      throw new Error(`Ambiguous pipeline document format: ${path}`);
    }
    if (sourceVersion === 5) continue;
    if (sourceVersion < 2 || sourceVersion > 4) throw new Error(`Unsupported schema_version ${sourceVersion} in ${path}`);
    const type = canonicalDocumentType(sourceType);
    const schemaPath = schemas.get(type);
    if (schemaPath === undefined) throw new Error(`Document type ${sourceType} is not part of the Feature pipeline: ${path}`);
    const migrated = normalizeLegacyDocument(content, {
      migratedAt: deterministicMigrationDate(content),
      sourceSha256: createHash("sha256").update(raw, "utf8").digest("hex"),
    });
    const validation = await validator.validate(schemaPath, migrated);
    if (!validation.valid) throw new Error(`Migrated document would be invalid (${basename(path)}): ${validation.errors.join("; ")}`);
    assertIdentityAndRelationsPreserved(content, migrated, path);
    planned.push({ path, raw, content, migrated, type, sourceVersion, backupPath: `${path}.v${sourceVersion}.bak` });
  }
  return planned;
}

function assertIdentityAndRelationsPreserved(source: Readonly<Record<string, unknown>>, migrated: Readonly<Record<string, unknown>>, path: string): void {
  for (const field of ["id", "feature_id", "sequence", "created_at", "author_agent_id", "depends_on_document_ids"] as const) {
    if (JSON.stringify(source[field]) !== JSON.stringify(migrated[field])) throw new Error(`Migration changed preserved field ${field}: ${path}`);
  }
}

function deterministicMigrationDate(content: Readonly<Record<string, unknown>>): string {
  const createdAt = content["created_at"];
  return typeof createdAt === "string" && !Number.isNaN(new Date(createdAt).getTime()) ? createdAt : "1970-01-01T00:00:00.000Z";
}

function documentResult(document: PlannedDocument) {
  return { path: document.path, type: document.type, fromSchemaVersion: document.sourceVersion, toSchemaVersion: 5 as const };
}

async function canonicalDirectory(path: string): Promise<string> {
  const stat = await fs.lstat(path);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`Feature migration target must be a regular directory: ${path}`);
  return fs.realpath(resolve(path));
}

async function requiredRaw(path: string): Promise<string> {
  const raw = await readRaw(path);
  if (raw === undefined) throw new Error(`File not found: ${path}`);
  return raw;
}

function parseRecord(raw: string, path: string): Readonly<Record<string, unknown>> {
  const parsed = JSON.parse(raw) as unknown;
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error(`Expected a JSON object: ${path}`);
  return parsed as Readonly<Record<string, unknown>>;
}

function looksLikePipelineDocument(raw: string): boolean {
  return raw.includes("schema_version") || raw.includes('"type"');
}

async function createBackup(backupPath: string, raw: string): Promise<void> {
  try {
    await writeFileAtomic(backupPath, raw, { mode: 0o644, exclusive: true });
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) throw error;
    const existing = await requiredRaw(backupPath);
    if (existing !== raw) throw new Error(`Existing migration backup differs from source: ${backupPath}`);
  }
}
