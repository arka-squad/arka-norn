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

import { InvalidProjectIdError } from "../errors.js";

const PROJECT_ID_REGEX = /^[a-z0-9][a-z0-9-]{0,63}$/;

export class ProjectId {
  public readonly value: string;

  private constructor(value: string) {
    this.value = value;
  }

  public static of(value: string): ProjectId {
    if (typeof value !== "string") {
      throw new InvalidProjectIdError(String(value), "must be a string");
    }
    if (!PROJECT_ID_REGEX.test(value)) {
      throw new InvalidProjectIdError(value, "must match [a-z0-9][a-z0-9-]{0,63}");
    }
    return new ProjectId(value);
  }

  public static isValid(value: string): boolean {
    return typeof value === "string" && PROJECT_ID_REGEX.test(value);
  }

  public equals(other: ProjectId): boolean {
    return this.value === other.value;
  }

  public toString(): string {
    return this.value;
  }
}
