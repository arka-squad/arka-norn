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
