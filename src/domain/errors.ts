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

/**
 * Named domain errors. Port fidèle du pattern d'arka-cc-management
 * (core/domain/errors.ts) : chaque erreur a un `code` stable (matching
 * machine) et un message humain.
 */

export type DomainErrorCode =
  | "INVALID_AGENT_ID"
  | "INVALID_AGENT_OPTION"
  | "AGENT_ALREADY_EXISTS"
  | "AGENT_NOT_FOUND"
  | "AGENT_INACTIVE"
  | "AGENT_SCOPE_VIOLATION"
  | "INVALID_AGENT_REGISTRY"
  | "INVALID_FEATURE_ID"
  | "INVALID_FEATURE_OPTION"
  | "FEATURE_ALREADY_EXISTS"
  | "FEATURE_NOT_FOUND"
  | "FEATURE_MARKER_NOT_FOUND"
  | "FEATURE_WORKFLOW_IMMUTABLE"
  | "INVALID_PROJECT_ID"
  | "INVALID_PROJECT_OPTION"
  | "PROJECT_ALREADY_EXISTS"
  | "PROJECT_NOT_FOUND"
  | "PROJECT_MARKER_NOT_FOUND"
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

export class InvalidAgentIdError extends DomainError {
  public constructor(value: string, reason: string) {
    super("INVALID_AGENT_ID", `Invalid agent id "${value}": ${reason}`);
  }
}

export class InvalidAgentOptionError extends DomainError {
  public constructor(field: string, reason: string) {
    super("INVALID_AGENT_OPTION", `Invalid agent option "${field}": ${reason}`);
  }
}

export class AgentAlreadyExistsError extends DomainError {
  public constructor(id: string) {
    super("AGENT_ALREADY_EXISTS", `Agent "${id}" already exists in this project.`);
  }
}

export class AgentNotFoundError extends DomainError {
  public constructor(id: string) {
    super("AGENT_NOT_FOUND", `Agent "${id}" not found in this project.`);
  }
}

export class AgentInactiveError extends DomainError {
  public constructor(id: string) {
    super("AGENT_INACTIVE", `Agent "${id}" is inactive and cannot author new product documents.`);
  }
}

export class AgentScopeViolationError extends DomainError {
  public constructor(id: string, target: string) {
    super("AGENT_SCOPE_VIOLATION", `Agent "${id}" is not authorized for "${target}" by its declared project scope.`);
  }
}

export class InvalidAgentRegistryError extends DomainError {
  public constructor(path: string, reason: string) {
    super("INVALID_AGENT_REGISTRY", `Invalid agent registry "${path}": ${reason}`);
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

export class FeatureLocationConflictError extends DomainError {
  public constructor(id: string, indexedRoot: string, candidateRoot: string) {
    super("FEATURE_ALREADY_EXISTS", `Feature "${id}" is already active at "${indexedRoot}"; refusing duplicate location "${candidateRoot}".`);
  }
}

export class FeatureNotFoundError extends DomainError {
  public constructor(id: string) {
    super("FEATURE_NOT_FOUND", `Feature "${id}" not found in the index.`);
  }
}

export class FeatureMarkerNotFoundError extends DomainError {
  public constructor(root: string) {
    super("FEATURE_MARKER_NOT_FOUND", `Feature marker not found at "${root}/.arka-norn/feature.json".`);
  }
}

export class FeatureWorkflowImmutableError extends DomainError {
  public constructor(id: string, documentType: string) {
    super("FEATURE_WORKFLOW_IMMUTABLE", `Feature "${id}" already contains pipeline document type "${documentType}"; its workflow is immutable.`);
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

export class ProjectLocationConflictError extends DomainError {
  public constructor(id: string, indexedRoot: string, candidateRoot: string) {
    super("PROJECT_ALREADY_EXISTS", `Project "${id}" is already active at "${indexedRoot}"; refusing duplicate location "${candidateRoot}".`);
  }
}

export class ProjectNotFoundError extends DomainError {
  public constructor(id: string) {
    super("PROJECT_NOT_FOUND", `Project "${id}" not found in the index.`);
  }
}

export class ProjectMarkerNotFoundError extends DomainError {
  public constructor(root: string) {
    super("PROJECT_MARKER_NOT_FOUND", `Project marker not found at "${root}/.arka-norn/project.json".`);
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
