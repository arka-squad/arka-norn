/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { bootId, compareSemVer, evaluateVersionAdvisory, parseSemVer } from "../../src/application/version/version-advisory.ts";

test("parseSemVer accepte les versions valides et rejette le reste", () => {
  assert.deepEqual(parseSemVer("2.3.4"), { major: 2, minor: 3, patch: 4 });
  assert.deepEqual(parseSemVer("v10.0.1"), { major: 10, minor: 0, patch: 1 });
  assert.deepEqual(parseSemVer("2.3.4-beta.1"), { major: 2, minor: 3, patch: 4 });
  assert.equal(parseSemVer("2.3"), undefined);
  assert.equal(parseSemVer("latest"), undefined);
});

test("compareSemVer ordonne major, minor puis patch", () => {
  assert.equal(compareSemVer({ major: 2, minor: 3, patch: 4 }, { major: 2, minor: 3, patch: 4 }), 0);
  assert.equal(compareSemVer({ major: 2, minor: 3, patch: 3 }, { major: 2, minor: 3, patch: 4 }), -1);
  assert.equal(compareSemVer({ major: 2, minor: 4, patch: 0 }, { major: 2, minor: 3, patch: 9 }), 1);
  assert.equal(compareSemVer({ major: 3, minor: 0, patch: 0 }, { major: 2, minor: 9, patch: 9 }), 1);
});

test("bootId reste stable pour un même démarrage et change au reboot", () => {
  const first = bootId(1_000_000_000_000, 3_600);
  const later = bootId(1_000_000_030_000, 3_630);
  assert.equal(first, later);
  const rebooted = bootId(1_000_000_030_000, 10);
  assert.notEqual(first, rebooted);
});

test("evaluateVersionAdvisory couvre à jour, inconnu et mise à jour disponible", () => {
  assert.equal(evaluateVersionAdvisory({ current: "2.3.4", latest: "2.3.4", currentBootId: "b" }).status, "up_to_date");
  assert.equal(evaluateVersionAdvisory({ current: "2.3.4", latest: "2.3.3", currentBootId: "b" }).status, "up_to_date");
  assert.equal(evaluateVersionAdvisory({ current: "2.3.4", currentBootId: "b" }).status, "unknown");
  assert.equal(evaluateVersionAdvisory({ current: "2.3.4", latest: "not-a-version", currentBootId: "b" }).status, "unknown");
  const update = evaluateVersionAdvisory({ current: "2.3.4", latest: "2.4.0", currentBootId: "b" });
  assert.equal(update.status, "update_available");
  assert.equal(update.status === "update_available" ? update.latest : "", "2.4.0");
});

test("le skip par version masque jusqu'à une version plus récente", () => {
  const skipped = evaluateVersionAdvisory({ current: "2.3.4", latest: "2.4.0", skip: { kind: "version", version: "2.4.0" }, currentBootId: "b" });
  assert.equal(skipped.status, "skipped_version");
  const newer = evaluateVersionAdvisory({ current: "2.3.4", latest: "2.5.0", skip: { kind: "version", version: "2.4.0" }, currentBootId: "b" });
  assert.equal(newer.status, "update_available");
});

test("le skip par reboot ne tient que pour le même bootId", () => {
  const same = evaluateVersionAdvisory({ current: "2.3.4", latest: "2.4.0", skip: { kind: "reboot", version: "2.4.0", bootId: "boot-1" }, currentBootId: "boot-1" });
  assert.equal(same.status, "skipped_reboot");
  const afterReboot = evaluateVersionAdvisory({ current: "2.3.4", latest: "2.4.0", skip: { kind: "reboot", version: "2.4.0", bootId: "boot-1" }, currentBootId: "boot-2" });
  assert.equal(afterReboot.status, "update_available");
});

