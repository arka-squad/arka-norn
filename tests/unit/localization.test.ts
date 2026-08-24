/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { test } from "node:test";

import {
  activeLocale,
  assertCatalogParity,
  formatBytes,
  formatDate,
  formatDuration,
  formatNumber,
  parseLocalePreference,
  plural,
  resolveLocale,
  runWithLocale,
  translate,
} from "../../src/application/localization/locale.ts";
import { FsLocalePreferenceStore } from "../../src/adapters/outbound/filesystem/fs-locale-preference-store.ts";
import { extractGlobalOptions } from "../../src/adapters/inbound/cli/global-options.ts";
import { runLocaleCommand } from "../../src/adapters/inbound/cli/locale-cli.ts";
import { cliEnvelope } from "../../src/adapters/inbound/cli/cli-envelope.ts";

test("locale resolution follows override, environment, preference, system and fallback precedence", () => {
  assert.equal(resolveLocale({ override: "fr", environment: { ARKA_NORN_LOCALE: "en" }, preference: "en" }), "fr");
  assert.equal(resolveLocale({ environment: { ARKA_NORN_LOCALE: "fr" }, preference: "en" }), "fr");
  assert.equal(resolveLocale({ environment: {}, preference: "fr", systemLocale: "en-US" }), "fr");
  assert.equal(resolveLocale({ environment: { LANG: "fr_FR.UTF-8" }, preference: "auto" }), "fr");
  assert.equal(resolveLocale({ environment: {}, preference: "auto", systemLocale: "de-DE" }), "en");
  assert.throws(() => resolveLocale({ environment: { ARKA_NORN_LOCALE: "de" } }), /Expected en or fr/);
});

test("catalogs have identical keys and placeholders", () => {
  assert.doesNotThrow(assertCatalogParity);
  assert.equal(runWithLocale("fr", () => translate("common.locale.fr")), "Français");
  assert.equal(runWithLocale("en", () => activeLocale()), "en");
  assert.throws(() => translate("common.error", {}, "en"), /Missing translation parameter/);
  assert.equal(formatNumber(1234.5, "fr").replace(/\u202f/g, " "), "1 234,5");
  assert.match(formatDate(new Date("2026-01-15T12:00:00Z"), "en"), /Jan|15/);
  assert.match(formatDuration(90_000, "en"), /1\.5 min/);
  assert.match(formatBytes(1_536, "fr").replace(/\u202f/g, " "), /1,5/);
  assert.equal(plural(1, "step", "steps", "en"), "step");
  assert.equal(plural(2, "étape", "étapes", "fr"), "étapes");
});

test("locale preferences are parsed and persisted atomically", async (context) => {
  const home = mkdtempSync(resolve(tmpdir(), "arka-norn-locale-"));
  context.after(() => rmSync(home, { recursive: true, force: true }));
  const store = new FsLocalePreferenceStore(home);
  assert.equal(await store.load(), "auto");
  await store.save("fr");
  assert.equal(await store.load(), "fr");
  assert.deepEqual(JSON.parse(readFileSync(resolve(home, ".arka-norn", "preferences.json"), "utf8")), { schemaVersion: 2, locale: "fr" });
  const profile = await store.saveHumanProfile({ name: "Norn QA", email: "qa@example.test" });
  assert.match(profile.id, /^human_[a-f0-9]{24}$/);
  assert.equal((await store.loadPreferences()).humanProfile?.name, "Norn QA");
  const updated = await store.saveHumanProfile({ name: "Norn Reviewer" });
  assert.equal(updated.id, profile.id);
  assert.equal(parseLocalePreference(" EN "), "en");
  assert.throws(() => parseLocalePreference("de"), /Unsupported locale preference/);
});

test("global locale options are stripped once and the locale CLI emits schema v2", async (context) => {
  assert.deepEqual(extractGlobalOptions(["workflow", "list", "--locale", "fr", "--json"]), {
    argv: ["workflow", "list", "--json"], locale: "fr",
  });
  assert.throws(() => extractGlobalOptions(["--locale", "fr", "--locale=en"]), /only be provided once/);

  const home = mkdtempSync(resolve(tmpdir(), "arka-norn-locale-cli-"));
  context.after(() => rmSync(home, { recursive: true, force: true }));
  const set = await runWithLocale("fr", () => runLocaleCommand(["set", "fr", "--json"], { homeDir: home, environment: {} }));
  assert.equal(set.code, 0);
  const envelope = JSON.parse(set.stdout) as { readonly schemaVersion: number; readonly data: { readonly locale: string } };
  assert.equal(envelope.schemaVersion, 2);
  assert.equal(envelope.data.locale, "fr");
  const show = await runLocaleCommand(["show"], { homeDir: home, environment: {} });
  assert.match(show.stdout, /Langue d’affichage : fr/);
});

test("JSON envelopes keep machine data stable while display follows the locale", () => {
  const input = { command: "example", ok: false, data: { status: "blocked", at: "2026-08-23T12:00:00.000Z" }, errorCode: "example_blocked" } as const;
  const english = runWithLocale("en", () => cliEnvelope({ ...input, errors: ["Blocked by a missing proof."] }));
  const french = runWithLocale("fr", () => cliEnvelope({ ...input, errors: ["Bloqué par une preuve manquante."] }));
  assert.deepEqual(english.data, french.data);
  assert.deepEqual(english.errors, french.errors);
  assert.deepEqual(english.diagnostics, french.diagnostics);
  assert.notDeepEqual(english.display, french.display);
});
