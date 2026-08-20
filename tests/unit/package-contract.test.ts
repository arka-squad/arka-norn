import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

interface PackageJson {
  readonly scripts?: Readonly<Record<string, string>>;
}

const ROOT = resolve(import.meta.dirname, "..", "..");

test("package.json expose tous les quality gates L0", () => {
  const packageJson = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8")) as PackageJson;
  const scripts = packageJson.scripts ?? {};
  const required = ["build", "typecheck", "lint", "test", "test:unit", "test:integration", "test:e2e", "test:coverage", "test:coverage:cli", "selftest", "check", "release:verify"];

  assert.deepEqual(required.filter((name) => typeof scripts[name] !== "string"), []);
  assert.match(scripts["build"] ?? "", /clean-dist\.mjs.*tsc/);
  assert.match(scripts["test:coverage:cli"] ?? "", /adapters\/inbound\/cli/);
  assert.match(scripts["test:coverage:cli"] ?? "", /--lines 70.*--functions 70.*--branches 60/);
  assert.match(scripts["release:verify"] ?? "", /test:coverage:cli/);
});

test("la Definition of Done exige explicitement une recette QA pass", () => {
  const pipeline = readFileSync(resolve(ROOT, "pipeline.json"), "utf8");
  assert.match(pipeline, /statut_global vaut 'pass'/);
});
