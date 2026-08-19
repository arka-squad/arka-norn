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