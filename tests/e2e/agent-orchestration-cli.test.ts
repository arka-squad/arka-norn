import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

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

  assert.equal(run(["project", "add", projectRoot, "--id", "product", "--name", "Product", "--json"], home, workspace).status, 0);
  assert.equal(run(["feature", "create", "Navigation", "--project", "product", "--id", "navigation", "--path", featureRoot, "--json"], home, workspace).status, 0);

  const missing = json<{ readonly productPrincipal: { readonly status: string }; readonly productNextAction: string }>(run(["agent", "advise", "--project", "product", "--feature", "navigation", "--json"], home, workspace));
  assert.equal(missing.data.productPrincipal.status, "missing");
  assert.match(missing.data.productNextAction, /--role product --session main/);

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
  assert.match(productPrompt.stdout, /Session isolée: main/);
  assert.match(productPrompt.stdout, /Étape attendue: concept/);
  assert.match(productPrompt.stdout, /PRÉREQUIS À EXÉCUTER AVANT D'OUVRIR/);

  const auditPreparation = run(["agent", "prompt", "audit", "--project", "product", "--feature", "navigation", "--mode", "prepare"], home, workspace);
  assert.equal(auditPreparation.status, 0, auditPreparation.stderr);
  assert.match(auditPreparation.stdout, /Session isolée: audit-navigation/);
  assert.match(auditPreparation.stdout, /Travail en lecture seule/);
  assert.match(auditPreparation.stdout, new RegExp(`agent use ${audit.data.id}.*--session audit-navigation`));
  assert.doesNotMatch(auditPreparation.stdout, /Utilise \$arka-norn puis \$arka-fastdev/);

  const missingProvider = run(["agent", "prompt", "dev", "--project", "product", "--feature", "navigation", "--mode", "prepare", "--json"], home, workspace);
  assert.equal(missingProvider.status, 3);
  assert.match(missingProvider.stdout, /--provider est requis/);

  const refusedDev = run(["agent", "prompt", "dev", "--project", "product", "--feature", "navigation", "--mode", "execute", "--json"], home, workspace);
  assert.equal(refusedDev.status, 3);
  assert.match(refusedDev.stdout, /ne peut pas exécuter l'étape concept/);

  const handoff = run(["agent", "handoff-prompt", "--project", "product", "--feature", "navigation"], home, workspace);
  assert.equal(handoff.status, 0, handoff.stderr);
  assert.match(handoff.stdout, new RegExp(`Agent Product à réutiliser: ${product.data.id}`));
  assert.match(handoff.stdout, /audit-navigation: .*_audit_/);
  assert.match(handoff.stdout, /Ne réalise pas l'audit, le développement ou la QA/);
  assert.match(handoff.stdout, /cd '.*\/workspace\/product'/);
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
