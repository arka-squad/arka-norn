import type { Project } from "../../domain/project/project.js";

export interface ScanProjectsOptions {
  readonly target?: string;
}

export interface ProjectScanResult {
  readonly root: string;
  readonly hasMarker: boolean;
  readonly project?: Project;
  readonly legacyMarker?: boolean;
}

export interface ForScanProjects {
  scan(options?: ScanProjectsOptions): Promise<readonly ProjectScanResult[]>;
}
