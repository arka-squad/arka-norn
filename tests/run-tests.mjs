#!/usr/bin/env node
import { readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const TEST_ROOT = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(TEST_ROOT, "..");
const requestedSuite = process.argv[2];
const suites = requestedSuite ? [requestedSuite] : ["unit", "integration", "e2e"];

const files = suites.flatMap((suite) => collectTests(join(TEST_ROOT, suite)));
if (files.length === 0) {
  console.error(`Aucun test TypeScript trouvé pour : ${suites.join(", ")}`);
  process.exit(1);
}

const loaderRegistration = resolve(PROJECT_ROOT, "tests", "register-typescript-loader.mjs");
const result = spawnSync(process.execPath, ["--experimental-strip-types", "--import", loaderRegistration, "--test", ...files], {
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
