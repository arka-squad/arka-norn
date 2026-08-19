import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

import { FsPathPolicy } from "../../src/adapters/outbound/filesystem/fs-path-policy.ts";
import { DomainError } from "../../src/domain/errors.ts";

test("PathPolicy canonise un enfant futur et refuse le traversal", async (context) => {
  const sandbox = mkdtempSync(join(tmpdir(), "arka-norn-path-"));
  context.after(() => rmSync(sandbox, { recursive: true, force: true }));
  const project = resolve(sandbox, "project");
  mkdirSync(project);
  const policy = new FsPathPolicy();

  const result = await policy.assertContained(project, resolve(project, "features", "future"));
  const canonicalProject = await policy.canonicalDirectory(project);
  assert.equal(result.parent, canonicalProject);
  assert.equal(result.child, resolve(canonicalProject, "features", "future"));
  await assert.rejects(policy.assertContained(project, resolve(project, "..", "escape")), isPathSecurityError);
});

test("PathPolicy refuse une racine et une sortie symboliques", async (context) => {
  const sandbox = mkdtempSync(join(tmpdir(), "arka-norn-symlink-"));
  context.after(() => rmSync(sandbox, { recursive: true, force: true }));
  const real = resolve(sandbox, "real");
  const link = resolve(sandbox, "link");
  mkdirSync(real);
  symlinkSync(real, link, "dir");
  const policy = new FsPathPolicy();

  await assert.rejects(policy.canonicalDirectory(link), isPathSecurityError);
  await assert.rejects(policy.assertWritableFile(resolve(link, "document.json"), real), isPathSecurityError);
});

function isPathSecurityError(error: unknown): boolean {
  return error instanceof DomainError && error.code === "PATH_SECURITY";
}
