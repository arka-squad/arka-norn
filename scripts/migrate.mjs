#!/usr/bin/env node
import { pathToFileURL } from "node:url";

import { runMigrateCommand } from "../dist/adapters/inbound/cli/migrate-cli.js";
import { readEnv } from "../dist/composition/env.js";

export async function runMigrate(argv) {
  const env = readEnv(process.env, process.cwd());
  const result = await runMigrateCommand(argv, { cwd: env.cwd });
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  process.exitCode = result.code;
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await runMigrate(process.argv.slice(2));
