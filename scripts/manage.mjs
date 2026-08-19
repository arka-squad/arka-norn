import os from "node:os";

import { runManagementCommand } from "../dist/adapters/inbound/cli/management-cli.js";
import { readEnv } from "../dist/composition/env.js";

export async function runManage(argv) {
  const env = readEnv(process.env, process.cwd());
  const result = await runManagementCommand(argv, { homeDir: env.homeDir ?? os.homedir(), cwd: env.cwd });
  if (result.stdout.length > 0) process.stdout.write(result.stdout);
  if (result.stderr.length > 0) process.stderr.write(result.stderr);
  process.exitCode = result.code;
}
