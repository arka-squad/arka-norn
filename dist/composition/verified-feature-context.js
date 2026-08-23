/*
 * Copyright 2026 Arka Labs
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import { existsSync } from "node:fs";
import { isAbsolute, relative, sep } from "node:path";
import { agentRegistryPath } from "../adapters/outbound/filesystem/fs-agent-registry-store.js";
import { InvalidAgentRegistryError, PathSecurityError } from "../domain/errors.js";
export async function loadVerifiedFeatureContext(feature, deps) {
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
export function assertFeatureContainedInProject(feature, project) {
    const featureRelative = relative(project.root, feature.root);
    if (featureRelative === "" || featureRelative === ".." || featureRelative.startsWith(`..${sep}`) || isAbsolute(featureRelative)) {
        throw new PathSecurityError(feature.root, `Feature must stay strictly contained in Project ${project.root}`);
    }
}
//# sourceMappingURL=verified-feature-context.js.map