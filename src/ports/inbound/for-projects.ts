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

import type { Project } from "../../domain/project/project.js";
import type { ProjectOrchestrationMode } from "../../domain/project/project.js";
import type { ProjectId } from "../../domain/project/project-id.js";

export interface CreateProjectInput {
  readonly id: ProjectId;
  readonly name: string;
  readonly root: string;
  readonly orchestrationMode?: ProjectOrchestrationMode;
}

export interface ImportProjectInput {
  readonly root: string;
}

export interface SetProjectOrchestrationModeInput {
  readonly id: ProjectId;
  readonly orchestrationMode: ProjectOrchestrationMode;
}

export interface ForgetProjectOptions {
  /** Recovery path for an indexed Project whose local marker has disappeared. */
  readonly indexOnly?: boolean;
}

export interface ForProjects {
  list(): Promise<readonly Project[]>;
  create(input: CreateProjectInput): Promise<Project>;
  importFrom(input: ImportProjectInput): Promise<Project>;
  show(id: ProjectId): Promise<Project>;
  forget(id: ProjectId, options?: ForgetProjectOptions): Promise<void>;
  switchTo(id: ProjectId): Promise<Project>;
  setOrchestrationMode(input: SetProjectOrchestrationModeInput): Promise<Project>;
}
