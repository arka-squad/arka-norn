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
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

import { writeLegacyFeatureMarker } from "../helpers/legacy-feature.ts";

const ROOT = resolve(import.meta.dirname, "..", "..");
const BIN = resolve(ROOT, "bin", "arka-norn.mjs");

test("la CLI isole les sessions et livre des prompts Product/spécialistes directement réutilisables", (context) => {
  const sandbox = mkdtempSync(resolve(tmpdir(), "arka-norn-agent-orchestration-cli-"));
  const home = resolve(sandbox, "home");
  const workspace = resolve(sandbox, "workspace");
  const projectRoot = resolve(workspace, "product");
  const featureRoot = resolve(projectRoot, "navigation");
  mkdirSync(projectRoot, { recursive: true });
  context.after(() => rmSync(sandbox, { recursive: true, force: true }));

  assert.equal(run(["project", "add", projectRoot, "--id", "product", "--name", "Product", "--orchestration-mode", "manual", "--json"], home, workspace).status, 0);
  writeLegacyFeatureMarker({ root: featureRoot, id: "navigation", projectId: "product", name: "Navigation", pipelineId: "arka-norn-complete" });
  assert.equal(run(["feature", "import", featureRoot, "--project", "product", "--json"], home, workspace).status, 0);
  const otherProjectRoot = resolve(workspace, "other-product");
  const orphanRoot = resolve(otherProjectRoot, "norn-test");
  mkdirSync(otherProjectRoot, { recursive: true });
  assert.equal(run(["project", "add", otherProjectRoot, "--id", "other-product", "--name", "Other Product", "--orchestration-mode", "manual", "--json"], home, workspace).status, 0);
  writeLegacyFeatureMarker({ root: orphanRoot, id: "norn-test", projectId: "other-product", name: "norn-test", pipelineId: "arka-norn-complete" });
  assert.equal(run(["feature", "import", orphanRoot, "--project", "other-product", "--json"], home, workspace).status, 0);
  rmSync(resolve(orphanRoot, ".arka-norn"), { recursive: true, force: true });

  const bootstrap = json<{ readonly id: string }>(run([
    "agent", "register", "--project", "product", "--provider", "Bootstrap", "--role", "product", "--session", "main", "--json",
  ], home, workspace));
  assert.equal(run(["agent", "deactivate", bootstrap.data.id, "--project", "product", "--yes", "--json"], home, workspace).status, 0);

  const missingResult = run(["agent", "advise", "--project", "product", "--feature", "navigation", "--json"], home, workspace);
  const missing = json<{ readonly productPrincipal: { readonly status: string }; readonly productNextAction: string }>(missingResult);
  assert.equal(missing.data.productPrincipal.status, "missing");
  assert.match(missing.data.productNextAction, /Create the main Product identity from Project settings/);
  assert.doesNotMatch(missing.data.productNextAction, /arka-norn|--role product --session main/);
  assert.doesNotMatch(missingResult.stderr, /listFeatures: index entry has no readable marker|norn-test/);

  const product = json<{ readonly id: string }>(run([
    "agent", "register", "--project", "product", "--provider", "Codex", "--role", "product",
    "--session", "main", "--responsibilities", "organisation produit;coordination", "--json",
  ], home, workspace));
  const audit = json<{ readonly id: string }>(run([
    "agent", "register", "--project", "product", "--provider", "Claude", "--role", "audit",
    "--features", "navigation", "--paths", "src", "--responsibilities", "preuves", "--session", "audit-navigation", "--json",
  ], home, workspace));

  assert.equal(json<{ readonly id: string }>(run(["agent", "current", "--project", "product", "--session", "main", "--json"], home, workspace)).data.id, product.data.id);
  assert.equal(json<{ readonly id: string }>(run(["agent", "current", "--project", "product", "--session", "audit-navigation", "--json"], home, workspace)).data.id, audit.data.id);
  const sessions = json<readonly { readonly sessionId: string }[]>(run(["agent", "sessions", "--project", "product", "--json"], home, workspace)).data;
  assert.deepEqual(sessions.map((item) => item.sessionId), ["audit-navigation", "main"]);

  const productPrompt = run(["agent", "prompt", "product", "--project", "product", "--feature", "navigation", "--provider", "Codex", "--mode", "execute"], home, workspace);
  assert.equal(productPrompt.status, 0, productPrompt.stderr);
  assert.match(productPrompt.stdout, /\$arka-product/);
  assert.match(productPrompt.stdout, /Isolated session: main/);
  assert.match(productPrompt.stdout, /Expected step: concept/);
  assert.match(productPrompt.stdout, /PREREQUISITE TO RUN BEFORE OPENING/);

  const auditPreparation = run(["agent", "prompt", "audit", "--project", "product", "--feature", "navigation", "--mode", "prepare"], home, workspace);
  assert.equal(auditPreparation.status, 0, auditPreparation.stderr);
  assert.match(auditPreparation.stdout, /Isolated session: audit-navigation/);
  assert.match(auditPreparation.stdout, /Read-only work/);
  assert.match(auditPreparation.stdout, new RegExp(`agent use ${audit.data.id}.*--session audit-navigation`));
  assert.doesNotMatch(auditPreparation.stdout, /Use \$arka-norn, then \$arka-fastdev/);
  assert.doesNotMatch(auditPreparation.stdout, /'"'"'/);

  const missingProvider = run(["agent", "prompt", "dev", "--project", "product", "--feature", "navigation", "--mode", "prepare", "--json"], home, workspace);
  assert.equal(missingProvider.status, 3);
  const missingProviderEnvelope = JSON.parse(missingProvider.stdout) as { readonly display: { readonly errors: readonly string[] } };
  assert.match(missingProviderEnvelope.display.errors.join("\n"), /--provider is required/);

  const refusedDev = run(["agent", "prompt", "dev", "--project", "product", "--feature", "navigation", "--mode", "execute", "--json"], home, workspace);
  assert.equal(refusedDev.status, 3);
  const refusedDevEnvelope = JSON.parse(refusedDev.stdout) as { readonly display: { readonly errors: readonly string[] } };
  assert.match(refusedDevEnvelope.display.errors.join("\n"), /cannot execute step concept/);

  const handoff = run(["agent", "handoff-prompt", "--project", "product", "--feature", "navigation"], home, workspace);
  assert.equal(handoff.status, 0, handoff.stderr);
  assert.match(handoff.stdout, new RegExp(`Product Agent to reuse: ${product.data.id}`));
  assert.match(handoff.stdout, /audit-navigation: .*_audit_/);
  assert.match(handoff.stdout, /Load \$arka-product and execute only concept/);
  assert.match(handoff.stdout, /do not continue into a second phase/);
  assert.match(handoff.stdout, /cd '.*[\\/]workspace[\\/]product'/);
  assert.doesNotMatch(handoff.stderr, /listFeatures: index entry has no readable marker|norn-test/);
});

function run(args: readonly string[], home: string, cwd: string) {
  return spawnSync(process.execPath, [BIN, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ARKA_NORN_HOME: home },
  });
}

function json<T>(result: ReturnType<typeof run>): { readonly ok: boolean; readonly data: T } {
  assert.notEqual(result.stdout.trim(), "", result.stderr);
  const envelope = JSON.parse(result.stdout) as { readonly ok: boolean; readonly data: T };
  assert.equal(envelope.ok, true, result.stdout);
  return envelope;
}
