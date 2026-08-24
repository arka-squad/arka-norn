/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import type { HumanProfile } from "./human-profile.js";
import { createHumanProfile } from "./human-profile.js";

export const GOVERNANCE_EVENT_KINDS = [
  "decision_opened",
  "decision_resolved",
  "correction_requested",
  "risk_acknowledged",
  "debt_acknowledged",
  "decision_superseded",
] as const;

export type GovernanceEventKind = typeof GOVERNANCE_EVENT_KINDS[number];
export type GovernanceTargetType = "project" | "feature" | "step" | "document" | "finding" | "debt";

export interface GovernanceTarget {
  readonly type: GovernanceTargetType;
  readonly id: string;
  readonly featureId?: string;
  readonly jsonPointer?: string;
}

export interface GovernanceEvent {
  readonly id: string;
  readonly kind: GovernanceEventKind;
  readonly projectId: string;
  readonly targets: readonly GovernanceTarget[];
  readonly reason: string;
  readonly occurredAt: string;
  readonly author: HumanProfile;
  readonly resolvesEventId?: string;
  readonly supersedesEventId?: string;
}

const SAFE_ID = /^[a-z0-9][a-z0-9._-]{0,127}$/;
const EVENT_ID = /^gov_[a-f0-9]{24}$/;

export function createGovernanceEvent(value: GovernanceEvent): GovernanceEvent {
  if (!EVENT_ID.test(value.id)) throw new Error("Governance event id is invalid.");
  if (!GOVERNANCE_EVENT_KINDS.includes(value.kind)) throw new Error("Governance event kind is invalid.");
  if (!SAFE_ID.test(value.projectId)) throw new Error("Governance Project id is invalid.");
  if (!Array.isArray(value.targets) || value.targets.length === 0 || value.targets.length > 20) {
    throw new Error("Governance event must target 1..20 entities.");
  }
  const targets = value.targets.map(validateTarget);
  const reason = cleanText(value.reason, "reason", 2000);
  const occurredAt = new Date(value.occurredAt);
  if (Number.isNaN(occurredAt.getTime()) || occurredAt.toISOString() !== value.occurredAt) {
    throw new Error("Governance event date is invalid.");
  }
  validateOptionalId(value.resolvesEventId, "resolvesEventId");
  validateOptionalId(value.supersedesEventId, "supersedesEventId");
  return Object.freeze({
    id: value.id,
    kind: value.kind,
    projectId: value.projectId,
    targets: Object.freeze(targets),
    reason,
    occurredAt: value.occurredAt,
    author: createHumanProfile(value.author),
    ...(value.resolvesEventId === undefined ? {} : { resolvesEventId: value.resolvesEventId }),
    ...(value.supersedesEventId === undefined ? {} : { supersedesEventId: value.supersedesEventId }),
  });
}

function validateTarget(value: GovernanceTarget): GovernanceTarget {
  const types: readonly GovernanceTargetType[] = ["project", "feature", "step", "document", "finding", "debt"];
  if (!types.includes(value.type) || !SAFE_ID.test(value.id)) throw new Error("Governance target is invalid.");
  if (value.featureId !== undefined && !SAFE_ID.test(value.featureId)) throw new Error("Governance target Feature id is invalid.");
  if (value.jsonPointer !== undefined && !isJsonPointer(value.jsonPointer)) throw new Error("Governance JSON pointer is invalid.");
  return Object.freeze({
    type: value.type,
    id: value.id,
    ...(value.featureId === undefined ? {} : { featureId: value.featureId }),
    ...(value.jsonPointer === undefined ? {} : { jsonPointer: value.jsonPointer }),
  });
}

function isJsonPointer(value: string): boolean {
  return value === "" || (value.startsWith("/") && value.length <= 1000 && !/[\u0000-\u001f\u007f]/.test(value));
}

function validateOptionalId(value: string | undefined, field: string): void {
  if (value !== undefined && !EVENT_ID.test(value)) throw new Error(`Governance ${field} is invalid.`);
}

function cleanText(value: string, field: string, max: number): string {
  const text = value.trim();
  if (text.length === 0 || text.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) {
    throw new Error(`Governance ${field} is invalid.`);
  }
  return text;
}
