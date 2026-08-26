/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0
 */
export const CAMPAIGN_EVENT_KINDS = [
    "campaign_planned",
    "campaign_authorized",
    "task_prepared",
    "task_started",
    "task_succeeded",
    "task_failed",
    "task_blocked",
    "task_budget_stopped",
    "task_cancelled",
    "campaign_blocked",
    "campaign_awaiting_application",
    "campaign_completed",
];
export function validateCampaignEvent(value) {
    if (value.schemaVersion !== 1 || !safeId(value.campaignId, 120) || !Number.isInteger(value.revision) || value.revision < 1)
        throw new TypeError("Campaign event identity is invalid.");
    if (!CAMPAIGN_EVENT_KINDS.includes(value.kind))
        throw new TypeError("Campaign event kind is invalid.");
    if (value.taskId !== undefined && !safeId(value.taskId, 100))
        throw new TypeError("Campaign event task is invalid.");
    if (taskEvent(value.kind) !== (value.taskId !== undefined))
        throw new TypeError("Task campaign events require exactly one task id.");
    if (value.code !== undefined && !safeId(value.code, 100))
        throw new TypeError("Campaign event code is invalid.");
    if (!/^[a-f0-9]{64}$/u.test(value.fingerprint) || !(value.at instanceof Date) || Number.isNaN(value.at.getTime()))
        throw new TypeError("Campaign event fingerprint or timestamp is invalid.");
}
export function projectCampaignEvents(events) {
    if (events.length === 0)
        return undefined;
    const ordered = [...events].sort((left, right) => left.revision - right.revision);
    const campaignId = ordered[0].campaignId;
    const tasks = {};
    let status = "planned";
    for (let index = 0; index < ordered.length; index += 1) {
        const event = ordered[index];
        validateCampaignEvent(event);
        if (event.campaignId !== campaignId || event.revision !== index + 1)
            throw new TypeError("Campaign event journal is not contiguous.");
        switch (event.kind) {
            case "campaign_planned":
                if (index !== 0)
                    throw new TypeError("Campaign may only be planned once.");
                status = "planned";
                break;
            case "campaign_authorized":
                status = "authorized";
                break;
            case "task_prepared":
                tasks[event.taskId] = "prepared";
                status = "running";
                break;
            case "task_started":
                tasks[event.taskId] = "running";
                status = "running";
                break;
            case "task_succeeded":
                tasks[event.taskId] = "succeeded";
                status = "running";
                break;
            case "task_failed":
                tasks[event.taskId] = "failed";
                status = "running";
                break;
            case "task_blocked":
                tasks[event.taskId] = "blocked";
                status = "blocked";
                break;
            case "task_budget_stopped":
                tasks[event.taskId] = "budget_stopped";
                status = "blocked";
                break;
            case "task_cancelled":
                tasks[event.taskId] = "cancelled";
                break;
            case "campaign_blocked":
                status = "blocked";
                break;
            case "campaign_awaiting_application":
                status = "awaiting_application";
                break;
            case "campaign_completed":
                status = "completed";
                break;
        }
    }
    const values = Object.values(tasks);
    return Object.freeze({
        campaignId,
        revision: ordered.length,
        status,
        tasks: Object.freeze({ ...tasks }),
        progress: Object.freeze({
            attempted: values.filter((value) => !["prepared", "cancelled"].includes(value)).length,
            succeeded: values.filter((value) => value === "succeeded").length,
            failed: values.filter((value) => ["failed", "blocked", "budget_stopped"].includes(value)).length,
        }),
    });
}
function taskEvent(kind) { return kind.startsWith("task_"); }
function safeId(value, maximum) { return value.length > 0 && value.length <= maximum && /^[a-z0-9][a-z0-9._-]*$/u.test(value); }
//# sourceMappingURL=orchestration-event.js.map