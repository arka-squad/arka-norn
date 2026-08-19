import type { Project } from "../../domain/project/project.js";
import type { ProjectId } from "../../domain/project/project-id.js";

export interface CreateProjectInput {
  readonly id: ProjectId;
  readonly name: string;
  readonly root: string;
}

export interface ImportProjectInput {
  readonly root: string;
}

export interface ForProjects {
  list(): Promise<readonly Project[]>;
  create(input: CreateProjectInput): Promise<Project>;
  importFrom(input: ImportProjectInput): Promise<Project>;
  show(id: ProjectId): Promise<Project>;
  forget(id: ProjectId): Promise<void>;
  switchTo(id: ProjectId): Promise<Project>;
}
