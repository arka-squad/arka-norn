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
