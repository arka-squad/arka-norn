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

import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

import { createPipelineRuntime } from "../../src/composition/pipeline-runtime.ts";

const ROOT = resolve(import.meta.dirname, "..", "..");
const EXAMPLE = resolve(ROOT, "examples", "feature-notion-linear");
const FASTDEV_EXAMPLE = resolve(ROOT, "examples", "feature-fastdev");
const ESSENTIEL_EXAMPLE = resolve(ROOT, "examples", "feature-essentiel");
const LINEAR_AUTHORS = [{ id: "Codex_dev_20260819", active: true, authorized: true }];
const FASTDEV_AUTHORS = [
  { id: "Codex_dev_20260820", active: true, authorized: true },
  { id: "Codex_audit_20260820", active: true, authorized: true },
  { id: "Codex_qa_20260820", active: true, authorized: true },
];
const ESSENTIEL_AUTHORS = [
  { id: "Codex_dev_20260823", active: true, authorized: true },
  { id: "Codex_audit_20260823", active: true, authorized: true },
  { id: "Codex_qa_20260823", active: true, authorized: true },
];

test("l'exemple Essentiel ferme un audit bloquant et valide uniquement le CR correctif", async () => {
  const report = await createPipelineRuntime(ROOT).inspect({
    featureRoot: ESSENTIEL_EXAMPLE,
    featureId: "filtre-features-etat",
    pipelineId: "essentiel",
    authorRegistry: ESSENTIEL_AUTHORS,
  });
  assert.equal(report.overallStatus, "completed", report.errors.join("\n"));
  assert.equal(report.latestCrDevId, "cr-filtre-etats-2");
  assert.equal(report.selectedDocuments.audit_livraison, "audit-filtre-etats-1");
  assert.equal(report.selectedDocuments.validation_livraison, "validation-filtre-etats-1");
});

test("l'exemple FastDev ferme l'audit par un CR correctif puis valide le dernier CR", async () => {
  const report = await createPipelineRuntime(ROOT).inspect({
    featureRoot: FASTDEV_EXAMPLE, featureId: "rework-navigation", pipelineId: "fastdev", authorRegistry: FASTDEV_AUTHORS,
  });
  assert.equal(report.pipelineId, "arka-norn-fastdev");
  assert.equal(report.overallStatus, "completed", report.errors.join("\n"));
  assert.equal(report.latestCrDevId, "cr-navigation-2");
  assert.equal(report.selectedAuditId, "audit-navigation-1");
  assert.equal(report.selectedValidationId, "validation-navigation-1");
  assert.equal(report.steps.find((step) => step.id === "audit_rework")?.businessStatus, "passed");
});

test("l'inspection réelle sépare les 6 dimensions des 10 étapes", async () => {
  const report = await createPipelineRuntime(ROOT).inspect({
    featureRoot: EXAMPLE, featureId: "connecteurs-notion-linear", authorRegistry: LINEAR_AUTHORS,
    pipelineId: "standard",
  });
  assert.equal(report.steps.length, 10);
  assert.equal(report.overallStatus, "failed");
  assert.equal(report.latestCrDevId, "cr-dev-cortex-lot5-connecteurs-20260701-01");
  assert.equal(report.selectedQaId, "rec-cortex-ingestion-t23-20260701-01");
  const qa = report.steps.find((step) => step.id === "recette_qa");
  assert.deepEqual(
    qa === undefined ? undefined : [qa.presenceStatus, qa.schemaStatus, qa.businessStatus, qa.dependencyStatus, qa.completionStatus, qa.nextActions[0]?.kind],
    ["present", "valid", "failed", "satisfied", "failed", "return_to_development"],
  );
});

test("un nouveau CR rend une ancienne QA pass obsolète jusqu'à la nouvelle recette", async (context) => {
  const sandbox = copyExample(context);
  updateJson(resolve(sandbox, "10-recette-qa.json"), (qa) => ({ ...qa, statut_global: "pass" }));
  const runtime = createPipelineRuntime(ROOT);
  assert.equal((await runtime.inspect({ featureRoot: sandbox, pipelineId: "standard" })).overallStatus, "completed");

  const cr1 = json(resolve(sandbox, "09-cr-dev.json"));
  writeFileSync(resolve(sandbox, "09-cr-dev-02.json"), `${JSON.stringify({
    ...cr1,
    id: "cr-dev-cortex-lot5-connecteurs-20260701-02",
    ref: "CR-DEV-CORTEX-lot5_connecteurs-20260701-02",
    sequence: 2,
    created_at: "2026-07-01T18:00:00.000Z"
  }, null, 2)}\n`, "utf8");

  const stale = await runtime.inspect({ featureRoot: sandbox, pipelineId: "standard" });
  assert.equal(stale.overallStatus, "incomplete");
  assert.equal(stale.latestCrDevId, "cr-dev-cortex-lot5-connecteurs-20260701-02");
  assert.equal(stale.nextActions[0]?.kind, "run_qa");

  const qa1 = json(resolve(sandbox, "10-recette-qa.json"));
  writeFileSync(resolve(sandbox, "10-recette-qa-02.json"), `${JSON.stringify({
    ...qa1,
    id: "rec-cortex-ingestion-t23-20260701-02",
    ref: "REC-CORTEX-ingestion_t23-20260701-02",
    sequence: 2,
    created_at: "2026-07-01T19:00:00.000Z",
    cr_dev_id: "cr-dev-cortex-lot5-connecteurs-20260701-02",
    depends_on_document_ids: ["cr-dev-cortex-lot5-connecteurs-20260701-02"]
  }, null, 2)}\n`, "utf8");
  const current = await runtime.inspect({ featureRoot: sandbox, pipelineId: "standard" });
  assert.equal(current.overallStatus, "completed");
  assert.equal(current.selectedQaId, "rec-cortex-ingestion-t23-20260701-02");
});

test("les handoffs sont validés et exposés comme documents transversaux", async (context) => {
  const sandbox = copyExample(context);
  const runtime = createPipelineRuntime(ROOT);
  const valid = await runtime.inspect({ featureRoot: sandbox, featureId: "connecteurs-notion-linear", authorRegistry: LINEAR_AUTHORS });
  const handoffs = valid.transversalDocuments.find((state) => state.type === "handoff");
  assert.equal(handoffs?.documents.length, 1);
  assert.equal(handoffs?.documents[0]?.valid, true);

  writeFileSync(resolve(sandbox, "11-handoff.json"), '{"type":"handoff"}\n', "utf8");
  const invalid = await runtime.inspect({ featureRoot: sandbox, featureId: "connecteurs-notion-linear", authorRegistry: LINEAR_AUTHORS });
  assert.equal(invalid.overallStatus, "invalid");
  assert.equal(invalid.transversalDocuments[0]?.documents[0]?.valid, false);
  assert.ok(invalid.errors.some((error) => error.includes("11-handoff.json")));
});

test("JSON malformé invalide le rapport et type inconnu reste visible", async (context) => {
  const sandbox = copyExample(context);
  writeFileSync(resolve(sandbox, "broken.json"), "{", "utf8");
  writeFileSync(resolve(sandbox, "unknown.json"), '{"id":"unknown-1","type":"unknown_type"}\n', "utf8");
  const report = await createPipelineRuntime(ROOT).inspect({ featureRoot: sandbox, pipelineId: "standard" });
  assert.equal(report.overallStatus, "invalid");
  assert.equal(report.errors.length, 1);
  assert.deepEqual(report.unknownFiles, [realpathSync.native(resolve(sandbox, "unknown.json"))]);
});

function copyExample(context: { after(callback: () => void): void }): string {
  const sandbox = mkdtempSync(join(tmpdir(), "arka-norn-pipeline-"));
  context.after(() => rmSync(sandbox, { recursive: true, force: true }));
  cpSync(EXAMPLE, sandbox, { recursive: true });
  return sandbox;
}

function json(path: string): Readonly<Record<string, unknown>> {
  return JSON.parse(readFileSync(path, "utf8")) as Readonly<Record<string, unknown>>;
}

function updateJson(path: string, update: (value: Readonly<Record<string, unknown>>) => Readonly<Record<string, unknown>>): void {
  writeFileSync(path, `${JSON.stringify(update(json(path)), null, 2)}\n`, "utf8");
}
