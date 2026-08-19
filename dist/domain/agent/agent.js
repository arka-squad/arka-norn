import { InvalidAgentOptionError } from "../errors.js";
export class AgentRegistration {
    id;
    provider;
    role;
    active;
    scope;
    registeredAt;
    updatedAt;
    deactivatedAt;
    replacedByAgentId;
    replacesAgentId;
    constructor(props) {
        this.id = props.id;
        this.provider = props.provider;
        this.role = props.role;
        this.active = props.active;
        this.scope = freezeScope(props.scope);
        this.registeredAt = new Date(props.registeredAt.getTime());
        this.updatedAt = new Date(props.updatedAt.getTime());
        this.deactivatedAt = props.deactivatedAt === undefined ? undefined : new Date(props.deactivatedAt.getTime());
        this.replacedByAgentId = props.replacedByAgentId;
        this.replacesAgentId = props.replacesAgentId;
    }
    static create(props) {
        validateText(props.provider, "provider", 80);
        validateText(props.role, "role", 80);
        validateDate(props.registeredAt, "registeredAt");
        validateDate(props.updatedAt, "updatedAt");
        if (props.updatedAt.getTime() < props.registeredAt.getTime())
            throw new InvalidAgentOptionError("updatedAt", "must not precede registeredAt");
        validateScope(props.scope);
        if (props.active && (props.deactivatedAt !== undefined || props.replacedByAgentId !== undefined)) {
            throw new InvalidAgentOptionError("active", "an active agent cannot be deactivated or replaced");
        }
        if (!props.active && props.deactivatedAt === undefined)
            throw new InvalidAgentOptionError("deactivatedAt", "is required for an inactive agent");
        if (props.deactivatedAt !== undefined) {
            validateDate(props.deactivatedAt, "deactivatedAt");
            if (props.deactivatedAt.getTime() < props.registeredAt.getTime())
                throw new InvalidAgentOptionError("deactivatedAt", "must not precede registeredAt");
        }
        if (props.replacedByAgentId?.equals(props.id) === true || props.replacesAgentId?.equals(props.id) === true) {
            throw new InvalidAgentOptionError("replacement", "an agent cannot replace itself");
        }
        return new AgentRegistration(props);
    }
    deactivate(at, replacedByAgentId) {
        if (!this.active)
            throw new InvalidAgentOptionError("active", `agent ${this.id.value} is already inactive`);
        return AgentRegistration.create({
            ...this.toProps(),
            active: false,
            updatedAt: at,
            deactivatedAt: at,
            ...(replacedByAgentId === undefined ? {} : { replacedByAgentId }),
        });
    }
    coversFeature(featureId) {
        return this.scope.featureIds.length === 0 || this.scope.featureIds.some((candidate) => candidate.value === featureId.value);
    }
    coversProjectPath(relativePath) {
        if (this.scope.paths.length === 0)
            return true;
        const target = canonicalRelative(relativePath);
        return this.scope.paths.some((path) => {
            const allowed = canonicalRelative(path);
            return target === allowed || target.startsWith(`${allowed}/`);
        });
    }
    toProps() {
        return {
            id: this.id,
            provider: this.provider,
            role: this.role,
            active: this.active,
            scope: this.scope,
            registeredAt: this.registeredAt,
            updatedAt: this.updatedAt,
            ...(this.deactivatedAt === undefined ? {} : { deactivatedAt: this.deactivatedAt }),
            ...(this.replacedByAgentId === undefined ? {} : { replacedByAgentId: this.replacedByAgentId }),
            ...(this.replacesAgentId === undefined ? {} : { replacesAgentId: this.replacesAgentId }),
        };
    }
}
function validateScope(scope) {
    unique(scope.featureIds.map((id) => id.value), "featureIds");
    unique(scope.paths, "paths");
    unique(scope.responsibilities, "responsibilities");
    for (const path of scope.paths) {
        const segments = path.split(/[\\/]/);
        if (path.length === 0 || path.length > 512 || path.startsWith("/") || /^[A-Za-z]:[\\/]/.test(path) || segments.includes("..")) {
            throw new InvalidAgentOptionError("scope.paths", `must contain safe project-relative paths; received "${path}"`);
        }
    }
    for (const responsibility of scope.responsibilities)
        validateText(responsibility, "scope.responsibilities", 256);
}
function canonicalRelative(value) {
    return value.replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/+$/, "");
}
function freezeScope(scope) {
    return {
        projectId: scope.projectId,
        featureIds: [...scope.featureIds],
        paths: [...scope.paths],
        responsibilities: [...scope.responsibilities],
    };
}
function unique(values, field) {
    if (new Set(values).size !== values.length)
        throw new InvalidAgentOptionError(`scope.${field}`, "must not contain duplicates");
}
function validateText(value, field, max) {
    if (typeof value !== "string" || value.trim().length === 0 || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) {
        throw new InvalidAgentOptionError(field, `must contain 1..${max} printable characters`);
    }
}
function validateDate(value, field) {
    if (!(value instanceof Date) || Number.isNaN(value.getTime()))
        throw new InvalidAgentOptionError(field, "must be a valid Date");
}
//# sourceMappingURL=agent.js.map