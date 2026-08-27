/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0
 */

export const CAPABILITY_IDS = [
  "framing.start",
  "framing.resume",
  "project.set_orchestration_mode",
  "project.scan",
  "project.forget",
  "agent.register",
  "agent.select",
  "agent.replace",
  "agent.deactivate",
  "doctor.inspect",
  "doctor.repair_preview",
  "doctor.repair_apply",
  "orchestration.preview",
  "orchestration.authorize",
  "orchestration.apply",
] as const;

export type CapabilityId = (typeof CAPABILITY_IDS)[number];
export type CapabilityAuthority = "read" | "bounded_mutation" | "human_confirmation" | "expert_authorization";
export type CapabilitySurface = "cli" | "tui" | "web";
export type CapabilityInvalidationScope =
  | "projects"
  | "project"
  | "feature"
  | "documents"
  | "governance"
  | "audits"
  | "agents"
  | "orchestration";

export interface CapabilityDescriptor {
  readonly id: CapabilityId;
  readonly authority: CapabilityAuthority;
  readonly surfaces: readonly CapabilitySurface[];
  readonly preconditions: readonly string[];
  readonly invalidations: readonly CapabilityInvalidationScope[];
}

export interface CapabilityCatalog {
  readonly schemaVersion: 1;
  readonly capabilities: readonly CapabilityDescriptor[];
}

const DEFINITIONS: readonly CapabilityDescriptor[] = [
  descriptor("framing.start", "bounded_mutation", ["cli", "tui", "web"], ["project_root_resolvable"], ["projects", "project"]),
  descriptor("framing.resume", "read", ["cli", "tui", "web"], ["framing_plan_exists"], []),
  descriptor("project.set_orchestration_mode", "human_confirmation", ["cli", "tui", "web"], ["project_materialized", "project_revision_current"], ["project", "orchestration"]),
  descriptor("project.scan", "bounded_mutation", ["cli", "tui"], ["project_materialized"], ["project", "feature"]),
  descriptor("project.forget", "human_confirmation", ["cli", "tui"], ["project_materialized", "explicit_confirmation"], ["projects"]),
  descriptor("agent.register", "bounded_mutation", ["cli", "tui", "web"], ["project_materialized", "agent_registry_revision_current"], ["agents"]),
  descriptor("agent.select", "bounded_mutation", ["cli", "tui", "web"], ["agent_active", "agent_registry_revision_current"], ["agents", "project"]),
  descriptor("agent.replace", "human_confirmation", ["cli", "tui", "web"], ["agent_active", "agent_registry_revision_current"], ["agents", "project"]),
  descriptor("agent.deactivate", "human_confirmation", ["cli", "tui", "web"], ["agent_registry_revision_current", "linked_session_confirmation"], ["agents", "project"]),
  descriptor("doctor.inspect", "read", ["cli", "tui", "web"], [], []),
  descriptor("doctor.repair_preview", "read", ["cli", "tui", "web"], ["doctor_findings_exist"], []),
  descriptor("doctor.repair_apply", "human_confirmation", ["cli", "tui", "web"], ["exact_repair_preview", "explicit_confirmation"], ["projects", "project", "feature", "agents"]),
  descriptor("orchestration.preview", "read", ["cli"], ["project_materialized", "framing_plan_published"], []),
  descriptor("orchestration.authorize", "expert_authorization", ["cli"], ["orchestration_preview_current", "execution_profiles_admissible"], ["orchestration"]),
  descriptor("orchestration.apply", "human_confirmation", ["cli"], ["application_candidate_verified", "application_gate_satisfied"], ["project", "feature", "orchestration"]),
];

export const CAPABILITY_CATALOG: CapabilityCatalog = createCapabilityCatalog(DEFINITIONS);

export function capabilityAvailableOn(id: CapabilityId, surface: CapabilitySurface): boolean {
  return CAPABILITY_CATALOG.capabilities.find((capability) => capability.id === id)?.surfaces.includes(surface) === true;
}

function descriptor(
  id: CapabilityId,
  authority: CapabilityAuthority,
  surfaces: readonly CapabilitySurface[],
  preconditions: readonly string[],
  invalidations: readonly CapabilityInvalidationScope[],
): CapabilityDescriptor {
  return { id, authority, surfaces, preconditions, invalidations };
}

function createCapabilityCatalog(definitions: readonly CapabilityDescriptor[]): CapabilityCatalog {
  if (definitions.length !== CAPABILITY_IDS.length) throw new Error("Capability registry is incomplete.");
  const ids = new Set<CapabilityId>();
  const capabilities = definitions.map((definition) => {
    if (!CAPABILITY_IDS.includes(definition.id) || ids.has(definition.id)) throw new Error(`Duplicate or unknown capability: ${definition.id}.`);
    if (definition.surfaces.length === 0 || new Set(definition.surfaces).size !== definition.surfaces.length) {
      throw new Error(`Capability ${definition.id} must declare unique surfaces.`);
    }
    for (const precondition of definition.preconditions) {
      if (!/^[a-z][a-z0-9_]{1,63}$/u.test(precondition)) throw new Error(`Capability ${definition.id} has an invalid precondition.`);
    }
    if (new Set(definition.invalidations).size !== definition.invalidations.length) {
      throw new Error(`Capability ${definition.id} must declare unique invalidations.`);
    }
    ids.add(definition.id);
    return Object.freeze({
      ...definition,
      surfaces: Object.freeze([...definition.surfaces]),
      preconditions: Object.freeze([...definition.preconditions]),
      invalidations: Object.freeze([...definition.invalidations]),
    });
  });
  for (const id of CAPABILITY_IDS) if (!ids.has(id)) throw new Error(`Capability registry is missing ${id}.`);
  return Object.freeze({ schemaVersion: 1, capabilities: Object.freeze(capabilities) });
}
