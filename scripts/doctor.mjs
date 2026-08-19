#!/usr/bin/env node
import os from "node:os";

import { runDoctorCommand } from "../dist/adapters/inbound/cli/doctor-cli.js";
import { readEnv } from "../dist/composition/env.js";

export async function runDoctor(argv) {
  const env = readEnv(process.env, process.cwd());
  return present(await runDoctorCommand(argv, { cwd: env.cwd, homeDir: env.homeDir ?? os.homedir() }));
}

function present(result) {
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  process.exitCode = result.code;
  return result;
}
