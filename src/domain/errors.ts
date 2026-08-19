/**
 * Named domain errors. Port fidèle du pattern d'arka-cc-management
 * (core/domain/errors.ts) : chaque erreur a un `code` stable (matching
 * machine) et un message humain.
 */

export type DomainErrorCode =
  | "INVALID_FEATURE_ID"
  | "INVALID_FEATURE_OPTION"
  | "FEATURE_ALREADY_EXISTS"
  | "FEATURE_NOT_FOUND"
  | "INVALID_PROJECT_ID"
  | "INVALID_PROJECT_OPTION"
  | "PROJECT_ALREADY_EXISTS"
  | "PROJECT_NOT_FOUND"
  | "FILE_NOT_FOUND"
  | "PERMISSION_DENIED"
  | "NOT_A_DIRECTORY"
  | "PATH_SECURITY"
  | "LOCK_CONFLICT"
  | "FILE_TOO_LARGE"
  | "INVALID_MARKER"
  | "MIGRATION_CONTEXT_REQUIRED"
  | "UNSUPPORTED_SCHEMA_VERSION"
  | "AUDIT_UNAVAILABLE";

export class DomainError extends Error {
  public readonly code: DomainErrorCode;

  public constructor(code: DomainErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class InvalidFeatureIdError extends DomainError {
  public constructor(value: string, reason: string) {
    super("INVALID_FEATURE_ID", `Invalid feature id "${value}": ${reason}`);
  }
}

export class InvalidFeatureOptionError extends DomainError {
  public constructor(field: string, reason: string) {
    super("INVALID_FEATURE_OPTION", `Invalid feature option "${field}": ${reason}`);
  }
}

export class FeatureAlreadyExistsError extends DomainError {
  public constructor(root: string) {
    super("FEATURE_ALREADY_EXISTS", `A feature already exists at "${root}" with a different id.`);
  }
}

export class FeatureNotFoundError extends DomainError {
  public constructor(id: string) {
    super("FEATURE_NOT_FOUND", `Feature "${id}" not found in the index.`);
  }
}

export class InvalidProjectIdError extends DomainError {
  public constructor(value: string, reason: string) {
    super("INVALID_PROJECT_ID", `Invalid project id "${value}": ${reason}`);
  }
}

export class InvalidProjectOptionError extends DomainError {
  public constructor(field: string, reason: string) {
    super("INVALID_PROJECT_OPTION", `Invalid project option "${field}": ${reason}`);
  }
}

export class ProjectAlreadyExistsError extends DomainError {
  public constructor(root: string) {
    super("PROJECT_ALREADY_EXISTS", `A project already exists at "${root}" with a different id.`);
  }
}

export class ProjectNotFoundError extends DomainError {
  public constructor(id: string) {
    super("PROJECT_NOT_FOUND", `Project "${id}" not found in the index.`);
  }
}

export class FileNotFoundError extends DomainError {
  public constructor(path: string) {
    super("FILE_NOT_FOUND", `File not found: "${path}"`);
  }
}

export class PermissionDeniedError extends DomainError {
  public constructor(path: string, op: string) {
    super("PERMISSION_DENIED", `Permission denied (${op}): "${path}"`);
  }
}

export class NotADirectoryError extends DomainError {
  public constructor(path: string) {
    super("NOT_A_DIRECTORY", `Not a directory: "${path}"`);
  }
}

export class PathSecurityError extends DomainError {
  public constructor(path: string, reason: string) {
    super("PATH_SECURITY", `Unsafe path "${path}": ${reason}.`);
  }
}

export class LockConflictError extends DomainError {
  public constructor(path: string, timeoutMs: number) {
    super("LOCK_CONFLICT", `Lock conflict for "${path}" after ${timeoutMs}ms.`);
  }
}

export class AuditUnavailableError extends DomainError {
  public constructor(action: string, reason: string) {
    super("AUDIT_UNAVAILABLE", `Audit trail unavailable for "${action}": ${reason}. The operation was not started unless an intent record exists.`);
  }
}

export class FileTooLargeError extends DomainError {
  public constructor(path: string, maxBytes: number) {
    super("FILE_TOO_LARGE", `File "${path}" exceeds the ${maxBytes} byte limit.`);
  }
}
