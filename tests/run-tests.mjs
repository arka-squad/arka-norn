#!/usr/bin/env node

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

import { readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const TEST_ROOT = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(TEST_ROOT, "..");
const requestedSuite = process.argv[2];
const suites = requestedSuite ? [requestedSuite] : ["unit", "integration", "e2e"];

const files = requestedSuite === "cli-coverage"
  ? [...collectTests(join(TEST_ROOT, "unit")), ...collectTests(join(TEST_ROOT, "e2e")).filter((file) => file.endsWith("-cli.test.ts") || file.endsWith("/cli.test.ts"))]
  : suites.flatMap((suite) => collectTests(join(TEST_ROOT, suite)));
if (files.length === 0) {
  console.error(`Aucun test TypeScript trouvé pour : ${suites.join(", ")}`);
  process.exit(1);
}

const loaderRegistration = resolve(PROJECT_ROOT, "tests", "register-typescript-loader.mjs");
const result = spawnSync(process.execPath, ["--import", pathToFileURL(loaderRegistration).href, "--test", ...files], {
  cwd: PROJECT_ROOT,
  stdio: "inherit",
});
process.exitCode = result.status ?? 1;

function collectTests(directory) {
  const entries = readdirSync(directory, { withFileTypes: true });
  const out = [];
  for (const entry of entries) {
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) out.push(...collectTests(absolute));
    if (entry.isFile() && entry.name.endsWith(".test.ts")) out.push(absolute);
  }
  return out.sort();
}
