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
