import type { Project } from "../../domain/project/project.js";

export interface ProjectStore {
  exists(root: string): Promise<boolean>;
  hasLegacyMarker(root: string): Promise<boolean>;
  init(project: Project): Promise<void>;
  load(root: string): Promise<Project>;
  save(project: Project): Promise<void>;
}
