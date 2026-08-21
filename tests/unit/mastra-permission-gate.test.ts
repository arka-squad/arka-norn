import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

import { createWorkspacePermissionGate, isAllowedWorkspacePath } from "../../scripts/mastra-permission-gate.mjs";

test("la barrière Claude autorise seulement les outils structurés et chemins Feature préautorisés", (context) => {
  const sandbox = mkdtempSync(join(tmpdir(), "arka-norn-permission-gate-"));
  const workspace = join(sandbox, "feature");
  const outside = join(sandbox, "outside");
  mkdirSync(join(workspace, "src"), { recursive: true });
  mkdirSync(join(workspace, ".arka-norn"), { recursive: true });
  mkdirSync(outside);
  writeFileSync(join(workspace, "src", "inside.ts"), "export {};\n");
  writeFileSync(join(workspace, ".arka-norn", "feature.json"), "{}\n");
  writeFileSync(join(outside, "secret.ts"), "export {};\n");
  symlinkSync(outside, join(workspace, "src", "external"));
  context.after(() => rmSync(sandbox, { recursive: true, force: true }));

  const gate = createWorkspacePermissionGate({
    workspace,
    permissionPolicy: {
      mode: "preauthorized-workspace",
      scopePaths: ["src"],
      permissions: ["read_workspace", "write_workspace"],
    },
  });

  assert.equal(gate("Read", { file_path: "src/inside.ts" }).behavior, "allow");
  assert.equal(gate("Write", { file_path: "src/new.ts", content: "export {};" }).behavior, "allow");
  assert.equal(gate("Read", { file_path: "../outside/secret.ts" }).behavior, "deny");
  assert.equal(gate("Read", { file_path: "src/external/secret.ts" }).behavior, "deny");
  assert.equal(gate("Write", { file_path: "docs/outside.md", content: "no" }).behavior, "deny");
  assert.equal(gate("Bash", { command: "pwd" }).behavior, "deny");
  assert.equal(gate("Glob", { path: "src/**/*.ts" }).behavior, "allow");
  assert.equal(isAllowedWorkspacePath(workspace, ["src"], resolve(workspace, "src", "external", "secret.ts")), false);
});

test("la barrière protège structurellement le plan de contrôle, même pour le scope Feature entier", (context) => {
  const sandbox = mkdtempSync(join(tmpdir(), "arka-norn-permission-control-plane-"));
  const workspace = join(sandbox, "feature");
  const outside = join(sandbox, "outside");
  mkdirSync(join(workspace, ".arka-norn"), { recursive: true });
  mkdirSync(join(workspace, "src"), { recursive: true });
  mkdirSync(outside);
  writeFileSync(join(workspace, ".arka-norn", "feature.json"), "{}\n");
  symlinkSync(outside, join(workspace, "src", "external"));
  context.after(() => rmSync(sandbox, { recursive: true, force: true }));

  const gate = createWorkspacePermissionGate({
    workspace,
    permissionPolicy: {
      mode: "preauthorized-workspace",
      scopePaths: ["."],
      permissions: ["read_workspace", "write_workspace"],
    },
  });

  assert.equal(gate("Read", { file_path: ".arka-norn/feature.json" }).behavior, "deny");
  assert.equal(gate("Write", { file_path: ".arka-norn/feature.json", content: "{}" }).behavior, "deny");
  assert.equal(gate("Glob", { path: ".arka-norn/**/*.json" }).behavior, "deny");
  assert.equal(gate("Glob", { pattern: "**/*.json" }).behavior, "deny");
  assert.equal(gate("Glob", { path: "../outside/**/*.ts" }).behavior, "deny");
  assert.equal(gate("Glob", { path: "src/external/**/*.ts" }).behavior, "deny");
  assert.equal(isAllowedWorkspacePath(workspace, ["."], resolve(workspace, ".arka-norn", "feature.json")), false);
});

test("la barrière refuse toute opération lorsque la politique est deny-all", (context) => {
  const workspace = mkdtempSync(join(tmpdir(), "arka-norn-permission-deny-"));
  context.after(() => rmSync(workspace, { recursive: true, force: true }));
  const gate = createWorkspacePermissionGate({ workspace, permissionPolicy: "deny-all" });

  assert.equal(gate("Read", { file_path: "file.txt" }).behavior, "deny");
});
