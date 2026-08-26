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

import type { AgentRegistration } from "../../domain/agent/agent.js";
import type { AgentId } from "../../domain/agent/agent-id.js";
import type { AgentSessionId } from "../../domain/agent/agent-session-id.js";
import type { FeatureId } from "../../domain/feature/feature-id.js";
import type { Project } from "../../domain/project/project.js";

export interface AgentScopeInput {
  readonly featureIds?: readonly FeatureId[];
  readonly paths?: readonly string[];
  readonly responsibilities?: readonly string[];
}

export interface RegisterAgentInput extends AgentScopeInput {
  readonly project: Project;
  readonly provider: string;
  readonly role: string;
  readonly id?: AgentId;
  readonly expectedRegistryRevision?: number;
}

export interface ReplaceAgentInput extends AgentScopeInput {
  readonly project: Project;
  readonly replacedAgentId: AgentId;
  readonly provider: string;
  readonly role: string;
  readonly id?: AgentId;
  readonly expectedRegistryRevision?: number;
}

export interface ForAgents {
  readonly sessionId: AgentSessionId;
  list(project: Project): Promise<readonly AgentRegistration[]>;
  sessions(project: Project): Promise<readonly { readonly sessionId: AgentSessionId; readonly agent: AgentRegistration }[]>;
  show(project: Project, id: AgentId): Promise<AgentRegistration>;
  register(input: RegisterAgentInput): Promise<AgentRegistration>;
  deactivate(project: Project, id: AgentId, expectedRegistryRevision?: number): Promise<AgentRegistration>;
  replace(input: ReplaceAgentInput): Promise<AgentRegistration>;
  select(project: Project, id: AgentId, expectedRegistryRevision?: number): Promise<AgentRegistration>;
  current(project: Project): Promise<AgentRegistration | undefined>;
}
