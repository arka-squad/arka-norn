/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CAPABILITY_CATALOG, CAPABILITY_IDS, capabilityAvailableOn,
} from "../../src/application/capabilities/capability-registry.ts";
import {
  assertExpectedRevision, assertExpectedTimestamp, WebMutationError,
} from "../../src/application/web/web-mutation-concurrency.ts";

test("le registre de capacités couvre exactement le contrat public et reste honnête par surface", () => {
  assert.equal(CAPABILITY_CATALOG.schemaVersion, 1);
  assert.deepEqual(CAPABILITY_CATALOG.capabilities.map((capability) => capability.id), CAPABILITY_IDS);
  assert.equal(new Set(CAPABILITY_CATALOG.capabilities.map((capability) => capability.id)).size, 15);
  assert.equal(capabilityAvailableOn("framing.start", "web"), true);
  assert.equal(capabilityAvailableOn("doctor.inspect", "web"), true);
  assert.equal(capabilityAvailableOn("project.set_orchestration_mode", "web"), true);
  assert.equal(capabilityAvailableOn("agent.replace", "web"), false);
  assert.equal(capabilityAvailableOn("orchestration.authorize", "web"), false);
  for (const capability of CAPABILITY_CATALOG.capabilities) {
    assert.ok(capability.surfaces.length > 0);
    if (capability.authority !== "read") assert.ok(capability.invalidations.length > 0, capability.id);
  }
});

test("les attentes de concurrence refusent les requêtes invalides ou obsolètes", () => {
  const timestamp = "2026-08-27T00:00:00.000Z";
  assert.equal(assertExpectedTimestamp(timestamp, new Date(timestamp), "project_changed"), timestamp);
  assert.equal(assertExpectedRevision(4, 4, "agent_registry_changed"), 4);
  assert.throws(
    () => assertExpectedTimestamp("2026-08-26T23:59:59.000Z", timestamp, "project_changed"),
    (error: unknown) => error instanceof WebMutationError && error.status === 409 && error.code === "project_changed",
  );
  assert.throws(
    () => assertExpectedRevision(3, 4, "agent_registry_changed"),
    (error: unknown) => error instanceof WebMutationError && error.status === 409 && error.code === "agent_registry_changed",
  );
  assert.throws(() => assertExpectedTimestamp("not-a-date", timestamp, "project_changed"), /invalid_expected_timestamp/u);
  assert.throws(() => assertExpectedRevision(-1, 4, "agent_registry_changed"), /invalid_expected_revision/u);
});
