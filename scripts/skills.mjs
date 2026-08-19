#!/usr/bin/env node
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runSkillsCommand } from "../dist/adapters/inbound/cli/skills-cli.js";
import { readEnv } from "../dist/composition/env.js";

const FRAMEWORK_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function runSkills(argv) {
  const env = readEnv(process.env, process.cwd());
  const result = runSkillsCommand(argv, { cwd: env.cwd, homeDir: env.homeDir ?? os.homedir(), frameworkRoot: FRAMEWORK_ROOT });
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  process.exitCode = result.code;
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) runSkills(process.argv.slice(2));
