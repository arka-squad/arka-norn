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

import { AgentSessionId, deriveAgentSessionId } from "../../src/domain/agent/agent-session-id.ts";

test("les identifiants de session sont lisibles, bornés et non ambigus", () => {
  assert.equal(AgentSessionId.MAIN.value, "main");
  assert.equal(deriveAgentSessionId("Développeur", "Navigation TUI").value, "developpeur-navigation-tui");
  assert.ok(deriveAgentSessionId("dev", "x".repeat(120)).value.length <= 64);
  assert.equal(deriveAgentSessionId("2026", "Audit").value, "agent-2026-audit");
  assert.throws(() => AgentSessionId.of("Main"));
  assert.throws(() => AgentSessionId.of("../audit"));
});
