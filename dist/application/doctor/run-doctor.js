export function createDoctorUseCase(adapter) {
    return {
        async run(input = {}) {
            const repair = input.repair === true;
            const apply = repair && input.apply === true;
            const results = await Promise.all([
                adapter.inspectIndex("projects", repair, apply),
                adapter.inspectIndex("features", repair, apply),
            ]);
            const checks = results.map((result) => result.check);
            return {
                schemaVersion: 1,
                ok: checks.every((check) => check.status !== "fail"),
                mode: repair ? (apply ? "repair-apply" : "repair-dry-run") : "inspect",
                checks,
                repairs: results.flatMap((result) => result.repair === undefined ? [] : [result.repair]),
            };
        },
    };
}
//# sourceMappingURL=run-doctor.js.map