/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0
 *
 * Provides a stub Agent host on PATH so host-coupled CLI tests behave the
 * same whether or not a real codex/claude binary is installed (for example
 * in CI, where neither exists).
 */

import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { delimiter, join } from "node:path";
import { platform } from "node:os";

export function stubHostPath(directory: string, host = "codex"): string {
  const binDir = join(directory, "stub-host-bin");
  mkdirSync(binDir, { recursive: true });
  if (platform() === "win32") {
    writeFileSync(join(binDir, `${host}.cmd`), "@echo stub-host\r\n");
  } else {
    const command = join(binDir, host);
    writeFileSync(command, "#!/bin/sh\necho stub-host\n");
    chmodSync(command, 0o755);
  }
  return binDir;
}

export function prependStubHost(directory: string, host = "codex"): string {
  const binDir = stubHostPath(directory, host);
  const current = process.env.PATH ?? "";
  return current.length > 0 ? `${binDir}${delimiter}${current}` : binDir;
}

