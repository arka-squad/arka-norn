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
import { test } from "node:test";

import { guidedNext } from "../../src/application/guided/guided-next.ts";
import type { PipelineReport, StepState } from "../../src/domain/pipeline/pipeline-report.ts";

const CONFIG = { commandName: "essentiel", deliveryStepId: "delivery", completionReason: "Terminé." } as const;

test("guidedNext calcule l'itération depuis l'étape de livraison configurée", () => {
  const report = pipelineReport([
    step("scope", 1, "completed", 1),
    step("delivery", 2, "completed", 2),
    step("audit", 3, "failed", 1),
  ], [{ kind: "return_to_development", stepId: "delivery", reason: "Corriger F-1", suggestedCommand: "arka-norn pipeline scaffold delivery --feature feature" }]);
  const next = guidedNext(report, "feature", "dev-feature", CONFIG);
  assert.equal(next.iteration, 3);
  assert.deepEqual(next.prerequisites, ["scope"]);
  assert.match(next.suggestedCommand ?? "", /--session dev-feature$/);
});

test("guidedNext rend une fin stable sans commande suggérée", () => {
  const next = guidedNext(pipelineReport([step("delivery", 1, "completed", 2)], []), "feature", "main", CONFIG);
  assert.deepEqual([next.phase, next.iteration, next.action, next.reason, next.suggestedCommand], ["Terminé", 2, null, "Terminé.", null]);
});

function pipelineReport(steps: readonly StepState[], nextActions: PipelineReport["nextActions"]): PipelineReport {
  return {
    schemaVersion: 1,
    pipelineId: "pipeline-test",
    featureRoot: "/tmp/feature",
    featureId: "feature",
    selectedDocuments: {},
    overallStatus: nextActions.length === 0 ? "completed" : "incomplete",
    steps,
    transversalDocuments: [],
    nextActions,
    errors: [],
    warnings: [],
    unknownFiles: [],
  };
}

function step(id: string, order: number, completionStatus: StepState["completionStatus"], documents: number): StepState {
  return {
    id,
    order,
    required: true,
    multiple: true,
    presenceStatus: documents === 0 ? "absent" : "present",
    schemaStatus: "valid",
    businessStatus: completionStatus === "completed" ? "passed" : "failed",
    dependencyStatus: "satisfied",
    completionStatus,
    documents: Array.from({ length: documents }, (_, index) => ({ id: `${id}-${index + 1}`, filePath: `/tmp/${id}-${index + 1}.json`, valid: true, errors: [], dependencyDocumentIds: [] })),
    nextActions: [],
  };
}
