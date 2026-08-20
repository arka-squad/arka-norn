import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

const ROOT = resolve(import.meta.dirname, "..", "..");
const BIN = resolve(ROOT, "bin", "arka-norn.mjs");

test("la CLI couvre le cycle Project/Feature et reconstruit les index", (context) => {
  const sandbox = mkdtempSync(join(tmpdir(), "arka-norn-management-cli-"));
  const home = resolve(sandbox, "home");
  const workspace = resolve(sandbox, "workspace");
  const projectRoot = resolve(workspace, "product");
  mkdirSync(projectRoot, { recursive: true });
  context.after(() => rmSync(sandbox, { recursive: true, force: true }));

  const project = run<{ readonly id: string }>(["project", "add", projectRoot, "--id", "product", "--name", "Product", "--json"], home, workspace);
  assert.equal(project.status, 0, project.stderr);
  assert.equal(project.json.data.id, "product");
  assert.equal(run<readonly unknown[]>(["project", "list", "--json"], home, workspace).json.data.length, 1);
  const ignoredOption = run(["project", "list", "--name", "ignored", "--json"], home, workspace);
  assert.equal(ignoredOption.status, 64);
  assert.equal(ignoredOption.json.ok, false);
  const humanList = runRaw(["project", "list"], home, workspace);
  assert.equal(humanList.status, 0);
  assert.match(humanList.stdout, /^product\tProduct\t/);
  const legacy = run<readonly unknown[]>(["depot", "list", "--json"], home, workspace);
  assert.equal(legacy.status, 0);
  assert.match(legacy.json.warnings[0] ?? "", /déprécié/);

  const featureRoot = resolve(projectRoot, "secure-cockpit");
  const feature = run<{ readonly projectId: string }>(["feature", "create", "Secure cockpit", "--project", "product", "--id", "secure-cockpit", "--path", featureRoot, "--json"], home, workspace);
  assert.equal(feature.status, 0, feature.stderr);
  assert.equal(feature.json.data.projectId, "product");
  assert.equal(run<{ readonly root: string }>(["feature", "show", "secure-cockpit", "--json"], home, workspace).json.data.root, realpathSync.native(featureRoot));
  assert.equal(run(["feature", "use", "secure-cockpit", "--json"], home, workspace).status, 0);

  const agent = run<{ readonly id: string; readonly active: boolean }>([
    "agent", "register", "--project", "product", "--provider", "Codex CLI", "--role", "dev",
    "--features", "secure-cockpit", "--responsibilities", "implémentation;tests", "--session", "dev-secure-cockpit", "--json",
  ], home, workspace);
  assert.equal(agent.status, 0, agent.stderr);
  assert.match(agent.json.data.id, /^Codex-CLI_dev_\d{8}$/);
  assert.equal(agent.json.data.active, true);
  assert.equal(run<{ readonly id: string }>(["agent", "current", "--project", "product", "--session", "dev-secure-cockpit", "--json"], home, workspace).json.data.id, agent.json.data.id);

  const emptyStatus = run(["pipeline", "status", "secure-cockpit", "--json"], home, workspace);
  assert.equal(emptyStatus.status, 2);
  const next = run<{ readonly nextAction: { readonly stepId: string } }>(["pipeline", "next", "secure-cockpit", "--json"], home, workspace);
  assert.equal(next.json.data.nextAction.stepId, "concept");
  assert.equal(run(["pipeline", "scaffold", "concept", "--feature", "secure-cockpit", "--session", "dev-secure-cockpit", "--json"], home, workspace).status, 0);
  assert.equal(run(["pipeline", "scaffold", "concept", "--feature", "secure-cockpit", "--session", "dev-secure-cockpit", "--json"], home, workspace).status, 5);
  assert.equal(run(["pipeline", "validate", "secure-cockpit", "--document", "concept.json", "--json"], home, workspace).status, 3);
  const scaffold = JSON.parse(readFileSync(resolve(featureRoot, "concept.json"), "utf8")) as { readonly schema_version: number; readonly author_agent_id: string; readonly feature_id: string };
  assert.equal(scaffold.schema_version, 3);
  assert.equal(scaffold.author_agent_id, agent.json.data.id);
  assert.equal(scaffold.feature_id, "secure-cockpit");

  const replacement = run<{ readonly id: string; readonly replacesAgentId: string }>([
    "agent", "replace", agent.json.data.id, "--project", "product", "--provider", "Claude Code", "--role", "dev", "--session", "dev-secure-cockpit", "--json",
  ], home, workspace);
  assert.equal(replacement.status, 0, replacement.stderr);
  assert.equal(replacement.json.data.replacesAgentId, agent.json.data.id);
  const oldAgent = run<{ readonly active: boolean; readonly replacedByAgentId: string }>(["agent", "show", agent.json.data.id, "--project", "product", "--json"], home, workspace);
  assert.equal(oldAgent.json.data.active, false);
  assert.equal(oldAgent.json.data.replacedByAgentId, replacement.json.data.id);
  assert.equal(run<{ readonly id: string }>(["agent", "current", "--project", "product", "--session", "dev-secure-cockpit", "--json"], home, workspace).json.data.id, replacement.json.data.id);

  const refusedForget = run(["feature", "forget", "secure-cockpit", "--json"], home, workspace);
  assert.equal(refusedForget.status, 64);
  assert.equal(refusedForget.json.ok, false);
  assert.equal(run(["feature", "forget", "secure-cockpit", "--yes", "--json"], home, workspace).status, 0);
  assert.equal(existsSync(resolve(featureRoot, ".arka-norn", "feature.json")), true);
  assert.equal(run(["feature", "import", featureRoot, "--project", "product", "--json"], home, workspace).status, 0);
  assert.equal(run(["project", "use", "product", "--json"], home, workspace).status, 0);
  assert.equal(run(["project", "forget", "product", "--json"], home, workspace).status, 64);
  assert.equal(run(["project", "forget", "product", "--yes", "--json"], home, workspace).status, 0);
  assert.equal(existsSync(resolve(projectRoot, ".arka-norn", "project.json")), true);
  assert.equal(run(["project", "import", projectRoot, "--json"], home, workspace).status, 0);

  rmSync(resolve(home, ".arka-norn", "index", "projects.json"));
  assert.equal(run(["project", "scan", workspace, "--json"], home, workspace).status, 0);
  assert.equal(run<readonly unknown[]>(["project", "list", "--json"], home, workspace).json.data.length, 1);
  rmSync(resolve(home, ".arka-norn", "index", "features.json"));
  assert.equal(run(["feature", "reconcile", "--project", "product", "--json"], home, workspace).status, 0);
  assert.equal(run<readonly unknown[]>(["feature", "list", "--project", "product", "--json"], home, workspace).json.data.length, 1);

  const outside = resolve(workspace, "outside");
  const escaped = run(["feature", "create", "Escape", "--project", "product", "--path", outside, "--json"], home, workspace);
  assert.equal(escaped.status, 3);
  assert.equal(escaped.json.ok, false);

  const audit = readFileSync(resolve(home, ".arka-norn", "logs", "audit.jsonl"), "utf8").trim().split("\n").map((line) => JSON.parse(line) as { readonly action: string });
  assert.ok(audit.some((event) => event.action === "project.create"));
  assert.ok(audit.some((event) => event.action === "feature.create"));
  assert.ok(audit.some((event) => event.action === "feature.forget"));
  assert.ok(audit.some((event) => event.action === "agent.register"));
  assert.ok(audit.some((event) => event.action === "agent.replace"));
});

test("le scaffold d'audit Project v4 est signé, confiné et distinct d'une Feature", (context) => {
  const sandbox = mkdtempSync(join(tmpdir(), "arka-norn-project-audit-cli-"));
  const home = resolve(sandbox, "home");
  const projectRoot = resolve(sandbox, "project");
  const auditDirectory = resolve(projectRoot, "input", "audit");
  mkdirSync(auditDirectory, { recursive: true });
  context.after(() => rmSync(sandbox, { recursive: true, force: true }));

  assert.equal(run(["project", "add", projectRoot, "--id", "product", "--name", "Product", "--json"], home, projectRoot).status, 0);
  const author = run<{ readonly id: string }>([
    "agent", "register", "--project", "product", "--provider", "Codex", "--role", "audit", "--session", "audit-product", "--json",
  ], home, projectRoot);
  assert.equal(author.status, 0, author.stderr);

  const output = "input/audit/project-audit.json";
  const scaffold = run(["scaffold", "audit_etat_reel", output, "--project", "product", "--agent", author.json.data.id, "--json"], home, projectRoot);
  assert.equal(scaffold.status, 0, scaffold.stderr);
  const document = JSON.parse(readFileSync(resolve(projectRoot, output), "utf8")) as {
    readonly schema_version: number;
    readonly project_id: string;
    readonly feature_id?: string;
    readonly author_agent_id: string;
  };
  assert.equal(document.schema_version, 4);
  assert.equal(document.project_id, "product");
  assert.equal(document.feature_id, undefined);
  assert.equal(document.author_agent_id, author.json.data.id);

  const nestedProjectRoot = resolve(projectRoot, "nested-project");
  mkdirSync(nestedProjectRoot);
  assert.equal(run([
    "project", "add", nestedProjectRoot, "--id", "nested", "--name", "Nested", "--json",
  ], home, projectRoot).status, 0);
  const insideNestedProject = run([
    "scaffold", "audit_etat_reel", "nested-project/project-audit.json", "--project", "product", "--agent", author.json.data.id, "--json",
  ], home, projectRoot);
  assert.equal(insideNestedProject.status, 3, insideNestedProject.stderr);
  assert.match(insideNestedProject.json.errors[0] ?? "", /must not be placed inside another managed Project/);
  assert.equal(existsSync(resolve(nestedProjectRoot, "project-audit.json")), false);

  const featureRoot = resolve(projectRoot, "feature");
  assert.equal(run([
    "feature", "create", "Feature", "--project", "product", "--id", "feature", "--path", featureRoot, "--json",
  ], home, projectRoot).status, 0);
  const insideFeature = "feature/project-audit.json";
  const rejectedInsideFeature = run([
    "scaffold", "audit_etat_reel", insideFeature, "--project", "product", "--agent", author.json.data.id, "--json",
  ], home, projectRoot);
  assert.equal(rejectedInsideFeature.status, 3, rejectedInsideFeature.stderr);
  assert.match(rejectedInsideFeature.json.errors[0] ?? "", /must not be placed inside a managed Feature/);
  assert.equal(existsSync(resolve(projectRoot, insideFeature)), false);

  const markerPath = resolve(projectRoot, ".arka-norn", "project.json");
  const originalMarker = readFileSync(markerPath, "utf8");
  const rejectedMarkerOverwrite = run([
    "scaffold", "audit_etat_reel", ".arka-norn/project.json", "--project", "product", "--agent", author.json.data.id, "--force", "--json",
  ], home, projectRoot);
  assert.equal(rejectedMarkerOverwrite.status, 3, rejectedMarkerOverwrite.stderr);
  assert.match(rejectedMarkerOverwrite.json.errors[0] ?? "", /reserved .arka-norn directory/);
  assert.equal(readFileSync(markerPath, "utf8"), originalMarker);
  const rejectedGenericMarkerOverwrite = run([
    "scaffold", "audit_etat_reel", ".arka-norn/project.json", "--agent", author.json.data.id, "--force", "--json",
  ], home, projectRoot);
  assert.equal(rejectedGenericMarkerOverwrite.status, 3, rejectedGenericMarkerOverwrite.stderr);
  assert.match(rejectedGenericMarkerOverwrite.json.errors[0] ?? "", /reserved .arka-norn directory/);
  assert.equal(readFileSync(markerPath, "utf8"), originalMarker);

  assert.equal(run(["scaffold", "concept", "input/audit/concept.json", "--project", "product", "--agent", author.json.data.id, "--json"], home, projectRoot).status, 64);
  assert.equal(run(["scaffold", "audit_etat_reel", "input/audit/mixed.json", "--project", "product", "--feature-id", "other", "--agent", author.json.data.id, "--json"], home, projectRoot).status, 64);
  assert.equal(run(["scaffold", "audit_etat_reel", "../outside.json", "--project", "product", "--agent", author.json.data.id, "--json"], home, projectRoot).status, 3);
  assert.equal(run(["validate", resolve(ROOT, "examples", "project-audit-v4", "01-audit-etat-reel.json"), "--json"], home, projectRoot).status, 0);
});

interface RunResult<T> {
  readonly status: number | null;
  readonly stderr: string;
  readonly json: { readonly ok: boolean; readonly data: T; readonly errors: readonly string[]; readonly warnings: readonly string[] };
}

function run<T = unknown>(args: readonly string[], home: string, cwd: string): RunResult<T> {
  const result = runRaw(args, home, cwd);
  assert.notEqual(result.stdout.trim(), "", `aucune sortie JSON pour ${args.join(" ")} (status=${String(result.status)}): ${result.stderr}`);
  return { status: result.status, stderr: result.stderr, json: JSON.parse(result.stdout) as RunResult<T>["json"] };
}

function runRaw(args: readonly string[], home: string, cwd: string) {
  return spawnSync(process.execPath, [BIN, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ARKA_NORN_HOME: home },
  });
}
