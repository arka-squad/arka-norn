/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0
 */
export class CampaignBudget {
    authorization;
    totals = new Map();
    unknownProfiles = new Set();
    constructor(authorization) {
        this.authorization = authorization;
    }
    before(profileId) { return this.decision(profileId); }
    record(profileId, usage) {
        if (usage.measurement === "unknown")
            this.unknownProfiles.add(profileId);
        this.add(profileId, "duration_seconds", usage.durationSeconds);
        this.add(profileId, "calls", usage.calls);
        this.add(profileId, "currency_eur", usage.euros);
        this.add(profileId, "cli_quota_percent", usage.quotaPercent);
        return this.decision(profileId);
    }
    decision(profileId) {
        const props = this.authorization.props;
        const exceeded = props.budgetLimits.filter((limit) => limit.profileId === profileId).map((limit) => ({ metric: limit.metric, used: this.totals.get(key(profileId, limit.metric)) ?? 0, maximum: limit.maximum })).filter((limit) => limit.used >= limit.maximum);
        const measurementUnknown = this.unknownProfiles.has(profileId);
        return Object.freeze({ action: actionFor(props.budgetMode, exceeded.length > 0), exceeded: Object.freeze(exceeded), measurementUnknown });
    }
    add(profileId, metric, value) {
        if (value === undefined)
            return;
        if (!Number.isFinite(value) || value < 0)
            throw new TypeError("Worker usage measurement is invalid.");
        this.totals.set(key(profileId, metric), (this.totals.get(key(profileId, metric)) ?? 0) + value);
    }
}
function actionFor(mode, exceeded) { if (!exceeded)
    return "continue"; if (mode === "observe")
    return "warn"; return mode === "admission" ? "block_new" : "stop"; }
function key(profileId, metric) { return `${profileId}:${metric}`; }
//# sourceMappingURL=orchestration-budget.js.map