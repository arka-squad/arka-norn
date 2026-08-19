import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

interface QaDocument {
  statut_global: "pass" | "fail" | "partial";
  [key: string]: unknown;
}

const ROOT = resolve(import.meta.dirname, "..", "..");
const BIN = resolve(ROOT, "bin", "arka-norn.mjs");
const EXAMPLE = resolve(ROOT, "examples", "feature-notion-linear");

test("status refuse de déclarer complet l'exemple dont la QA échoue", () => {
  const result = runCli(["status", EXAMPLE]);
  assert.equal(result.status, 2, result.stderr);
  assert.doesNotMatch(result.stdout, /Pipeline complet/);
  assert.match(result.stdout, /État\s+: failed/);
  assert.match(result.stdout, /return_to_development -> cr_dev/);
});

test("status accepte un pipeline structurellement complet avec QA pass", (context) => {
  const sandbox = mkdtempSync(join(tmpdir(), "arka-norn-status-pass-"));
  context.after(() => rmSync(sandbox, { recursive: true, force: true }));
  cpSync(EXAMPLE, sandbox, { recursive: true });

  const qaPath = resolve(sandbox, "10-recette-qa.json");
  const qa = JSON.parse(readFileSync(qaPath, "utf8")) as QaDocument;
  qa.statut_global = "pass";
  writeFileSync(qaPath, `${JSON.stringify(qa, null, 2)}\n`, "utf8");

  const result = runCli(["status", sandbox]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Pipeline complet/);
});

test("status signale une première action absente avec le code 2", (context) => {
  const sandbox = mkdtempSync(join(tmpdir(), "arka-norn-status-empty-"));
  context.after(() => rmSync(sandbox, { recursive: true, force: true }));

  const result = runCli(["status", sandbox]);
  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stdout, /create_document -> concept/);
});

test("status signale un document invalide avec le code 3", (context) => {
  const sandbox = mkdtempSync(join(tmpdir(), "arka-norn-status-invalid-"));
  context.after(() => rmSync(sandbox, { recursive: true, force: true }));
  writeFileSync(resolve(sandbox, "concept.json"), '{"type":"concept"}\n', "utf8");

  const result = runCli(["status", sandbox]);
  assert.equal(result.status, 3, result.stderr);
  assert.match(result.stdout, /concept.*schema=invalid/);
});

test("status --json respecte l'enveloppe stable sans log parasite", () => {
  const result = runCli(["status", "--json", EXAMPLE]);
  assert.equal(result.status, 2, result.stderr);
  const envelope = JSON.parse(result.stdout) as {
    readonly schemaVersion: number;
    readonly ok: boolean;
    readonly data: { readonly overallStatus: string; readonly latestCrDevId?: string; readonly steps: readonly unknown[] };
    readonly errors: readonly unknown[];
    readonly warnings: readonly unknown[];
  };
  assert.deepEqual(Object.keys(envelope), ["schemaVersion", "ok", "data", "errors", "warnings"]);
  assert.equal(envelope.schemaVersion, 1);
  assert.equal(envelope.ok, false);
  assert.equal(envelope.data.overallStatus, "failed");
  assert.equal(envelope.data.steps.length, 10);
});

test("scaffold refuse l'écrasement sans --force", (context) => {
  const sandbox = mkdtempSync(join(tmpdir(), "arka-norn-scaffold-safe-"));
  context.after(() => rmSync(sandbox, { recursive: true, force: true }));
  const output = resolve(sandbox, "concept.json");
  const created = runCli(["scaffold", "concept", output]);
  assert.equal(created.status, 0, created.stderr);
  const original = readFileSync(output, "utf8");

  const conflict = runCli(["scaffold", "concept", output]);
  assert.equal(conflict.status, 5);
  assert.match(conflict.stderr, /--force/);
  assert.equal(readFileSync(output, "utf8"), original);

  const forced = runCli(["scaffold", "--force", "concept", output]);
  assert.equal(forced.status, 0, forced.stderr);
});

test("validate --json sépare conformité et sentinelles", (context) => {
  const sandbox = mkdtempSync(join(tmpdir(), "arka-norn-validate-json-"));
  context.after(() => rmSync(sandbox, { recursive: true, force: true }));
  const output = resolve(sandbox, "concept.json");
  assert.equal(runCli(["scaffold", "concept", output]).status, 0);
  const invalid = runCli(["validate", "--json", output]);
  assert.equal(invalid.status, 3);
  const envelope = JSON.parse(invalid.stdout) as { readonly schemaVersion: number; readonly ok: boolean; readonly errors: readonly string[] };
  assert.equal(envelope.schemaVersion, 1);
  assert.equal(envelope.ok, false);
  assert.ok(envelope.errors.some((error) => error.includes("sentinel")));

  const valid = runCli(["validate", resolve(EXAMPLE, "01-concept.json")]);
  assert.equal(valid.status, 0, valid.stderr);
  assert.match(valid.stdout, /VALIDE/);
});

test("la TUI refuse un environnement non interactif sans écrire sur stdout", () => {
  const result = runCli([]);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /nécessite un terminal interactif/);
});

test("doctor respecte ARKA_NORN_HOME et refuse toute option inconnue", (context) => {
  const sandbox = mkdtempSync(join(tmpdir(), "arka-norn-doctor-cli-"));
  context.after(() => rmSync(sandbox, { recursive: true, force: true }));
  const operatingSystemHome = resolve(sandbox, "os-home");
  const configuredHome = resolve(sandbox, "configured-home");
  mkdirSync(resolve(operatingSystemHome, ".arka-norn", "index"), { recursive: true });
  mkdirSync(resolve(configuredHome, ".arka-norn", "index"), { recursive: true });
  writeFileSync(resolve(operatingSystemHome, ".arka-norn", "index", "projects.json"), '{"schemaVersion":2,"entries":[]}\n', { mode: 0o600 });
  writeFileSync(resolve(configuredHome, ".arka-norn", "index", "projects.json"), '{"schemaVersion":2,"entries":[{}]}\n', { mode: 0o600 });

  const configured = spawnSync(process.execPath, [BIN, "doctor", "--json"], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, HOME: operatingSystemHome, ARKA_NORN_HOME: configuredHome },
  });
  assert.equal(configured.status, 3);
  assert.match(configured.stdout, /schema invalid/);

  const unknown = spawnSync(process.execPath, [BIN, "doctor", "--bogus", "--json"], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, HOME: operatingSystemHome, ARKA_NORN_HOME: configuredHome },
  });
  assert.equal(unknown.status, 64);
  assert.match(unknown.stdout, /unknown option/);
});

test("toutes les commandes scriptées refusent les options inconnues", () => {
  const commands = [
    ["status", EXAMPLE, "--bogus"],
    ["scaffold", "concept", resolve(ROOT, ".input", "unused.json"), "--bogus"],
    ["validate", resolve(EXAMPLE, "01-concept.json"), "--bogus"],
    ["pipeline", "status", EXAMPLE, "--bogus"],
    ["skills", "list", "--bogus"],
    ["migrate", "--bogus"],
    ["install", "--bogus"],
  ];
  for (const args of commands) {
    const result = runCli(args);
    assert.equal(result.status, 64, `${args.join(" ")}\n${result.stdout}\n${result.stderr}`);
  }
});

function runCli(args: readonly string[]) {
  return spawnSync(process.execPath, [BIN, ...args], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, ARKA_NORN_HOME: join(tmpdir(), "arka-norn-e2e-home") },
  });
}
