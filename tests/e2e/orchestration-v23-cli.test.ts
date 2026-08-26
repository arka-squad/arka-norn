/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0
 */

import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { test } from "node:test";

import { runOrchestrationCommand } from "../../src/adapters/inbound/cli/orchestration-cli.ts";
import { createManagementRuntime } from "../../src/composition/management-runtime.ts";
import { ProjectId } from "../../src/domain/project/project-id.ts";

const ROOT = resolve(import.meta.dirname, "..", "..");

test("la CLI 2.3 enregistre et diagnostique un profil OpenCodex sans persister le secret", async (context) => {
  const sandbox = mkdtempSync(resolve(tmpdir(), "arka-norn-v23-profile-cli-"));
  const home = resolve(sandbox, "home");
  const projectRoot = resolve(sandbox, "project");
  const catalog = resolve(sandbox, "catalog.json");
  const command = resolve(sandbox, "codex-wrapper.cjs");
  mkdirSync(projectRoot, { recursive: true });
  writeFileSync(catalog, '{"models":[{"slug":"zai/glm-5.2"}]}\n', "utf8");
  writeFileSync(command, `if (process.argv[2] === "--version") console.log("codex-cli 0.200.0");
else console.log("NORN_PREFLIGHT_OK");
`, "utf8");
  chmodSync(command, 0o755);
  context.after(() => rmSync(sandbox, { recursive: true, force: true }));
  const management = createManagementRuntime({ homeDir: home });
  await management.projects.create({ id: ProjectId.of("project"), name: "Project", root: projectRoot, orchestrationMode: "automatic" });
  const cliContext = { homeDir: home, cwd: projectRoot, frameworkRoot: ROOT, environment: { OPENCODEX_API_KEY: "not-persisted", ARKA_NORN_CODEX_CLI_COMMAND: command } };

  const registered = await runOrchestrationCommand([
    "profile", "register", "--project", "project", "--id", "opencodex-zai", "--transport", "codex-cli",
    "--gateway-kind", "opencodex", "--gateway-endpoint", "https://gateway.example.test/v1", "--catalog-ref", catalog,
    "--provider", "zai", "--model", "zai/glm-5.2", "--credential-kind", "environment", "--credential-ref", "OPENCODEX_API_KEY", "--credential-env", "OPENAI_API_KEY",
    "--egress", "gateway.example.test", "--cost-meter", "currency_eur", "--cost-observable", "--activate", "--json",
  ], cliContext);
  assert.equal(registered.code, 0, `${registered.stderr}\n${registered.stdout}`);
  const envelope = JSON.parse(registered.stdout) as { readonly data: { readonly schemaVersion: number; readonly automaticEnabled: boolean; readonly profiles: readonly Record<string, unknown>[] } };
  assert.equal(envelope.data.schemaVersion, 4);
  assert.equal(envelope.data.automaticEnabled, true);
  assert.equal(envelope.data.profiles[0]?.["transport"], "codex-cli");
  assert.equal(JSON.stringify(envelope.data).includes("not-persisted"), false);

  const doctor = await runOrchestrationCommand(["profile", "doctor", "opencodex-zai", "--project", "project", "--json"], cliContext);
  assert.equal(doctor.code, 0, doctor.stderr);
  assert.equal((JSON.parse(doctor.stdout) as { readonly data: { readonly healthy: boolean } }).data.healthy, true);
});

test("la CLI recovery expose un manifeste humain et JSON sans muter le Project", async (context) => {
  const sandbox = mkdtempSync(resolve(tmpdir(), "arka-norn-v23-recovery-cli-"));
  const home = resolve(sandbox, "home");
  const projectRoot = resolve(sandbox, "project");
  mkdirSync(projectRoot, { recursive: true });
  context.after(() => rmSync(sandbox, { recursive: true, force: true }));
  const management = createManagementRuntime({ homeDir: home });
  await management.projects.create({ id: ProjectId.of("project"), name: "Project", root: projectRoot, orchestrationMode: "manual" });
  mkdirSync(resolve(projectRoot, ".arka-norn"), { recursive: true });
  writeFileSync(resolve(projectRoot, ".arka-norn", "orchestration.json"), '{"schemaVersion":3,"projectId":"project","providers":[]}\n', "utf8");
  const cliContext = { homeDir: home, cwd: projectRoot, frameworkRoot: ROOT, environment: {} };

  const human = await runOrchestrationCommand(["recovery", "inspect", "--project", "project"], cliContext);
  assert.equal(human.code, 0, human.stderr);
  assert.match(human.stdout, /Recovery manifest [a-f0-9]{64}/u);
  const json = await runOrchestrationCommand(["recovery", "inspect", "--project", "project", "--json"], cliContext);
  assert.equal(json.code, 0, json.stderr);
  assert.match((JSON.parse(json.stdout) as { readonly data: { readonly fingerprint: string } }).data.fingerprint, /^[a-f0-9]{64}$/u);
});
