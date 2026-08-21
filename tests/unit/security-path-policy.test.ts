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
