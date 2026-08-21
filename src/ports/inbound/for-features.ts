/**
 * ForFeatures — driving port : cycle de vie CRUD d'une feature indexée.
 * Port fidèle de ForProjects (arka-cc-management,
 * core/ports/inbound/for-projects.ts), réduit aux opérations utiles ici.
 */
import type { Feature } from "../../domain/feature/feature.js";
import type { FeatureId } from "../../domain/feature/feature-id.js";
import type { ProjectId } from "../../domain/project/project-id.js";

export interface CreateFeatureInput {
  readonly id: FeatureId;
  readonly projectId: ProjectId;
  readonly name: string;
  readonly root: string;
  readonly pipelineId?: string;
}

export interface ImportFeatureInput {
  readonly root: string;
  readonly projectId: ProjectId;
}

export interface SetFeatureWorkflowInput {
  readonly id: FeatureId;
  readonly pipelineId: string;
  readonly recognizedDocumentTypes: readonly string[];
}

export interface ForgetFeatureOptions {
  /** Recovery path for an indexed Feature whose local marker has disappeared. */
  readonly indexOnly?: boolean;
}

export interface ForFeatures {
  list(projectId?: ProjectId): Promise<readonly Feature[]>;
  create(input: CreateFeatureInput): Promise<Feature>;
  importFrom(input: ImportFeatureInput): Promise<Feature>;
  show(id: FeatureId): Promise<Feature>;
  forget(id: FeatureId, options?: ForgetFeatureOptions): Promise<void>;
  switchTo(id: FeatureId): Promise<Feature>;
  setWorkflow(input: SetFeatureWorkflowInput): Promise<Feature>;
}
