#!/usr/bin/env node

/* Copyright 2026 Arka Labs - Licensed under the Apache License, Version 2.0. */

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createPipelineRuntime } from "../dist/composition/pipeline-runtime.js";

const FRAMEWORK_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BIN = path.join(FRAMEWORK_ROOT, "bin", "arka-norn.mjs");
const TSC_BIN = path.join(FRAMEWORK_ROOT, "node_modules", "typescript", "bin", "tsc");
const TEST_RUNNER = path.join(FRAMEWORK_ROOT, "tests", "run-tests.mjs");
const SELFTEST_ENVIRONMENT = { ...process.env };
delete SELFTEST_ENVIRONMENT.npm_execpath;

const EXAMPLES = {
  "arka-norn-complete": {
    directory: "feature-complete",
    files: ["01-concept.json", "02-plan.json", "03-technical-contract-appendix.json", "04-current-state-audit.json", "05-frozen-invariants.json", "06-debt-register.json", "07-agent-task.json", "08-technical-integration-specification.json", "09-development-report.json", "10-qa-review.json", "11-handoff.json"],
  },
  "arka-norn-essential": {
    directory: "feature-essential",
    files: ["01-feature-brief.json", "02-development-report.json", "03-delivery-audit.json", "04-development-report.json", "05-delivery-validation.json"],
  },
  "arka-norn-fastdev": {
    directory: "feature-fastdev",
    files: ["01-rework-brief.json", "02-development-report.json", "03-delivery-audit.json", "04-development-report.json", "05-delivery-validation.json"],
  },
};

export async function runSelftest() {
  let checks = 0;
  let failures = 0;
  const check = (label, condition, detail = "") => {
    checks += 1;
    if (condition) console.log(`  OK   ${label}`);
    else {
      failures += 1;
      console.log(`  FAIL ${label}${detail ? ` - ${detail}` : ""}`);
    }
  };

  const sandbox = mkdtempSync(path.join(tmpdir(), "arka-norn-selftest-"));
  const pipeline = createPipelineRuntime(FRAMEWORK_ROOT, { homeDir: path.join(sandbox, "home") });
  try {
    const workflows = await pipeline.listWorkflows();
    check("catalog contains Complete, Essential and FastDev", workflows.length === 3 && workflows.every((workflow) => workflow.id in EXAMPLES));
    check("Essential is the default workflow", await pipeline.defaultWorkflowId() === "arka-norn-essential");

    console.log("\n=== Canonical v5 scaffolds ===");
    for (const workflow of workflows) {
      for (const step of await pipeline.listSteps(workflow.id, 5)) {
        const outputPath = path.join(sandbox, `${workflow.id}-${step.id}.json`);
        await pipeline.scaffold({ stepId: step.id, outputPath, authorAgentId: "Selftest_validation_20260819", pipelineId: workflow.id, documentContractVersion: 5 });
        const result = await pipeline.validate({ filePath: outputPath, pipelineId: workflow.id, documentContractVersion: 5 });
        const structuralErrors = result.errors.filter((error) => /required property|additional propert/i.test(error));
        check(`${workflow.id}/${step.id} scaffold has only unresolved sentinels`, !result.valid && structuralErrors.length === 0, JSON.stringify(result.errors));
      }
    }

    console.log("\n=== Distributed examples ===");
    for (const workflow of workflows) {
      const example = EXAMPLES[workflow.id];
      for (const file of example.files) {
        const result = await pipeline.validate({ filePath: path.join(FRAMEWORK_ROOT, "examples", example.directory, file), pipelineId: workflow.id, documentContractVersion: 5 });
        check(`${workflow.id}/${file} validates`, result.valid, JSON.stringify(result.errors));
      }
    }

    console.log("\n=== Contract breakage ===");
    const brief = loadJson(path.join(FRAMEWORK_ROOT, "examples", "feature-essential", "01-feature-brief.json"));
    delete brief.objective;
    const invalidBrief = path.join(sandbox, "invalid-feature-brief.json");
    writeFileSync(invalidBrief, `${JSON.stringify(brief)}\n`);
    const briefResult = await pipeline.validate({ filePath: invalidBrief, pipelineId: "essential", documentContractVersion: 5 });
    check("missing Essential objective is rejected explicitly", !briefResult.valid && briefResult.errors.some((error) => error.includes("objective")), JSON.stringify(briefResult.errors));

    const report = loadJson(path.join(FRAMEWORK_ROOT, "examples", "feature-complete", "09-development-report.json"));
    report.delivered_files[0].action = "invented_value";
    const invalidReport = path.join(sandbox, "invalid-development-report.json");
    writeFileSync(invalidReport, `${JSON.stringify(report)}\n`);
    const reportResult = await pipeline.validate({ filePath: invalidReport, pipelineId: "complete", documentContractVersion: 5 });
    check("invented enum values are rejected", !reportResult.valid, JSON.stringify(reportResult.errors));

    console.log("\n=== Locale and packaging contracts ===");
    const locale = spawnSync(process.execPath, [BIN, "locale", "show", "--locale", "fr", "--json"], {
      cwd: FRAMEWORK_ROOT,
      encoding: "utf8",
      env: { ...process.env, ARKA_NORN_HOME: path.join(sandbox, "locale-home") },
    });
    const localeEnvelope = locale.status === 0 ? JSON.parse(locale.stdout) : undefined;
    check("public JSON uses schemaVersion 2", localeEnvelope?.schemaVersion === 2, locale.stdout || locale.stderr);
    check("requested French locale is active", localeEnvelope?.data?.locale === "fr", locale.stdout || locale.stderr);

    const catalog = loadJson(path.join(FRAMEWORK_ROOT, "skills-src", "catalog", "skills.json"));
    const definitions = readdirSync(path.join(FRAMEWORK_ROOT, "skills-src")).filter((file) => file.endsWith(".json"));
    check("skill catalog contains 21 unique definitions", catalog.skills.length === 21 && new Set(catalog.skills.map((skill) => skill.name)).size === 21);
    check("skill catalog covers every source definition", catalog.skills.length === definitions.length);
    check("skill checksums are exact", catalog.skills.every((skill) => {
      const source = readFileSync(path.join(FRAMEWORK_ROOT, "skills-src", skill.source), "utf8").replace(/\r\n?/gu, "\n");
      return createHash("sha256").update(source, "utf8").digest("hex") === skill.checksum;
    }));

    const tui = spawnSync(process.execPath, [BIN], { cwd: FRAMEWORK_ROOT, encoding: "utf8" });
    check("non-interactive TUI exits with code 1", tui.status === 1, `${tui.stdout}${tui.stderr}`);
    check("non-interactive TUI writes only to stderr", tui.stdout === "" && tui.stderr.includes("requires an interactive terminal"), `${tui.stdout}${tui.stderr}`);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }

  console.log("\n=== Development checkout gates ===");
  if (existsSync(TSC_BIN) && existsSync(TEST_RUNNER) && existsSync(path.join(FRAMEWORK_ROOT, "src"))) {
    runGate("source typecheck", [TSC_BIN, "--noEmit"], check);
    runGate("test typecheck", [TSC_BIN, "-p", path.join(FRAMEWORK_ROOT, "tsconfig.tests.json")], check);
    runGate("TypeScript tests", [TEST_RUNNER], check, { env: SELFTEST_ENVIRONMENT });
  } else {
    check("production package excludes TypeScript sources", !existsSync(path.join(FRAMEWORK_ROOT, "src")));
    check("production package excludes internal tests", !existsSync(TEST_RUNNER));
  }

  console.log(`\n${checks - failures}/${checks} checks passed.`);
  if (failures > 0) {
    console.log(`${failures} FAILURE(S) - fix before use.`);
    process.exitCode = 1;
  } else {
    console.log("All real checks pass.");
    process.exitCode = 0;
  }
}

function runGate(label, args, check, options = {}) {
  const result = spawnSync(process.execPath, args, { cwd: FRAMEWORK_ROOT, encoding: "utf8", ...options });
  check(label, result.status === 0, [result.stdout, result.stderr].filter(Boolean).join("\n") || `process exited with ${String(result.status)}`);
}

function loadJson(file) {
  if (!existsSync(file)) throw new Error(`File not found: ${file}`);
  return JSON.parse(readFileSync(file, "utf8"));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await runSelftest();
