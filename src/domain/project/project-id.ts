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
