/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0
 */

import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, renameSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { test } from "node:test";

import { FsProjectDraftStore } from "../../src/adapters/outbound/filesystem/fs-project-draft-store.ts";

const at = new Date("2026-08-26T12:00:00.000Z");

test("le store ProjectDraft crée hors dépôt puis reprend par racine canonique et empreinte", async (context) => {
  const sandbox = mkdtempSync(resolve(tmpdir(), "norn-project-draft-"));
  const home = resolve(sandbox, "home");
  const root = resolve(sandbox, "product");
  mkdirSync(root, { recursive: true });
  context.after(() => rmSync(sandbox, { recursive: true, force: true }));
  const store = new FsProjectDraftStore(home);

  const created = await store.resolve({ id: "product-draft", name: "Product", root, now: at });
  assert.equal(created.resumed, false);
  assert.equal(created.draft.materialization, "draft");
  assert.equal(existsSync(resolve(root, ".arka-norn")), false);
  assert.equal(existsSync(resolve(home, ".arka-norn", "framing-projects", "product-draft", "draft.json")), true);

  const resumed = await store.resolve({ id: "ignored-new-id", name: "Ignored", root: resolve(root, "."), now: at });
  assert.equal(resumed.resumed, true);
  assert.equal(resumed.draft.id, "product-draft");
  assert.equal((await store.verify("product-draft")).rootFingerprint, created.draft.rootFingerprint);
});

test("le store refuse une collision d'identifiant et détecte déplacement ou remplacement de racine", async (context) => {
  const sandbox = mkdtempSync(resolve(tmpdir(), "norn-project-draft-identity-"));
  const home = resolve(sandbox, "home");
  const first = resolve(sandbox, "first");
  const second = resolve(sandbox, "second");
  mkdirSync(first, { recursive: true });
  mkdirSync(second, { recursive: true });
  context.after(() => rmSync(sandbox, { recursive: true, force: true }));
  const store = new FsProjectDraftStore(home);

  await store.resolve({ id: "same-id", name: "First", root: first, now: at });
  await assert.rejects(store.resolve({ id: "same-id", name: "Second", root: second, now: at }), /identifier collision/u);

  const moved = resolve(sandbox, "moved");
  renameSync(first, moved);
  await assert.rejects(store.verify("same-id"), /moved or disappeared/u);

  mkdirSync(first);
  await assert.rejects(store.verify("same-id"), /identity changed/u);
});
