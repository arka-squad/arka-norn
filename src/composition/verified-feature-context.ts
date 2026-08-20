import { existsSync } from "node:fs";
import { isAbsolute, relative, sep } from "node:path";

import { agentRegistryPath } from "../adapters/outbound/filesystem/fs-agent-registry-store.js";
import { InvalidAgentRegistryError, PathSecurityError } from "../domain/errors.js";
import type { Feature } from "../domain/feature/feature.js";
import type { Project } from "../domain/project/project.js";
import type { ForAgents } from "../ports/inbound/for-agents.js";
import type { PipelineAuthorAuthorization } from "../ports/inbound/for-pipeline.js";
import type { ForProjects } from "../ports/inbound/for-projects.js";

export interface VerifiedFeatureContext {
  readonly project: Project;
  readonly authorRegistry: readonly PipelineAuthorAuthorization[];
}

/**
 * Charge le contexte minimum nécessaire à toute inspection d'une Feature gérée.
 * Les markers et index sont non fiables : la racine Feature et le registre sont
 * donc vérifiés avant de construire un rapport Pipeline.
 */
export async function loadVerifiedFeatureContext(
  feature: Feature,
  deps: { readonly projects: ForProjects; readonly agents: ForAgents },
): Promise<VerifiedFeatureContext> {
  const project = await deps.projects.show(feature.projectId);
  if (!project.id.equals(feature.projectId)) {
    throw new PathSecurityError(project.root, `project marker identity does not match Feature project ${feature.projectId.value}`);
  }
  assertFeatureContainedInProject(feature, project);
  const registryPath = agentRegistryPath(project.root);
  if (!existsSync(registryPath)) {
    throw new InvalidAgentRegistryError(registryPath, "missing; cannot verify document authors for a managed Feature");
  }
  const agents = await deps.agents.list(project);
  return {
    project,
    authorRegistry: agents.map((agent) => ({
      id: agent.id.value,
      active: agent.active,
      authorized: agent.coversFeature(feature.id),
    })),
  };
}

export function assertFeatureContainedInProject(feature: Feature, project: Project): void {
  const featureRelative = relative(project.root, feature.root);
  if (featureRelative === "" || featureRelative === ".." || featureRelative.startsWith(`..${sep}`) || isAbsolute(featureRelative)) {
    throw new PathSecurityError(feature.root, `Feature must stay strictly contained in Project ${project.root}`);
  }
}
