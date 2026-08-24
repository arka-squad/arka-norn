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
  const required = [
    "build", "typecheck", "lint", "test", "test:unit", "test:integration", "test:e2e", "test:coverage", "test:coverage:cli",
    "web:start", "web:status", "web:restart", "web:stop", "selftest", "check", "release:verify",
  ];

  assert.deepEqual(required.filter((name) => typeof scripts[name] !== "string"), []);
  assert.match(scripts["build"] ?? "", /clean-dist\.mjs.*tsc/);
  assert.match(scripts["test:coverage:cli"] ?? "", /adapters\/inbound\/cli/);
  assert.match(scripts["test:coverage:cli"] ?? "", /--lines 70.*--functions 70.*--branches 60/);
  assert.match(scripts["release:verify"] ?? "", /test:coverage:cli/);
  assert.match(scripts["web:start"] ?? "", /web start/);
  assert.match(scripts["web:stop"] ?? "", /web stop/);
});

test("the Complete definition of done requires a passing QA review", () => {
  const pipeline = readFileSync(resolve(ROOT, "pipeline.json"), "utf8");
  assert.match(pipeline, /"id": "qa_review"/);
  assert.match(pipeline, /"passValues": \[\s*"pass"/);
});
