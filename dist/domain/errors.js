/**
 * Named domain errors. Port fidèle du pattern d'arka-cc-management
 * (core/domain/errors.ts) : chaque erreur a un `code` stable (matching
 * machine) et un message humain.
 */
export class DomainError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = new.target.name;
        Object.setPrototypeOf(this, new.target.prototype);
    }
}
export class InvalidAgentIdError extends DomainError {
    constructor(value, reason) {
        super("INVALID_AGENT_ID", `Invalid agent id "${value}": ${reason}`);
    }
}
export class InvalidAgentOptionError extends DomainError {
    constructor(field, reason) {
        super("INVALID_AGENT_OPTION", `Invalid agent option "${field}": ${reason}`);
    }
}
export class AgentAlreadyExistsError extends DomainError {
    constructor(id) {
        super("AGENT_ALREADY_EXISTS", `Agent "${id}" already exists in this project.`);
    }
}
export class AgentNotFoundError extends DomainError {
    constructor(id) {
        super("AGENT_NOT_FOUND", `Agent "${id}" not found in this project.`);
    }
}
export class AgentInactiveError extends DomainError {
    constructor(id) {
        super("AGENT_INACTIVE", `Agent "${id}" is inactive and cannot author new product documents.`);
    }
}
export class AgentScopeViolationError extends DomainError {
    constructor(id, target) {
        super("AGENT_SCOPE_VIOLATION", `Agent "${id}" is not authorized for "${target}" by its declared project scope.`);
    }
}
export class InvalidAgentRegistryError extends DomainError {
    constructor(path, reason) {
        super("INVALID_AGENT_REGISTRY", `Invalid agent registry "${path}": ${reason}`);
    }
}
export class InvalidFeatureIdError extends DomainError {
    constructor(value, reason) {
        super("INVALID_FEATURE_ID", `Invalid feature id "${value}": ${reason}`);
    }
}
export class InvalidFeatureOptionError extends DomainError {
    constructor(field, reason) {
        super("INVALID_FEATURE_OPTION", `Invalid feature option "${field}": ${reason}`);
    }
}
export class FeatureAlreadyExistsError extends DomainError {
    constructor(root) {
        super("FEATURE_ALREADY_EXISTS", `A feature already exists at "${root}" with a different id.`);
    }
}
export class FeatureLocationConflictError extends DomainError {
    constructor(id, indexedRoot, candidateRoot) {
        super("FEATURE_ALREADY_EXISTS", `Feature "${id}" is already active at "${indexedRoot}"; refusing duplicate location "${candidateRoot}".`);
    }
}
export class FeatureNotFoundError extends DomainError {
    constructor(id) {
        super("FEATURE_NOT_FOUND", `Feature "${id}" not found in the index.`);
    }
}
export class FeatureMarkerNotFoundError extends DomainError {
    constructor(root) {
        super("FEATURE_MARKER_NOT_FOUND", `Feature marker not found at "${root}/.arka-norn/feature.json".`);
    }
}
export class InvalidProjectIdError extends DomainError {
    constructor(value, reason) {
        super("INVALID_PROJECT_ID", `Invalid project id "${value}": ${reason}`);
    }
}
export class InvalidProjectOptionError extends DomainError {
    constructor(field, reason) {
        super("INVALID_PROJECT_OPTION", `Invalid project option "${field}": ${reason}`);
    }
}
export class ProjectAlreadyExistsError extends DomainError {
    constructor(root) {
        super("PROJECT_ALREADY_EXISTS", `A project already exists at "${root}" with a different id.`);
    }
}
export class ProjectLocationConflictError extends DomainError {
    constructor(id, indexedRoot, candidateRoot) {
        super("PROJECT_ALREADY_EXISTS", `Project "${id}" is already active at "${indexedRoot}"; refusing duplicate location "${candidateRoot}".`);
    }
}
export class ProjectNotFoundError extends DomainError {
    constructor(id) {
        super("PROJECT_NOT_FOUND", `Project "${id}" not found in the index.`);
    }
}
export class ProjectMarkerNotFoundError extends DomainError {
    constructor(root) {
        super("PROJECT_MARKER_NOT_FOUND", `Project marker not found at "${root}/.arka-norn/project.json".`);
    }
}
export class FileNotFoundError extends DomainError {
    constructor(path) {
        super("FILE_NOT_FOUND", `File not found: "${path}"`);
    }
}
export class PermissionDeniedError extends DomainError {
    constructor(path, op) {
        super("PERMISSION_DENIED", `Permission denied (${op}): "${path}"`);
    }
}
export class NotADirectoryError extends DomainError {
    constructor(path) {
        super("NOT_A_DIRECTORY", `Not a directory: "${path}"`);
    }
}
export class PathSecurityError extends DomainError {
    constructor(path, reason) {
        super("PATH_SECURITY", `Unsafe path "${path}": ${reason}.`);
    }
}
export class LockConflictError extends DomainError {
    constructor(path, timeoutMs) {
        super("LOCK_CONFLICT", `Lock conflict for "${path}" after ${timeoutMs}ms.`);
    }
}
export class AuditUnavailableError extends DomainError {
    constructor(action, reason) {
        super("AUDIT_UNAVAILABLE", `Audit trail unavailable for "${action}": ${reason}. The operation was not started unless an intent record exists.`);
    }
}
export class FileTooLargeError extends DomainError {
    constructor(path, maxBytes) {
        super("FILE_TOO_LARGE", `File "${path}" exceeds the ${maxBytes} byte limit.`);
    }
}
//# sourceMappingURL=errors.js.map