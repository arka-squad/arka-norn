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
import { createDoctorRuntime } from "../../../composition/doctor-runtime.js";
import { translate } from "../../../application/localization/locale.js";
import { CliUsageError, parseStrictArguments } from "./strict-arguments.js";
import { jsonEnvelope } from "./cli-envelope.js";
export async function runDoctorCommand(argv, context) {
    const json = argv.includes("--json");
    try {
        const parsed = parseStrictArguments(argv, {
            options: { json: "boolean", repair: "boolean", apply: "boolean" },
            minPositionals: 0,
            maxPositionals: 0,
            requires: { apply: ["repair"] },
        });
        const report = await createDoctorRuntime(context.homeDir, context.cwd).run({
            repair: parsed.booleans.has("repair"),
            apply: parsed.booleans.has("apply"),
        });
        if (json) {
            return { code: report.ok ? 0 : 3, stdout: jsonEnvelope({ command: "doctor", ok: report.ok, data: report }), stderr: "" };
        }
        const checks = report.checks.map((check) => `${check.status.toUpperCase().padEnd(4)} ${check.id} — ${check.message}`);
        const repairs = report.repairs.map((repair) => `${repair.applied ? "APPLIED" : "PLANNED"} ${repair.target}`);
        return { code: report.ok ? 0 : 3, stdout: [`Doctor — ${report.mode}`, ...checks, ...repairs].join("\n") + "\n", stderr: "" };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const code = error instanceof CliUsageError ? 64 : 70;
        return json
            ? { code, stdout: jsonEnvelope({ command: "doctor", ok: false, data: null, errors: [message], errorCode: "doctor_failed" }), stderr: "" }
            : { code, stdout: "", stderr: `${code === 64 ? `${translate("cli.doctor.usage")}\n` : ""}${translate("common.error", { message })}\n` };
    }
}
//# sourceMappingURL=doctor-cli.js.map