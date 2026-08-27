/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { createDoctorRepairCoordinator, DoctorRepairPlanChangedError } from "../../src/application/doctor/doctor-repair-coordinator.ts";
import type { DoctorReport, ForDoctor } from "../../src/ports/inbound/for-doctor.ts";

test("Doctor applique uniquement le dry-run exact puis relit la santé", async () => {
  let generation = 1;
  const calls: string[] = [];
  const doctor: ForDoctor = {
    run: async (input = {}) => {
      const mode = input.repair === true ? input.apply === true ? "repair-apply" : "repair-dry-run" : "inspect";
      calls.push(mode);
      const observedGeneration = generation;
      if (mode === "repair-apply") generation = 0;
      return report(mode, observedGeneration, mode === "repair-apply");
    },
  };
  const coordinator = createDoctorRepairCoordinator(doctor, { now: () => new Date("2026-08-27T10:00:00.000Z") });

  const plan = await coordinator.preview();
  assert.match(plan.fingerprint, /^[a-f0-9]{64}$/u);
  assert.equal(plan.expiresAt, "2026-08-27T10:05:00.000Z");
  const outcome = await coordinator.apply({ fingerprint: plan.fingerprint, confirmed: true });

  assert.equal(outcome.repair.mode, "repair-apply");
  assert.equal(outcome.repair.repairs[0]?.applied, true);
  assert.equal(outcome.report.mode, "inspect");
  assert.equal(outcome.report.summary.warn, 0);
  assert.deepEqual(calls, ["repair-dry-run", "repair-dry-run", "repair-apply", "inspect"]);
});

test("Doctor refuse une divergence, une expiration et une double soumission avec un plan renouvelé", async () => {
  let generation = 1;
  let now = new Date("2026-08-27T10:00:00.000Z");
  const doctor: ForDoctor = { run: async (input = {}) => report(input.repair === true ? input.apply === true ? "repair-apply" : "repair-dry-run" : "inspect", generation, false) };
  const coordinator = createDoctorRepairCoordinator(doctor, { now: () => now, ttlMs: 1_000 });

  const divergent = await coordinator.preview();
  generation = 2;
  await assert.rejects(
    coordinator.apply({ fingerprint: divergent.fingerprint, confirmed: true }),
    (error: unknown) => error instanceof DoctorRepairPlanChangedError && error.plan.fingerprint !== divergent.fingerprint,
  );

  const expiring = await coordinator.preview();
  now = new Date("2026-08-27T10:00:02.000Z");
  await assert.rejects(
    coordinator.apply({ fingerprint: expiring.fingerprint, confirmed: true }),
    (error: unknown) => error instanceof DoctorRepairPlanChangedError && error.plan.fingerprint === expiring.fingerprint && error.plan.expiresAt > expiring.expiresAt,
  );

  now = new Date("2026-08-27T10:00:02.100Z");
  const exact = await coordinator.preview();
  await coordinator.apply({ fingerprint: exact.fingerprint, confirmed: true });
  await assert.rejects(
    coordinator.apply({ fingerprint: exact.fingerprint, confirmed: true }),
    (error: unknown) => error instanceof DoctorRepairPlanChangedError,
  );
});

function report(mode: DoctorReport["mode"], generation: number, applied: boolean): DoctorReport {
  const repairable = generation > 0;
  const status = repairable ? "warn" as const : "pass" as const;
  return {
    schemaVersion: 1,
    ok: true,
    mode,
    checks: [{ id: "index.projects", status, message: `generation ${generation}`, repairable }],
    repairs: mode === "inspect" || !repairable ? [] : [{ target: "/home/index/projects.json", action: "chmod_0600", applied }],
    summary: { pass: repairable ? 0 : 1, warn: repairable ? 1 : 0, fail: 0 },
  };
}
