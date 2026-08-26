/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0
 */

import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { test } from "node:test";

import { LocalExecutionProfileRuntimeAdapter } from "../../src/adapters/outbound/execution/execution-profile-runtime-adapter.ts";
import { MastraTaskWorkerAdapter } from "../../src/adapters/outbound/execution/mastra-task-worker-adapter.ts";
import { ExecutionProfile } from "../../src/domain/orchestration/execution-profile.ts";

const at = new Date("2026-08-25T20:00:00.000Z");

test("le préflight OpenCodex utilise un HOME privé, le catalogue contrôlé et un wrapper env node", async (context) => {
  const sandbox = mkdtempSync(join(tmpdir(), "arka-norn-v23-profile-runtime-"));
  const home = join(sandbox, "home");
  const workspace = join(sandbox, "workspace");
  const catalog = join(sandbox, "catalog.json");
  const command = join(sandbox, "codex-wrapper");
  mkdirSync(workspace, { recursive: true });
  writeFileSync(catalog, `${JSON.stringify({ models: [{ slug: "zai/glm-5.2" }] })}\n`, "utf8");
  writeFileSync(command, wrapperSource(), "utf8");
  chmodSync(command, 0o755);
  context.after(() => rmSync(sandbox, { recursive: true, force: true }));

  const profile = opencodexProfile(catalog);
  const adapter = new LocalExecutionProfileRuntimeAdapter(home, { ARKA_NORN_CODEX_CLI_COMMAND: command, OPENCODEX_SOURCE: "runtime-secret" });
  const runtime = await adapter.prepare(profile);
  assert.equal(runtime.environment["OPENAI_API_KEY"], "runtime-secret");
  assert.equal(runtime.environment["OPENCODEX_SOURCE"], undefined);
  const configuration = readFileSync(join(runtime.home, "config.toml"), "utf8");
  assert.match(configuration, /model = "zai\/glm-5\.2"/u);
  assert.match(configuration, /model_provider = "zai"/u);
  assert.match(configuration, /base_url = "https:\/\/gateway\.example\.test\/v1"/u);
  assert.equal(configuration.includes("runtime-secret"), false);

  const result = await adapter.preflight(profile, workspace);
  assert.equal(result.healthy, true, JSON.stringify(result));
  assert.equal(result.code, "profile_valid");
  assert.equal(result.runtimeVersion, "codex-cli 0.200.0");
  assert.match(result.runtimeFingerprint ?? "", /^[a-f0-9]{64}$/u);
});

test("un échec modèle conserve le code et un stderr expurgé", async (context) => {
  const sandbox = mkdtempSync(join(tmpdir(), "arka-norn-v23-profile-failure-"));
  const workspace = join(sandbox, "workspace");
  const catalog = join(sandbox, "catalog.json");
  const command = join(sandbox, "codex-wrapper");
  mkdirSync(workspace, { recursive: true });
  writeFileSync(catalog, `${JSON.stringify({ models: [{ slug: "missing/model" }] })}\n`, "utf8");
  writeFileSync(command, wrapperSource(true), "utf8");
  chmodSync(command, 0o755);
  context.after(() => rmSync(sandbox, { recursive: true, force: true }));
  const profile = ExecutionProfile.create({ ...opencodexProfile(catalog).props, model: "missing/model" });
  const result = await new LocalExecutionProfileRuntimeAdapter(join(sandbox, "home"), { ARKA_NORN_CODEX_CLI_COMMAND: command, OPENCODEX_SOURCE: "runtime-secret" }).preflight(profile, workspace);
  assert.equal(result.healthy, false);
  assert.equal(result.code, "model_unresolvable");
  assert.equal(result.exitCode, 42);
  assert.match(result.stderrExcerpt ?? "", /OPENAI_API_KEY=\[REDACTED\]/u);
  assert.equal((result.stderrExcerpt ?? "").includes("runtime-secret"), false);
});

test("une référence de credential absente bloque avant le lancement du CLI", async (context) => {
  const sandbox = mkdtempSync(join(tmpdir(), "arka-norn-v23-profile-credential-"));
  const workspace = join(sandbox, "workspace");
  const catalog = join(sandbox, "catalog.json");
  const command = join(sandbox, "codex-wrapper");
  mkdirSync(workspace, { recursive: true });
  writeFileSync(catalog, "{\"models\":[]}\n", "utf8");
  writeFileSync(command, wrapperSource(), "utf8");
  chmodSync(command, 0o755);
  context.after(() => rmSync(sandbox, { recursive: true, force: true }));
  const result = await new LocalExecutionProfileRuntimeAdapter(join(sandbox, "home"), { ARKA_NORN_CODEX_CLI_COMMAND: command }).preflight(opencodexProfile(catalog), workspace);
  assert.equal(result.code, "credential_unavailable");
  assert.equal(result.healthy, false);
});

test("le worker OpenCodex reçoit uniquement le credential résolu du profil", async (context) => {
  const sandbox = mkdtempSync(join(tmpdir(), "arka-norn-v23-worker-credential-"));
  const home = join(sandbox, "home");
  const workspace = join(sandbox, "workspace");
  const command = join(sandbox, "codex-worker");
  mkdirSync(workspace, { recursive: true });
  writeFileSync(command, "#!/usr/bin/env node\nif (process.env.OPENAI_API_KEY !== 'profile-secret' || process.env.UNSCOPED_SECRET) process.exit(40); process.stdin.resume(); process.stdin.on('end', () => process.stdout.write('OK'));\n", "utf8");
  chmodSync(command, 0o755);
  context.after(() => rmSync(sandbox, { recursive: true, force: true }));
  const profile = ExecutionProfile.create({ schemaVersion: 1, id: "codex-credential", transport: "codex-cli", provider: "openai", model: "gpt-5", credentialRef: { kind: "environment", name: "PROFILE_SOURCE", environmentVariable: "OPENAI_API_KEY" }, capabilities: ["inspect_workspace", "modify_workspace"], egressHosts: [], costMeter: { kind: "unknown", observable: false }, enabled: true, createdAt: at, updatedAt: at });
  const runtime = await new LocalExecutionProfileRuntimeAdapter(home, { ARKA_NORN_CODEX_CLI_COMMAND: command, PROFILE_SOURCE: "profile-secret", UNSCOPED_SECRET: "never-forward" }).prepare(profile);
  const result = await new MastraTaskWorkerAdapter().execute({ executionId: "execution-credential", campaignId: "campaign-credential", projectId: "project", featureId: "feature", task: { id: "docs", agentId: "Codex_development_20260825", role: "development", requiredProfile: { transports: ["codex-cli"], capabilities: ["inspect_workspace"] }, priority: 1, dependencies: [], readScopes: ["."], writeScopes: ["docs"], deliverables: ["Docs"], validations: ["Tests"] }, workspace, profile, runtime, timeoutMs: 10_000 });
  assert.equal(result.status, "succeeded", JSON.stringify(result));
});

function opencodexProfile(catalogRef: string): ExecutionProfile {
  const fingerprint = createHash("sha256").update(JSON.stringify({ kind: "opencodex", endpoint: "https://gateway.example.test/v1", catalogSha256: createHash("sha256").update(readFileSync(catalogRef)).digest("hex") })).digest("hex");
  return ExecutionProfile.create({
    schemaVersion: 1,
    id: "opencodex-zai",
    transport: "codex-cli",
    gateway: { kind: "opencodex", endpoint: "https://gateway.example.test/v1", catalogRef, fingerprint },
    provider: "zai",
    model: "zai/glm-5.2",
    credentialRef: { kind: "environment", name: "OPENCODEX_SOURCE", environmentVariable: "OPENAI_API_KEY" },
    capabilities: ["inspect_workspace", "modify_workspace", "run_commands", "read_pipeline"],
    egressHosts: ["gateway.example.test"],
    costMeter: { kind: "currency_eur", observable: true },
    enabled: true,
    createdAt: at,
    updatedAt: at,
  });
}

function wrapperSource(fail = false): string {
  return `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
if (args[0] === "--version") { console.log("codex-cli 0.200.0"); process.exit(0); }
if (args.includes("--ignore-user-config")) { console.error("forbidden ignore-user-config"); process.exit(41); }
const config = fs.readFileSync(process.env.CODEX_HOME + "/config.toml", "utf8");
if (!config.includes('model_provider = "zai"') || !config.includes('base_url = "https://gateway.example.test/v1"') || !process.env.OPENAI_API_KEY) process.exit(40);
if (${String(fail)}) { console.error("OPENAI_API_KEY=" + process.env.OPENAI_API_KEY); process.exit(42); }
const output = args[args.indexOf("--output-last-message") + 1];
fs.writeFileSync(output, "NORN_PREFLIGHT_OK\\n");
console.log("NORN_PREFLIGHT_OK");
`;
}
