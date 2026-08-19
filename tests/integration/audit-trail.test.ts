import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

import { FsAuditTrail } from "../../src/adapters/outbound/filesystem/fs-audit-trail.ts";
import { ConsoleLogger } from "../../src/adapters/outbound/system/console-logger.ts";
import { createManagementRuntime } from "../../src/composition/management-runtime.ts";
import { ProjectId } from "../../src/domain/project/project-id.ts";
import type { AuditEvent, AuditTrail, AuditTrailHealth } from "../../src/ports/outbound/audit-trail.ts";

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

test("le logger masque aussi les secrets imbriqués", () => {
  const lines: string[] = [];
  const logger = new ConsoleLogger({ threshold: "debug", format: "json", sink: { write: (line) => lines.push(line) } });

  logger.info("request", { authorization: "Bearer secret", nested: { password: "hidden", safe: "visible" } });

  assert.equal(lines.length, 1);
  assert.doesNotMatch(lines[0]!, /Bearer secret|hidden/);
  assert.match(lines[0]!, /\[REDACTED\]/);
  assert.match(lines[0]!, /visible/);
});
