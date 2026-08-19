import os from "node:os";

import { parseStrictArguments } from "../dist/adapters/inbound/cli/strict-arguments.js";
import { createDoctorRuntime } from "../dist/composition/doctor-runtime.js";
import { readEnv } from "../dist/composition/env.js";

export async function runDoctor(argv) {
  const json = argv.includes("--json");
  let parsed;
  try {
    parsed = parseStrictArguments(argv, {
      options: { json: "boolean", repair: "boolean", apply: "boolean" },
      minPositionals: 0,
      maxPositionals: 0,
      requires: { apply: ["repair"] },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (json) process.stdout.write(`${JSON.stringify({ schemaVersion: 1, command: "doctor", ok: false, data: null, errors: [message], warnings: [] })}\n`);
    else console.error(`Usage : arka-norn doctor [--json] [--repair [--apply]]\nERREUR — ${message}`);
    process.exitCode = 64;
    return;
  }
  const repair = parsed.booleans.has("repair");
  const apply = parsed.booleans.has("apply");
  const env = readEnv(process.env, process.cwd());
  const report = await createDoctorRuntime(env.homeDir ?? os.homedir(), env.cwd).run({ repair, apply });
  if (json) {
    process.stdout.write(`${JSON.stringify({ schemaVersion: 1, command: "doctor", ok: report.ok, data: report, errors: [], warnings: [] })}\n`);
  } else {
    console.log(`Doctor — ${report.mode}`);
    for (const check of report.checks) console.log(`${check.status.toUpperCase().padEnd(4)} ${check.id} — ${check.message}`);
    for (const repairResult of report.repairs) console.log(`${repairResult.applied ? "APPLIED" : "PLANNED"} ${repairResult.target}`);
  }
  process.exitCode = report.ok ? 0 : 3;
}
