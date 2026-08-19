#!/usr/bin/env node
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runStatusCommand } from "../dist/adapters/inbound/cli/pipeline-cli.js";
import { readEnv } from "../dist/composition/env.js";

const FRAMEWORK_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export async function runStatus(argv) {
  const env = readEnv(process.env, process.cwd());
  return present(await runStatusCommand(argv, { cwd: env.cwd, homeDir: env.homeDir ?? os.homedir(), frameworkRoot: FRAMEWORK_ROOT }));
}

function present(result) {
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  process.exitCode = result.code;
  return result;
}
