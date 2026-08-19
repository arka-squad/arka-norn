import os from "node:os";

import { createDoctorRuntime } from "../dist/composition/doctor-runtime.js";

export async function runDoctor(argv) {
  const json = argv.includes("--json");
  const repair = argv.includes("--repair");
  const apply = argv.includes("--apply");
  if (apply && !repair) {
    console.error("Usage : arka-norn doctor [--json] [--repair [--apply]]");
    process.exitCode = 64;
    return;
  }
  const report = await createDoctorRuntime(os.homedir()).run({ repair, apply });
  if (json) {
    process.stdout.write(`${JSON.stringify({ schemaVersion: 1, command: "doctor", ok: report.ok, data: report, errors: [], warnings: [] })}\n`);
  } else {
    console.log(`Doctor — ${report.mode}`);
    for (const check of report.checks) console.log(`${check.status.toUpperCase().padEnd(4)} ${check.id} — ${check.message}`);
    for (const repairResult of report.repairs) console.log(`${repairResult.applied ? "APPLIED" : "PLANNED"} ${repairResult.target}`);
  }
  process.exitCode = report.ok ? 0 : 3;
}
