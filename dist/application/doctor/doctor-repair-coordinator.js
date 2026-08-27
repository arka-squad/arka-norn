/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0
 */
import { createHash } from "node:crypto";
export class DoctorRepairPlanChangedError extends Error {
    plan;
    constructor(plan) {
        super("Doctor repair plan changed or expired.");
        this.plan = plan;
    }
}
export function createDoctorRepairCoordinator(doctor, options = {}) {
    const now = options.now ?? (() => new Date());
    const ttlMs = options.ttlMs ?? 5 * 60 * 1_000;
    const exclusive = options.exclusive ?? immediateExclusive;
    const plans = new Map();
    const createPlan = async () => {
        const report = repairPreview(await doctor.run({ repair: true }));
        const fingerprint = fingerprintReport(report);
        const expiresAt = new Date(now().getTime() + ttlMs);
        plans.set(fingerprint, expiresAt.getTime());
        return { report, fingerprint, expiresAt: expiresAt.toISOString() };
    };
    return {
        inspect: async () => inspection(await doctor.run()),
        preview: () => exclusive(createPlan),
        apply: (input) => exclusive(async () => {
            const expectedExpiry = plans.get(input.fingerprint);
            const current = await createPlan();
            const currentTime = now().getTime();
            if (expectedExpiry === undefined || expectedExpiry <= currentTime || current.fingerprint !== input.fingerprint) {
                throw new DoctorRepairPlanChangedError(current);
            }
            plans.delete(input.fingerprint);
            const repair = repairApply(await doctor.run({ repair: true, apply: true }));
            const report = inspection(await doctor.run());
            return { repair, report };
        }),
    };
}
async function immediateExclusive(operation) {
    return operation();
}
function fingerprintReport(report) {
    const canonical = {
        checks: report.checks.map((check) => ({
            id: check.id,
            status: check.status,
            message: check.message,
            repairable: check.repairable,
        })),
        repairs: report.repairs.map((repair) => ({ target: repair.target, action: repair.action })),
    };
    return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}
function inspection(report) {
    if (report.mode !== "inspect")
        throw new Error("Doctor inspection returned an unexpected mode.");
    return report;
}
function repairPreview(report) {
    if (report.mode !== "repair-dry-run")
        throw new Error("Doctor repair preview returned an unexpected mode.");
    return report;
}
function repairApply(report) {
    if (report.mode !== "repair-apply")
        throw new Error("Doctor repair apply returned an unexpected mode.");
    return report;
}
//# sourceMappingURL=doctor-repair-coordinator.js.map