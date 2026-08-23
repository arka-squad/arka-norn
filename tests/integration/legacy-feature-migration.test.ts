/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

import { migrateLegacyFeatureContract } from "../../src/adapters/outbound/filesystem/legacy-feature-migrator.ts";

const ROOT = resolve(import.meta.dirname, "..", "..");
const LEGACY_EXAMPLE = resolve(ROOT, "tests", "fixtures", "legacy", "fr", "examples", "feature-essential");

test("legacy Feature migration is dry-run safe, deterministic and idempotent", async (context) => {
  const featureRoot = fixture(context);
  const sourcePath = resolve(featureRoot, "01-cadrage-essentiel.json");
  const sourceRaw = readFileSync(sourcePath, "utf8");
  const markerPath = resolve(featureRoot, ".arka-norn", "feature.json");
  const markerRaw = readFileSync(markerPath, "utf8");

  const preview = await migrateLegacyFeatureContract({ featureRoot, frameworkRoot: ROOT, apply: false });
  assert.equal(preview.applied, false);
  assert.equal(preview.changed, true);
  assert.equal(preview.pipelineId, "arka-norn-essential");
  assert.equal(preview.documents.length, 5);
  assert.equal(readFileSync(sourcePath, "utf8"), sourceRaw);
  assert.equal(readFileSync(markerPath, "utf8"), markerRaw);

  const applied = await migrateLegacyFeatureContract({ featureRoot, frameworkRoot: ROOT, apply: true });
  assert.equal(applied.applied, true);
  assert.equal(readFileSync(`${sourcePath}.v3.bak`, "utf8"), sourceRaw);
  assert.equal(readFileSync(`${markerPath}.v3.bak`, "utf8"), markerRaw);
  const migrated = JSON.parse(readFileSync(sourcePath, "utf8")) as {
    readonly schema_version: number;
    readonly type: string;
    readonly content_locale: string;
    readonly migration: { readonly source_schema_version: number; readonly source_sha256: string };
  };
  assert.equal(migrated.schema_version, 5);
  assert.equal(migrated.type, "feature_brief");
  assert.equal(migrated.content_locale, "fr");
  assert.equal(migrated.migration.source_schema_version, 3);
  assert.equal(migrated.migration.source_sha256, createHash("sha256").update(sourceRaw, "utf8").digest("hex"));

  const repeated = await migrateLegacyFeatureContract({ featureRoot, frameworkRoot: ROOT, apply: true });
  assert.deepEqual({ changed: repeated.changed, applied: repeated.applied, documents: repeated.documents }, { changed: false, applied: false, documents: [] });
});

test("an ambiguous document blocks the whole Feature before backups or writes", async (context) => {
  const featureRoot = fixture(context);
  const sourcePath = resolve(featureRoot, "01-cadrage-essentiel.json");
  const sourceRaw = readFileSync(sourcePath, "utf8");
  const markerPath = resolve(featureRoot, ".arka-norn", "feature.json");
  const markerRaw = readFileSync(markerPath, "utf8");
  writeFileSync(resolve(featureRoot, "ambiguous.json"), '{"type":42,"schema_version":3}\n');

  await assert.rejects(
    migrateLegacyFeatureContract({ featureRoot, frameworkRoot: ROOT, apply: true }),
    /Ambiguous pipeline document format/,
  );
  assert.equal(readFileSync(sourcePath, "utf8"), sourceRaw);
  assert.equal(readFileSync(markerPath, "utf8"), markerRaw);
  assert.throws(() => readFileSync(`${sourcePath}.v3.bak`, "utf8"));
});

function fixture(context: { after(callback: () => void): void }): string {
  const featureRoot = mkdtempSync(join(tmpdir(), "arka-norn-legacy-feature-"));
  context.after(() => rmSync(featureRoot, { recursive: true, force: true }));
  cpSync(LEGACY_EXAMPLE, featureRoot, { recursive: true });
  mkdirSync(resolve(featureRoot, ".arka-norn"), { recursive: true });
  writeFileSync(resolve(featureRoot, ".arka-norn", "feature.json"), `${JSON.stringify({
    schemaVersion: 3,
    id: "filtre-features-etat",
    projectId: "project",
    name: "Feature filter",
    pipelineId: "arka-norn-essentiel",
    createdAt: "2026-08-23T08:00:00.000Z",
    updatedAt: "2026-08-23T08:00:00.000Z",
  }, null, 2)}\n`);
  return featureRoot;
}
