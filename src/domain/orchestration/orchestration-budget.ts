/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0
 */

import type { BudgetLimit, BudgetMode, RunAuthorization } from "./orchestration-plan.js";
import type { TaskWorkerUsage } from "../../ports/outbound/task-worker.js";

export interface BudgetDecision {
  readonly action: "continue" | "block_new" | "stop" | "warn";
  readonly exceeded: readonly { readonly metric: BudgetLimit["metric"]; readonly used: number; readonly maximum: number }[];
  readonly measurementUnknown: boolean;
}

export class CampaignBudget {
  private readonly totals = new Map<string, number>();
  private readonly unknownProfiles = new Set<string>();

  public constructor(private readonly authorization: RunAuthorization) {}

  public before(profileId: string): BudgetDecision { return this.decision(profileId); }

  public record(profileId: string, usage: TaskWorkerUsage): BudgetDecision {
    if (usage.measurement === "unknown") this.unknownProfiles.add(profileId);
    this.add(profileId, "duration_seconds", usage.durationSeconds);
    this.add(profileId, "calls", usage.calls);
    this.add(profileId, "currency_eur", usage.euros);
    this.add(profileId, "cli_quota_percent", usage.quotaPercent);
    return this.decision(profileId);
  }

  private decision(profileId: string): BudgetDecision {
    const props = this.authorization.props;
    const exceeded = props.budgetLimits.filter((limit) => limit.profileId === profileId).map((limit) => ({ metric: limit.metric, used: this.totals.get(key(profileId, limit.metric)) ?? 0, maximum: limit.maximum })).filter((limit) => limit.used >= limit.maximum);
    const measurementUnknown = this.unknownProfiles.has(profileId);
    return Object.freeze({ action: actionFor(props.budgetMode, exceeded.length > 0), exceeded: Object.freeze(exceeded), measurementUnknown });
  }

  private add(profileId: string, metric: BudgetLimit["metric"], value: number | undefined): void {
    if (value === undefined) return;
    if (!Number.isFinite(value) || value < 0) throw new TypeError("Worker usage measurement is invalid.");
    this.totals.set(key(profileId, metric), (this.totals.get(key(profileId, metric)) ?? 0) + value);
  }
}

function actionFor(mode: BudgetMode, exceeded: boolean): BudgetDecision["action"] { if (!exceeded) return "continue"; if (mode === "observe") return "warn"; return mode === "admission" ? "block_new" : "stop"; }
function key(profileId: string, metric: BudgetLimit["metric"]): string { return `${profileId}:${metric}`; }
