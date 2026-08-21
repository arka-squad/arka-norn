import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

import { runOrchestrationCommand } from "../../src/adapters/inbound/cli/orchestration-cli.ts";
import { createManagementRuntime } from "../../src/composition/management-runtime.ts";
import { ProjectId } from "../../src/domain/project/project-id.ts";

const ROOT = resolve(import.meta.dirname, "..", "..");

test("la CLI d'orchestration expose l'état Project sans créer de politique lors d'une simple lecture", async (context) => {
  const sandbox = mkdtempSync(join(tmpdir(), "arka-norn-orchestration-cli-"));
  const home = resolve(sandbox, "home");
  const projectRoot = resolve(sandbox, "project");
  mkdirSync(projectRoot, { recursive: true });
  context.after(() => rmSync(sandbox, { recursive: true, force: true }));
  const management = createManagementRuntime({ homeDir: home });
  await management.projects.create({ id: ProjectId.of("project"), name: "Project", root: projectRoot, orchestrationMode: "manual" });

  const result = await runOrchestrationCommand(["status", "--project", "project", "--json"], { homeDir: home, cwd: projectRoot, frameworkRoot: ROOT, environment: {} });
  assert.equal(result.code, 0);
  const envelope = JSON.parse(result.stdout) as { readonly data: { readonly orchestrationMode: string; readonly policy: unknown; readonly executions: readonly unknown[] } };
  assert.equal(envelope.data.orchestrationMode, "manual");
  assert.equal(envelope.data.policy, null);
  assert.deepEqual(envelope.data.executions, []);
});

test("la CLI refuse les arguments ambigus des commandes d'orchestration", async () => {
  const result = await runOrchestrationCommand(["start", "--project", "project", "--unexpected"], { homeDir: "/tmp/unused", cwd: "/tmp", frameworkRoot: ROOT, environment: {} });
  assert.equal(result.code, 64);
  assert.match(result.stderr, /unknown option/);
});
