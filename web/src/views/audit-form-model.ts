import { AUDIT_MODULE_CATALOG } from "../../../src/domain/audit/module-catalog";
import type { AuditDepth, AuditMode, AuditModuleId } from "../../../src/domain/audit/audit-types";
import type { MessageKey } from "../i18n/i18n";

export type AuditPurpose = "health" | "release" | "discovery";

interface AuditPurposeDefaults {
  readonly mode: AuditMode;
  readonly depth: Extract<AuditDepth, "inventory" | "static">;
  readonly modules: readonly AuditModuleId[];
}

export const AUDIT_PURPOSE_DEFAULTS: Readonly<Record<AuditPurpose, AuditPurposeDefaults>> = Object.freeze({
  health: {
    mode: "audit",
    depth: "static",
    modules: ["M01", "M02", "M04", "M05", "M06", "M07"],
  },
  release: {
    mode: "audit",
    depth: "static",
    modules: ["M01", "M02", "M04", "M05", "M06", "M08"],
  },
  discovery: {
    mode: "discovery",
    depth: "inventory",
    modules: ["M01", "M02", "M03", "M04", "M09", "M10", "M11"],
  },
});

export const USER_AUDIT_MODULES = AUDIT_MODULE_CATALOG.filter((module) => module.id !== "M00");

const DISCOVERY_FIRST_MODULES = new Set<AuditModuleId>(["M03", "M09", "M10", "M11"]);

const STATUS_MESSAGE_KEYS: Readonly<Record<string, MessageKey>> = {
  planned: "web.audits.status.planned",
  collecting: "web.audits.status.collecting",
  analyzing: "web.audits.status.analyzing",
  completed: "web.audits.status.completed",
  partial: "web.audits.status.partial",
  blocked: "web.audits.status.blocked",
  failed: "web.audits.status.failed",
  cancelled: "web.audits.status.cancelled",
  interrupted: "web.audits.status.interrupted",
};

const MODE_MESSAGE_KEYS: Readonly<Record<string, MessageKey>> = {
  audit: "web.audits.mode.audit",
  discovery: "web.audits.mode.discovery",
  mixed: "web.audits.mode.mixed",
};

export function moduleIntents(
  mode: AuditMode,
  modules: readonly AuditModuleId[],
): ReadonlyMap<AuditModuleId, "discover" | "audit"> {
  if (mode !== "mixed") {
    const intent = mode === "discovery" ? "discover" : "audit";
    return new Map(modules.map((moduleId) => [moduleId, intent]));
  }

  if (modules.length < 2) throw new Error("Mixed audit mode requires at least two selected domains.");

  const discoveryModule = modules.find((moduleId) => DISCOVERY_FIRST_MODULES.has(moduleId)) ?? modules[0];
  return new Map(modules.map((moduleId) => [moduleId, moduleId === discoveryModule ? "discover" : "audit"]));
}

export function humanSelectedModules(modules: readonly string[]): typeof USER_AUDIT_MODULES {
  const selected = new Set(modules);
  return USER_AUDIT_MODULES.filter((module) => selected.has(module.id));
}

export function auditStatusMessageKey(status: string): MessageKey | undefined {
  return STATUS_MESSAGE_KEYS[status];
}

export function auditModeMessageKey(mode: string): MessageKey | undefined {
  return MODE_MESSAGE_KEYS[mode];
}
