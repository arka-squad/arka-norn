import assert from "node:assert/strict";
import { existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

import { FsAuditTrail } from "../../src/adapters/outbound/filesystem/fs-audit-trail.ts";
import { ConsoleLogger } from "../../src/adapters/outbound/system/console-logger.ts";
import { createManagementRuntime } from "../../src/composition/management-runtime.ts";
import { createPipelineRuntime } from "../../src/composition/pipeline-runtime.ts";
import { ProjectId } from "../../src/domain/project/project-id.ts";
import type { AuditEvent, AuditTrail, AuditTrailHealth } from "../../src/ports/outbound/audit-trail.ts";

const ROOT = resolve(import.meta.dirname, "..", "..");

test("une mutation ne démarre pas si l'intention d'audit ne peut pas être écrite", async (context) => {
  const sandbox = mkdtempSync(join(tmpdir(), "arka-norn-audit-required-"));
  context.after(() => rmSync(sandbox, { recursive: true, force: true }));
  const projectRoot = resolve(sandbox, "project");
  mkdirSync(projectRoot);
  const failingAudit: AuditTrail = {
    async append(_event: AuditEvent): Promise<void> { throw new Error("disk unavailable"); },
    async inspect(): Promise<AuditTrailHealth> { return { ok: false, filePath: "unavailable", sizeBytes: 0, archiveCount: 0, message: "disk unavailable" }; },
  };
  const logs: string[] = [];
  const logger = new ConsoleLogger({ threshold: "debug", format: "json", sink: { write: (line) => logs.push(line) } });
  const runtime = createManagementRuntime({ homeDir: sandbox, auditTrail: failingAudit, logger });

  await assert.rejects(
    runtime.projects.create({ id: ProjectId.of("audit-required"), name: "Audit required", root: projectRoot }),
    (error: unknown) => error instanceof Error && "code" in error && error.code === "AUDIT_UNAVAILABLE",
  );

  assert.equal(existsSync(resolve(projectRoot, ".arka-norn", "project.json")), false);
  assert.ok(logs.some((line) => line.includes("audit trail unavailable")));
});

test("le journal tourne, reste borné et masque les secrets", async (context) => {
  const home = mkdtempSync(join(tmpdir(), "arka-norn-audit-rotation-"));
  context.after(() => rmSync(home, { recursive: true, force: true }));
  const audit = new FsAuditTrail(home, { maxBytes: 320, maxArchives: 2 });

  for (let index = 0; index < 12; index += 1) {
    await audit.append({
      occurredAt: new Date(1_700_000_000_000 + index),
      action: "system.test",
      outcome: "success",
      entityType: "system",
      details: { index, apiKey: `secret-${index}` },
    });
  }

  const logDir = resolve(home, ".arka-norn", "logs");
  const files = readdirSync(logDir).filter((name) => name.endsWith(".jsonl")).sort();
  assert.deepEqual(files, ["audit.1.jsonl", "audit.2.jsonl", "audit.jsonl"]);
  const content = files.map((name) => readFileSync(resolve(logDir, name), "utf8")).join("");
  assert.doesNotMatch(content, /secret-/);
  assert.match(content, /\[REDACTED\]/);
  const health = await audit.inspect();
  assert.equal(health.ok, true);
  assert.equal(health.archiveCount, 2);
});

test("le journal d'audit refuse ses répertoires symboliques", async (context) => {
  const sandbox = mkdtempSync(join(tmpdir(), "arka-norn-audit-symlink-"));
  context.after(() => rmSync(sandbox, { recursive: true, force: true }));
  const home = resolve(sandbox, "home");
  const external = resolve(sandbox, "external");
  mkdirSync(home);
  mkdirSync(external);
  symlinkSync(external, resolve(home, ".arka-norn"), "dir");

  await assert.rejects(
    new FsAuditTrail(home).append({ occurredAt: new Date(), action: "system.test", entityType: "system" }),
    (error: unknown) => error instanceof Error && "code" in error && error.code === "PATH_SECURITY",
  );
  assert.equal(existsSync(resolve(external, "logs", "audit.jsonl")), false);
});

test("le journal d'audit refuse un fichier final lié à un emplacement externe", async (context) => {
  const sandbox = mkdtempSync(join(tmpdir(), "arka-norn-audit-hardlink-"));
  context.after(() => rmSync(sandbox, { recursive: true, force: true }));
  const home = resolve(sandbox, "home");
  const external = resolve(sandbox, "external-audit.jsonl");
  const auditPath = resolve(home, ".arka-norn", "logs", "audit.jsonl");
  mkdirSync(resolve(home, ".arka-norn", "logs"), { recursive: true });
  writeFileSync(external, "external audit content\\n", "utf8");
  linkSync(external, auditPath);

  await assert.rejects(
    new FsAuditTrail(home).append({ occurredAt: new Date(), action: "system.test", entityType: "system" }),
    (error: unknown) => error instanceof Error && "code" in error && error.code === "PATH_SECURITY",
  );
  assert.equal(readFileSync(external, "utf8"), "external audit content\\n");
});

test("un scaffold Pipeline écrit son intention avant mutation et son résultat après", async (context) => {
  const sandbox = mkdtempSync(join(tmpdir(), "arka-norn-pipeline-audit-"));
  context.after(() => rmSync(sandbox, { recursive: true, force: true }));
  const home = resolve(sandbox, "home");
  const featureRoot = resolve(sandbox, "feature");
  const output = resolve(featureRoot, "concept.json");
  mkdirSync(featureRoot);

  const result = await createPipelineRuntime(ROOT, { homeDir: home }).scaffold({
    stepId: "concept", outputPath: output, allowedRoot: featureRoot,
    authorAgentId: "Codex_dev_20260820", featureId: "feature", pipelineId: "arka-norn-default",
  });
  assert.equal(result.outputPath, output);
  assert.equal(existsSync(output), true);
  const events = readFileSync(resolve(home, ".arka-norn", "logs", "audit.jsonl"), "utf8")
    .trim().split("\n").map((line) => JSON.parse(line) as { readonly action: string; readonly outcome: string; readonly entityType: string });
  assert.deepEqual(events.map((event) => [event.action, event.outcome, event.entityType]), [
    ["pipeline.scaffold", "intent", "feature"],
    ["pipeline.scaffold", "success", "feature"],
  ]);
});

test("un scaffold Pipeline ne démarre pas si son intention d'audit échoue", async (context) => {
  const sandbox = mkdtempSync(join(tmpdir(), "arka-norn-pipeline-audit-required-"));
  context.after(() => rmSync(sandbox, { recursive: true, force: true }));
  const output = resolve(sandbox, "concept.json");
  const failingAudit: AuditTrail = {
    async append(_event: AuditEvent): Promise<void> { throw new Error("audit unavailable"); },
    async inspect(): Promise<AuditTrailHealth> { return { ok: false, filePath: "unavailable", sizeBytes: 0, archiveCount: 0, message: "audit unavailable" }; },
  };

  await assert.rejects(
    createPipelineRuntime(ROOT, { auditTrail: failingAudit }).scaffold({
      stepId: "concept", outputPath: output, allowedRoot: sandbox,
      authorAgentId: "Codex_dev_20260820", featureId: "feature", pipelineId: "arka-norn-default",
    }),
    (error: unknown) => error instanceof Error && "code" in error && error.code === "AUDIT_UNAVAILABLE",
  );
  assert.equal(existsSync(output), false);
});

test("le logger masque aussi les secrets imbriqués", () => {
  const lines: string[] = [];
  const logger = new ConsoleLogger({ threshold: "debug", format: "json", sink: { write: (line) => lines.push(line) } });

  logger.info("request", { authorization: "Bearer secret", nested: { password: "hidden", safe: "visible" } });

  assert.equal(lines.length, 1);
  assert.doesNotMatch(lines[0]!, /Bearer secret|hidden/);
  assert.match(lines[0]!, /\[REDACTED\]/);
  assert.match(lines[0]!, /visible/);
});
