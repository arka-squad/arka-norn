/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import assert from "node:assert/strict";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { test } from "node:test";

import { folderPickerCommand, NativeFolderPicker } from "../../src/adapters/outbound/filesystem/native-folder-picker.ts";

test("native folder picker commands keep display text out of executable scripts", () => {
  const title = "Choose a folder; remove everything";
  const mac = folderPickerCommand("darwin", title, "/tmp");
  const windows = folderPickerCommand("win32", title, "C:\\work");
  const linux = folderPickerCommand("linux", title, "/tmp");

  assert.equal(mac.executable, "osascript");
  assert.equal(mac.arguments.includes(title), true);
  assert.equal(mac.arguments[1]?.includes(title), false);
  assert.equal(windows.executable, "powershell.exe");
  assert.equal(windows.arguments.includes(title), true);
  assert.equal(windows.arguments[4]?.includes(title), false);
  assert.deepEqual(linux.arguments.slice(0, 2), ["--file-selection", "--directory"]);
});

test("native folder picker returns a canonical directory and treats an empty selection as cancellation", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "norn-folder-picker-"));
  try {
    const picker = new NativeFolderPicker("darwin", async () => ({ stdout: `${root}\n` }));
    const cancelled = new NativeFolderPicker("darwin", async () => ({ stdout: "" }));
    assert.equal(await picker.pick({ title: "Choose a folder" }), await realpath(root));
    assert.equal(await cancelled.pick({ title: "Choose a folder" }), null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
