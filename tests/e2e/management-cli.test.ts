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
  assert.equal(run<{ readonly root: string }>(["feature", "show", "secure-cockpit", "--json"], home, workspace).json.data.root, realpathSync(featureRoot));
  assert.equal(run(["feature", "use", "secure-cockpit", "--json"], home, workspace).status, 0);

  const emptyStatus = run(["pipeline", "status", "secure-cockpit", "--json"], home, workspace);
  assert.equal(emptyStatus.status, 2);
  const next = run<{ readonly nextAction: { readonly stepId: string } }>(["pipeline", "next", "secure-cockpit", "--json"], home, workspace);
  assert.equal(next.json.data.nextAction.stepId, "concept");
  assert.equal(run(["pipeline", "scaffold", "concept", "--feature", "secure-cockpit", "--json"], home, workspace).status, 0);
  assert.equal(run(["pipeline", "scaffold", "concept", "--feature", "secure-cockpit", "--json"], home, workspace).status, 5);
  assert.equal(run(["pipeline", "validate", "secure-cockpit", "--document", "concept.json", "--json"], home, workspace).status, 3);

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
});

interface RunResult<T> {
  readonly status: number | null;
  readonly stderr: string;
  readonly json: { readonly ok: boolean; readonly data: T; readonly warnings: readonly string[] };
}

function run<T = unknown>(args: readonly string[], home: string, cwd: string): RunResult<T> {
  const result = runRaw(args, home, cwd);
  return { status: result.status, stderr: result.stderr, json: JSON.parse(result.stdout) as RunResult<T>["json"] };
}

function runRaw(args: readonly string[], home: string, cwd: string) {
  return spawnSync(process.execPath, [BIN, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ARKA_NORN_HOME: home },
  });
}
