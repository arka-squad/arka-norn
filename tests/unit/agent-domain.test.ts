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

import { AgentRegistration } from "../../src/domain/agent/agent.ts";
import { AgentId, createReadableAgentId } from "../../src/domain/agent/agent-id.ts";
import { FeatureId } from "../../src/domain/feature/feature-id.ts";
import { ProjectId } from "../../src/domain/project/project-id.ts";

test("un identifiant agent reste humain et gère les collisions du jour", () => {
  const at = new Date("2026-08-19T12:00:00.000Z");
  const first = createReadableAgentId("Codex CLI", "Lead Dev", at, new Set());
  assert.equal(first.value, "Codex-CLI_lead-dev_20260819");
  const second = createReadableAgentId("Codex CLI", "Lead Dev", at, new Set([first.value]));
  assert.equal(second.value, "Codex-CLI_lead-dev_20260819_02");
  assert.throws(() => AgentId.of("opaque-uuid"), /Provider_role_YYYYMMDD/);
});

test("le domaine impose scope sûr et remplacement cohérent", () => {
  const at = new Date("2026-08-19T12:00:00.000Z");
  const projectId = ProjectId.of("arka-norn");
  const agent = AgentRegistration.create({
    id: AgentId.of("Codex_dev_20260819"), provider: "Codex", role: "dev", active: true,
    scope: { projectId, featureIds: [FeatureId.of("agent-registry")], paths: ["src/domain/agent"], responsibilities: ["Implémentation"] },
    registeredAt: at, updatedAt: at,
  });
  const replacementId = AgentId.of("Claude_dev_20260819");
  const inactive = agent.deactivate(new Date("2026-08-19T13:00:00.000Z"), replacementId);
  assert.equal(inactive.active, false);
  assert.equal(inactive.replacedByAgentId?.value, replacementId.value);
  assert.equal(agent.coversFeature(FeatureId.of("agent-registry")), true);
  assert.equal(agent.coversFeature(FeatureId.of("other-feature")), false);
  assert.equal(agent.coversProjectPath("src/domain/agent/agent.ts"), true);
  assert.equal(agent.coversProjectPath("docs/agent-registry.md"), false);
  assert.throws(() => AgentRegistration.create({
    id: AgentId.of("Codex_qa_20260819"), provider: "Codex", role: "qa", active: true,
    scope: { projectId, featureIds: [], paths: ["../outside"], responsibilities: [] },
    registeredAt: at, updatedAt: at,
  }), /safe project-relative paths/);
});
