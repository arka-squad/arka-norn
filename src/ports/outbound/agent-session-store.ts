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

import type { AgentId } from "../../domain/agent/agent-id.js";
import type { AgentSessionId } from "../../domain/agent/agent-session-id.js";
import type { ProjectId } from "../../domain/project/project-id.js";

export interface AgentSessionBinding {
  readonly sessionId: AgentSessionId;
  readonly projectId: ProjectId;
  readonly agentId: AgentId;
}

export interface AgentSessionStore {
  current(sessionId: AgentSessionId, projectId: ProjectId): Promise<AgentId | undefined>;
  select(sessionId: AgentSessionId, projectId: ProjectId, agentId: AgentId | undefined): Promise<void>;
  list(projectId: ProjectId): Promise<readonly AgentSessionBinding[]>;
  clearAgent(projectId: ProjectId, agentId: AgentId): Promise<void>;
  replaceAgent(projectId: ProjectId, replacedAgentId: AgentId, replacementAgentId: AgentId): Promise<void>;
}
