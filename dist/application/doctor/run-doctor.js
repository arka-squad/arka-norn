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
export function createDoctorUseCase(adapter) {
    return {
        async run(input = {}) {
            const repair = input.repair === true;
            const apply = repair && input.apply === true;
            const [projects, features] = await Promise.all([
                adapter.inspectIndex("projects", repair, apply),
                adapter.inspectIndex("features", repair, apply),
            ]);
            const runtime = await adapter.inspectRuntime(repair, apply);
            const results = [projects, features, ...runtime];
            const checks = results.map((result) => result.check);
            const summary = {
                pass: checks.filter((check) => check.status === "pass").length,
                warn: checks.filter((check) => check.status === "warn").length,
                fail: checks.filter((check) => check.status === "fail").length,
            };
            return {
                schemaVersion: 1,
                ok: checks.every((check) => check.status !== "fail"),
                mode: repair ? (apply ? "repair-apply" : "repair-dry-run") : "inspect",
                checks,
                repairs: results.flatMap((result) => result.repair === undefined ? [] : [result.repair]),
                summary,
            };
        },
    };
}
//# sourceMappingURL=run-doctor.js.map