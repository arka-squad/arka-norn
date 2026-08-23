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

import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

import { runAgentCommand } from "../../src/adapters/inbound/cli/agent-cli.ts";
import { runAuditCommand } from "../../src/adapters/inbound/cli/audit-cli.ts";
import type { CliExecution } from "../../src/adapters/inbound/cli/cli-execution.ts";
import { runDoctorCommand } from "../../src/adapters/inbound/cli/doctor-cli.ts";
import { runFastDevCommand } from "../../src/adapters/inbound/cli/fastdev-cli.ts";
import { CLI_HELP } from "../../src/adapters/inbound/cli/main-cli.ts";
import { runManagementCommand } from "../../src/adapters/inbound/cli/management-cli.ts";
import { findMarkers, runMigrateCommand } from "../../src/adapters/inbound/cli/migrate-cli.ts";
import { runPipelineCommand, runScaffoldCommand, runStatusCommand, runValidateCommand } from "../../src/adapters/inbound/cli/pipeline-cli.ts";
import { runSkillsCommand } from "../../src/adapters/inbound/cli/skills-cli.ts";
import { CliUsageError, parseStrictArguments } from "../../src/adapters/inbound/cli/strict-arguments.ts";
import { runWorkflowCommand } from "../../src/adapters/inbound/cli/workflow-cli.ts";
import { AgentSessionId } from "../../src/domain/agent/agent-session-id.ts";

const ROOT = resolve(import.meta.dirname, "..", "..");
const AUTHOR = "Codex_product_20260820";

interface Fixture {
  readonly sandbox: string;
  readonly cwd: string;
  readonly home: string;
  readonly projectRoot: string;
  readonly featureRoot: string;
}

test("les arguments CLI stricts couvrent les options, relations et erreurs", () => {
  assert.equal(ROOT, process.cwd());
  const parsed = parseStrictArguments(["target", "--name=value", "--flag", "--", "--literal"], {
    options: { name: "string", flag: "boolean" }, minPositionals: 2, maxPositionals: 2,
  });
  assert.deepEqual(parsed.positionals, ["target", "--literal"]);
  assert.equal(parsed.values.get("name"), "value");
  assert.equal(parsed.booleans.has("flag"), true);

  assert.throws(() => parseStrictArguments(["-x"]), CliUsageError);
  assert.throws(() => parseStrictArguments(["--unknown"], { options: {} }), /unknown option/);
  assert.throws(() => parseStrictArguments(["--flag=yes"], { options: { flag: "boolean" } }), /does not accept/);
  assert.throws(() => parseStrictArguments(["--name"], { options: { name: "string" } }), /requires a value/);
  assert.throws(() => parseStrictArguments(["--name", "x", "--name", "y"], { options: { name: "string" } }), /may only be provided once/);
  assert.throws(() => parseStrictArguments([], { minPositionals: 1, maxPositionals: 1 }), /expected 1/);
  assert.throws(() => parseStrictArguments(["--left", "--right"], {
    options: { left: "boolean", right: "boolean" }, exclusiveGroups: [["left", "right"]],
  }), /mutually exclusive/);
  assert.throws(() => parseStrictArguments(["--apply"], {
    options: { apply: "boolean", repair: "boolean" }, requires: { apply: ["repair"] },
  }), /requires --repair/);
});

test("les adaptateurs CLI de catalogue, skills, doctor et migration sont appelés directement", async (context) => {
  const fixture = createFixture(context);
  const skillsContext = { cwd: fixture.cwd, homeDir: fixture.home, frameworkRoot: ROOT };

  assert.equal((await runWorkflowCommand(["list", "--json"], ROOT)).code, 0);
  assert.equal((await runWorkflowCommand(["show", "standard"], ROOT)).code, 0);
  assert.equal((await runWorkflowCommand(["unknown", "--json"], ROOT)).code, 64);

  assert.equal(runSkillsCommand(["list", "--json"], skillsContext).code, 0);
  assert.equal(runSkillsCommand(["list", "--installed", "--target", fixture.projectRoot], skillsContext).code, 0);
  assert.equal(runSkillsCommand(["doctor", "--target", fixture.projectRoot, "--json"], skillsContext).code, 3);
  assert.equal(runSkillsCommand(["install", "--target", fixture.projectRoot, "--profile", "core", "--dry-run", "--json"], skillsContext).code, 0);
  assert.equal(runSkillsCommand(["install", "--target", fixture.projectRoot, "--profile", "core", "--dry-run"], skillsContext).code, 0);
  assert.equal(runSkillsCommand(["unknown", "--json"], skillsContext).code, 64);

  const doctor = await runDoctorCommand(["--json"], { cwd: fixture.cwd, homeDir: fixture.home });
  assert.equal(doctor.code, 3);
  assert.equal((await runDoctorCommand([], { cwd: fixture.cwd, homeDir: fixture.home })).code, 3);
  assert.equal((await runDoctorCommand(["--apply"], { cwd: fixture.cwd, homeDir: fixture.home })).code, 64);
  assert.equal((await runDoctorCommand(["--bogus", "--json"], { cwd: fixture.cwd, homeDir: fixture.home })).code, 64);

  const legacy = join(fixture.cwd, "legacy");
  mkdirSync(join(legacy, ".arka-norn"), { recursive: true });
  cpSync(resolve(ROOT, "tests", "fixtures", "formats", "project-marker-v1.json"), join(legacy, ".arka-norn", "depot.json"));
  assert.equal(findMarkers(legacy, 3).length, 1);
  assert.equal(findMarkers(legacy, 0).length, 1);
  assert.equal((await runMigrateCommand(["--target", legacy, "--json"], { cwd: fixture.cwd })).code, 0);
  assert.equal((await runMigrateCommand(["--target", legacy, "--apply", "--json"], { cwd: fixture.cwd })).code, 0);
  assert.equal((await runMigrateCommand(["--target", legacy], { cwd: fixture.cwd })).code, 0);
  assert.equal((await runMigrateCommand(["--apply", "--dry-run", "--json"], { cwd: fixture.cwd })).code, 64);
  assert.throws(() => findMarkers(join(fixture.cwd, "missing"), 1), /does not exist/);
});

test("l'adaptateur CLI d'audit couvre le cycle local et ses sorties spécialisées", async (context) => {
  const fixture = createFixture(context);
  const management = { cwd: fixture.cwd, homeDir: fixture.home };
  const auditContext = { cwd: fixture.cwd, homeDir: fixture.home };
  writeFileSync(join(fixture.projectRoot, "README.md"), "# Produit à auditer\n");

  assert.equal((await runManagementCommand([
    "project", "add", fixture.projectRoot, "--id", "audit-project", "--name", "Audit Project", "--orchestration-mode", "manual", "--json",
  ], management)).code, 0);

  assert.equal((await runAuditCommand(["help"], auditContext)).code, 0);
  assert.equal((await runAuditCommand(["inspect", "--project", "audit-project", "--json"], auditContext)).code, 0);
  assert.equal((await runAuditCommand(["inspect", "--project", "audit-project"], auditContext)).code, 0);

  const requestPath = join(fixture.cwd, "audit-request.json");
  writeFileSync(requestPath, JSON.stringify({
    objective: "Découvrir le produit",
    mode: "discovery",
    paths: ["."],
    modules: [{ moduleId: "M09", intent: "discover", depth: "inventory", criteria: [] }],
    sources: { paths: [], urls: [] },
    capabilities: { allowImagePulls: false, allowedHosts: [], credentialRefs: [], dynamicTargets: [] },
  }));
  const prepared = json<{ readonly id: string; readonly fingerprint: string }>(await runAuditCommand([
    "prepare", "--project", "audit-project", "--request", requestPath, "--json",
  ], auditContext));
  assert.equal((await runAuditCommand(["prepare", "--project", "audit-project", "--request", requestPath], auditContext)).code, 0);
  assert.equal((await runAuditCommand(["status", prepared.data.id, "--project", "audit-project", "--json"], auditContext)).code, 0);
  assert.equal((await runAuditCommand(["show", prepared.data.id, "--project", "audit-project"], auditContext)).code, 0);

  assert.equal((await runAuditCommand([
    "start", prepared.data.id, "--project", "audit-project", "--confirm", prepared.data.fingerprint, "--json",
  ], auditContext)).code, 0);
  assert.equal((await runAuditCommand(["list", "--project", "audit-project"], auditContext)).code, 0);
  assert.equal((await runAuditCommand(["finalize", prepared.data.id, "--project", "audit-project", "--json"], auditContext)).code, 0);
  assert.equal((await runAuditCommand(["show", prepared.data.id, "--project", "audit-project", "--json"], auditContext)).code, 0);
  assert.equal((await runAuditCommand([
    "compare", prepared.data.id, "--baseline", prepared.data.id, "--project", "audit-project",
  ], auditContext)).code, 0);
  assert.equal((await runAuditCommand([
    "export", prepared.data.id, "--project", "audit-project", "--to", join(fixture.cwd, "export"), "--json",
  ], auditContext)).code, 0);
  assert.equal((await runAuditCommand(["kb", "search", "--project", "audit-project", "--domain", "M09"], auditContext)).code, 0);
  assert.equal((await runAuditCommand(["tools", "doctor", "--project", "audit-project", "--json"], auditContext)).code, 0);

  assert.equal((await runAuditCommand(["submit", prepared.data.id, "--project", "audit-project", "--module", "M99", "--input", requestPath, "--json"], auditContext)).code, 64);
  assert.equal((await runAuditCommand(["evidence", "show", "missing", "--audit", prepared.data.id, "--project", "audit-project", "--json"], auditContext)).code, 4);
  assert.equal((await runAuditCommand(["kb", "unknown", "--json"], auditContext)).code, 64);
  assert.equal((await runAuditCommand(["unknown", "--project", "audit-project", "--json"], auditContext)).code, 64);
});

test("les adaptateurs CLI Project, Feature, Agent, Pipeline et FastDev couvrent les routes métier", async (context) => {
  const fixture = createFixture(context);
  const management = { cwd: fixture.cwd, homeDir: fixture.home };
  const pipeline = { cwd: fixture.cwd, homeDir: fixture.home, frameworkRoot: ROOT, sessionId: AgentSessionId.MAIN };
  const agent = { ...management, frameworkRoot: ROOT, sessionId: AgentSessionId.MAIN };

  assert.equal((await runManagementCommand(["project", "list", "--json"], management)).code, 0);
  assert.equal((await runManagementCommand(["project", "add", fixture.projectRoot, "--id", "quality-project", "--name", "Quality", "--orchestration-mode", "manual", "--json"], management)).code, 0);
  assert.equal((await runManagementCommand(["project", "show", "quality-project", "--json"], management)).code, 0);
  assert.equal((await runManagementCommand(["project", "use", "quality-project", "--json"], management)).code, 0);
  assert.equal((await runManagementCommand(["project", "set-orchestration-mode", "quality-project", "--orchestration-mode", "automatic", "--json"], management)).code, 0);
  assert.equal((await runManagementCommand(["project", "set-orchestration-mode", "quality-project", "--orchestration-mode", "invalid", "--json"], management)).code, 64);
  assert.equal((await runManagementCommand(["depot", "scan", fixture.projectRoot, "--json"], management)).code, 0);
  assert.equal((await runManagementCommand(["project", "reconcile", fixture.projectRoot, "--json"], management)).code, 0);

  assert.equal((await runManagementCommand([
    "feature", "create", "Quality Feature", "--project", "quality-project", "--id", "quality-feature", "--path", fixture.featureRoot, "--workflow", "standard", "--json",
  ], management)).code, 0);
  assert.equal((await runManagementCommand(["feature", "list", "--project", "quality-project", "--json"], management)).code, 0);
  assert.equal((await runManagementCommand(["feature", "show", "quality-feature", "--json"], management)).code, 0);
  assert.equal((await runManagementCommand(["feature", "use", "quality-feature", "--json"], management)).code, 0);
  assert.equal((await runManagementCommand(["feature", "set-workflow", "quality-feature", "--workflow", "standard", "--json"], management)).code, 0);
  assert.equal((await runManagementCommand(["feature", "scan", "--project", "quality-project", "--path", fixture.projectRoot, "--json"], management)).code, 0);
  const reconciled = await runManagementCommand(["feature", "reconcile", "--project", "quality-project", "--json"], management);
  if (reconciled.code !== 0) throw new Error(JSON.stringify(reconciled));
  assert.equal((await runManagementCommand(["feature", "forget", "quality-feature", "--json"], management)).code, 64);
  assert.equal((await runManagementCommand(["project", "unknown", "--json"], management)).code, 64);
  assert.equal((await runManagementCommand(["project", "list"], management)).code, 0);
  assert.equal((await runManagementCommand(["feature", "list", "--project", "quality-project"], management)).code, 0);

  assert.equal((await runAgentCommand(["help"], agent)).code, 0);
  const product = json<{ readonly id: string }>(await runAgentCommand([
    "register", "--project", "quality-project", "--provider", "Codex", "--role", "product", "--id", AUTHOR,
    "--responsibilities", "organisation;coordination", "--session", "main", "--json",
  ], agent));
  assert.equal(product.data.id, AUTHOR);
  const audit = json<{ readonly id: string }>(await runAgentCommand([
    "register", "--project", "quality-project", "--provider", "Claude", "--role", "audit", "--id", "Claude_audit_20260820",
    "--features", "quality-feature", "--paths", "features/quality", "--responsibilities", "preuves", "--session", "audit-quality", "--json",
  ], agent));
  assert.equal(audit.data.id, "Claude_audit_20260820");
  assert.equal((await runAgentCommand(["list", "--project", "quality-project", "--active", "--json"], agent)).code, 0);
  assert.equal((await runAgentCommand(["list", "--project", "quality-project"], agent)).code, 0);
  assert.equal((await runAgentCommand(["show", AUTHOR, "--project", "quality-project", "--json"], agent)).code, 0);
  assert.equal((await runAgentCommand(["current", "--project", "quality-project", "--json"], agent)).code, 0);
  assert.equal((await runAgentCommand(["sessions", "--project", "quality-project", "--json"], agent)).code, 0);
  assert.equal((await runAgentCommand(["use", AUTHOR, "--project", "quality-project", "--json"], agent)).code, 0);
  assert.equal((await runAgentCommand(["advise", "--project", "quality-project", "--feature", "quality-feature", "--json"], agent)).code, 0);
  assert.equal((await runAgentCommand(["prompt", "product", "--project", "quality-project", "--feature", "quality-feature", "--provider", "Codex", "--mode", "execute", "--json"], agent)).code, 0);
  assert.equal((await runAgentCommand(["prompt", "audit", "--project", "quality-project", "--feature", "quality-feature", "--session", "audit-quality", "--mode", "prepare", "--json"], agent)).code, 0);
  assert.equal((await runAgentCommand(["handoff-prompt", "--project", "quality-project", "--feature", "quality-feature", "--agent", AUTHOR, "--json"], agent)).code, 0);
  assert.equal((await runAgentCommand([
    "replace", "Claude_audit_20260820", "--project", "quality-project", "--provider", "OpenAI", "--role", "audit", "--id", "OpenAI_audit_20260820", "--json",
  ], agent)).code, 0);
  assert.equal((await runAgentCommand(["deactivate", "OpenAI_audit_20260820", "--project", "quality-project", "--yes", "--json"], agent)).code, 0);
  assert.equal((await runAgentCommand(["unknown", "--json"], agent)).code, 64);

  assert.equal((await runStatusCommand([fixture.featureRoot, "--json"], pipeline)).code, 2);
  assert.equal((await runStatusCommand([fixture.featureRoot], pipeline)).code, 2);
  assert.equal((await runScaffoldCommand(["concept", "standalone.json", "--agent", AUTHOR, "--json"], pipeline)).code, 0);
  assert.equal((await runScaffoldCommand(["plan", "standalone-plan.json", "--agent", AUTHOR], pipeline)).code, 0);
  const projectAuditScaffold = await runScaffoldCommand([
    "current_state_audit", join(fixture.projectRoot, "audit-project.json"), "--project", "quality-project", "--agent", AUTHOR, "--json",
  ], pipeline);
  assert.equal(projectAuditScaffold.code, 0, projectAuditScaffold.stdout || projectAuditScaffold.stderr);
  assert.equal((await runValidateCommand([resolve(ROOT, "examples", "feature-complete", "01-concept.json"), "--json"], pipeline)).code, 0);
  assert.equal((await runValidateCommand([resolve(ROOT, "examples", "feature-complete", "01-concept.json")], pipeline)).code, 0);
  assert.equal((await runPipelineCommand(["status", "quality-feature", "--json"], pipeline)).code, 2);
  assert.equal((await runPipelineCommand(["status", "quality-feature"], pipeline)).code, 2);
  assert.equal((await runPipelineCommand(["next", "quality-feature", "--json"], pipeline)).code, 2);
  assert.equal((await runPipelineCommand(["next", "quality-feature"], pipeline)).code, 2);
  assert.equal((await runPipelineCommand(["scaffold", "concept", "--feature", "quality-feature", "--agent", AUTHOR, "--output", join(fixture.featureRoot, "concept.json"), "--json"], pipeline)).code, 0);
  assert.equal((await runPipelineCommand(["validate", "quality-feature", "--document", "concept.json", "--json"], pipeline)).code, 3);
  assert.equal((await runPipelineCommand(["unknown", "--json"], pipeline)).code, 64);

  const fastdev = json<{ readonly id: string }>(await runFastDevCommand([
    "start", "Fast Quality", "--project", "quality-project", "--path", join(fixture.projectRoot, "features", "fast-quality"), "--json",
  ], pipeline));
  assert.equal((await runFastDevCommand(["status", fastdev.data.id, "--json"], pipeline)).code, 2);
  assert.equal((await runFastDevCommand(["status", fastdev.data.id], pipeline)).code, 2);
  assert.equal((await runFastDevCommand(["next", fastdev.data.id, "--json"], pipeline)).code, 2);
  assert.equal((await runFastDevCommand(["next", fastdev.data.id], pipeline)).code, 2);
  assert.equal((await runFastDevCommand(["unknown", "--json"], pipeline)).code, 64);
});

test("CLI help documents structural validation and the Project audit v5", () => {
  assert.match(CLI_HELP, /Validates schema and scaffold sentinels/);
  assert.match(CLI_HELP, /identity, relations and business verdict/);
  assert.match(CLI_HELP, /scaffold current_state_audit <output\.json> --project <id> --agent <id>/);
});

test("un scaffold CLI signale l'indisponibilité du journal avant toute écriture", async (context) => {
  const fixture = createFixture(context);
  const auditHome = join(fixture.sandbox, "blocked-audit-home");
  const external = join(fixture.sandbox, "external-audit-home");
  const output = join(fixture.cwd, "must-not-exist.json");
  mkdirSync(auditHome, { recursive: true });
  mkdirSync(external, { recursive: true });
  symlinkSync(external, join(auditHome, ".arka-norn"), "dir");

  const result = await runScaffoldCommand(["concept", "must-not-exist.json", "--agent", AUTHOR, "--json"], {
    cwd: fixture.cwd,
    homeDir: auditHome,
    frameworkRoot: ROOT,
    sessionId: AgentSessionId.MAIN,
  });

  assert.equal(result.code, 3);
  assert.equal(existsSync(output), false);
  assert.match(result.stdout, /AUDIT_UNAVAILABLE|Audit trail unavailable/);
});

function createFixture(context: { after(callback: () => void): void }): Fixture {
  const sandbox = mkdtempSync(join(tmpdir(), "arka-norn-cli-adapters-"));
  const cwd = join(sandbox, "workspace");
  const projectRoot = join(cwd, "product");
  const featureRoot = join(projectRoot, "features", "quality");
  mkdirSync(projectRoot, { recursive: true });
  context.after(() => rmSync(sandbox, { recursive: true, force: true }));
  return { sandbox, cwd, home: join(sandbox, "home"), projectRoot, featureRoot };
}

function json<T>(result: CliExecution): { readonly ok: boolean; readonly data: T } {
  if (result.code !== 0) throw new Error(`Commande JSON inattendue : ${JSON.stringify(result)}`);
  return JSON.parse(result.stdout) as { readonly ok: boolean; readonly data: T };
}
