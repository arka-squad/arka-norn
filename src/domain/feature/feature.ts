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

import { InvalidFeatureOptionError } from "../errors.js";
import type { ProjectId } from "../project/project-id.js";
import type { FeatureId } from "./feature-id.js";

export interface FeatureProps {
  readonly id: FeatureId;
  readonly projectId: ProjectId;
  readonly name: string;
  readonly root: string;
  readonly pipelineId: string;
  readonly schemaVersion: 3 | 4;
  readonly documentContractVersion?: 3 | 5;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export class Feature {
  public readonly id: FeatureId;
  public readonly projectId: ProjectId;
  public readonly name: string;
  public readonly root: string;
  public readonly pipelineId: string;
  public readonly schemaVersion: 3 | 4;
  public readonly documentContractVersion: 3 | 5;
  public readonly createdAt: Date;
  public readonly updatedAt: Date;

  private constructor(props: FeatureProps) {
    this.id = props.id;
    this.projectId = props.projectId;
    this.name = props.name;
    this.root = props.root;
    this.pipelineId = props.pipelineId;
    this.schemaVersion = props.schemaVersion;
    this.documentContractVersion = props.documentContractVersion ?? (props.schemaVersion === 4 ? 5 : 3);
    this.createdAt = new Date(props.createdAt.getTime());
    this.updatedAt = new Date(props.updatedAt.getTime());
  }

  /**
   * @throws {InvalidFeatureOptionError} si `name` est vide ou `root` n'a
   *   pas l'air d'un chemin absolu.
   */
  public static create(props: FeatureProps): Feature {
    Feature.validateName(props.name);
    Feature.validateRoot(props.root);
    Feature.validatePipelineId(props.pipelineId);
    Feature.validateDate(props.createdAt, "createdAt");
    Feature.validateDate(props.updatedAt, "updatedAt");
    if (props.updatedAt.getTime() < props.createdAt.getTime()) {
      throw new InvalidFeatureOptionError("updatedAt", "must not be earlier than createdAt");
    }
    return new Feature(props);
  }

  private static validateName(name: string): void {
    if (typeof name !== "string" || name.trim().length === 0) {
      throw new InvalidFeatureOptionError("name", "must be a non-empty string");
    }
    if (name.length > 256) {
      throw new InvalidFeatureOptionError("name", `length ${name.length} exceeds 256`);
    }
  }

  private static validateRoot(root: string): void {
    if (typeof root !== "string" || root.length === 0) {
      throw new InvalidFeatureOptionError("root", "must be a non-empty string");
    }
    const isPosixAbs = root.startsWith("/");
    const isWinAbs = /^[A-Za-z]:[\\/]/.test(root);
    if (!isPosixAbs && !isWinAbs) {
      throw new InvalidFeatureOptionError("root", "must be an absolute path (POSIX `/...` or Windows `X:\\...`)");
    }
  }

  private static validatePipelineId(value: string): void {
    if (typeof value !== "string" || !/^[a-z0-9][a-z0-9._-]{0,127}$/.test(value)) {
      throw new InvalidFeatureOptionError("pipelineId", "must be a valid pipeline identifier");
    }
  }

  private static validateDate(date: unknown, field: string): void {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
      throw new InvalidFeatureOptionError(field, "must be a valid Date");
    }
  }

  // --- Transitions -----------------------------------------------------------

  public withName(name: string, now: Date): Feature {
    return Feature.create({ ...this.toProps(), name, updatedAt: now });
  }

  public touched(now: Date): Feature {
    return Feature.create({ ...this.toProps(), updatedAt: now });
  }

  public withPipelineId(pipelineId: string, now: Date): Feature {
    return Feature.create({ ...this.toProps(), pipelineId, updatedAt: now });
  }

  // --- Identity --------------------------------------------------------------

  public sameIdentity(other: Feature): boolean {
    return this.id.equals(other.id);
  }

  public belongsTo(projectId: ProjectId): boolean {
    return this.projectId.equals(projectId);
  }

  private toProps(): FeatureProps {
    return {
      id: this.id,
      projectId: this.projectId,
      name: this.name,
      root: this.root,
      pipelineId: this.pipelineId,
      schemaVersion: this.schemaVersion,
      documentContractVersion: this.documentContractVersion,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
