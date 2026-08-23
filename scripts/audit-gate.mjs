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

import { spawnSync } from "node:child_process";

const ALLOWED_ADVISORIES = new Set([
  // provider AI in-process (les workers sont des processus ACP externes),
  "https://github.com/advisories/GHSA-866g-f22w-33x8",
]);

const args = process.argv.slice(2);
const omitDev = args.includes("--omit=dev");

const audit = spawnSync("npm", ["audit", "--json", ...(omitDev ? ["--omit=dev"] : [])], {
  encoding: "utf8",
  shell: process.platform === "win32",
});
if (audit.status !== 0 && audit.stdout.trim() === "") {
  process.stdout.write(audit.stderr);
  process.exit(1);
}

let report;
try {
  report = JSON.parse(audit.stdout);
} catch {
  process.stdout.write(audit.stdout || audit.stderr);
  process.exit(1);
}

const vulnerabilities = report.vulnerabilities ?? {};
const failures = [];
const exempted = [];

for (const [name, vulnerability] of Object.entries(vulnerabilities)) {
  const leaves = collectAdvisoryLeaves(name, vulnerabilities, new Set());
  if (leaves.some((url) => !ALLOWED_ADVISORIES.has(url))) {
    failures.push({ name, severity: vulnerability.severity, leaves });
  } else if (leaves.length > 0) {
    exempted.push({ name, severity: vulnerability.severity, leaves });
  }
}

if (exempted.length > 0) {
  console.log("Exempted advisories (documented allowlist):");
  for (const entry of exempted) {
    console.log(`  - ${entry.name} (${entry.severity}) : ${entry.leaves.join(", ")}`);
  }
}

if (failures.length > 0) {
  console.error("Unexempted vulnerabilities must be fixed before release:");
  for (const entry of failures) {
    console.error(`  - ${entry.name} (${entry.severity}) : ${entry.leaves.join(", ")}`);
  }
  process.exit(1);
}

  console.log(`${omitDev ? "Production " : ""}audit passed: no unexempted vulnerabilities.`);

function collectAdvisoryLeaves(name, vulnerabilities, visited) {
  if (visited.has(name)) return [];
  visited.add(name);
  const entry = vulnerabilities[name];
  if (entry === undefined) return ["(dependance inconnue)"];
  const leaves = [];
  for (const via of entry.via ?? []) {
    if (typeof via === "string") {
      leaves.push(...collectAdvisoryLeaves(via, vulnerabilities, visited));
    } else {
    leaves.push(via.url ?? via.title ?? "(advisory without URL)");
    }
  }
  return leaves;
}
