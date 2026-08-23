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
import { randomUUID } from "node:crypto";
import { MissionPreconditionError } from "../domain/orchestration/errors.js";
import { matchesExecutionProvider } from "./orchestration-provider-configuration.js";
import { matchesOrchestrationRole } from "./orchestration-proof-validation.js";
import { relativeFeatureScope } from "./orchestration-mission-planner.js";
export async function resolveBoundedAuthor(input) {
    const binding = (await input.agents.sessions(input.project)).find((candidate) => candidate.sessionId.value === input.prompt.sessionId);
    if (binding === undefined
        || !binding.agent.active
        || !binding.agent.coversFeature(input.context.feature.id)
        || !binding.agent.coversProjectPath(relativeFeatureScope(input.project, input.context.feature))
        || !matchesOrchestrationRole(binding.agent.role, input.context.role)
        || !matchesExecutionProvider(binding.agent.provider, input.record.provider)) {
        throw new MissionPreconditionError("The execution role has no active, scoped Agent identity compatible with the selected provider.");
    }
    return binding.agent.id.value;
}
export function isActive(record) {
    return record.status === "planned" || record.status === "running" || record.status === "awaiting_approval";
}
export function includesAll(available, required) {
    const set = new Set(available);
    return required.every((value) => set.has(value));
}
export function nextExecutionId() {
    return `execution-${randomUUID()}`;
}
export function nextMissionId() {
    return `mission-${randomUUID()}`;
}
export function delay(milliseconds) {
    return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}
//# sourceMappingURL=orchestration-runtime-support.js.map