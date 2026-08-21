import { InvalidProjectOptionError } from "../errors.js";
export const PROJECT_ORCHESTRATION_MODES = ["manual", "automatic"];
export class Project {
    id;
    name;
    root;
    schemaVersion;
    orchestrationMode;
    createdAt;
    updatedAt;
    constructor(props) {
        this.id = props.id;
        this.name = props.name;
        this.root = props.root;
        this.schemaVersion = props.schemaVersion;
        this.orchestrationMode = props.orchestrationMode;
        this.createdAt = new Date(props.createdAt.getTime());
        this.updatedAt = new Date(props.updatedAt.getTime());
    }
    static create(props) {
        validateName(props.name);
        validateRoot(props.root);
        validateSchemaVersion(props.schemaVersion);
        const orchestrationMode = props.orchestrationMode ?? "manual";
        validateOrchestrationMode(orchestrationMode);
        validateDate(props.createdAt, "createdAt");
        validateDate(props.updatedAt, "updatedAt");
        if (props.updatedAt.getTime() < props.createdAt.getTime()) {
            throw new InvalidProjectOptionError("updatedAt", "must not be earlier than createdAt");
        }
        return new Project({
            id: props.id,
            name: props.name,
            root: props.root,
            schemaVersion: 4,
            orchestrationMode,
            createdAt: props.createdAt,
            updatedAt: props.updatedAt,
        });
    }
    withName(name, now) {
        return Project.create({ ...this.toProps(), name, updatedAt: now });
    }
    touched(now) {
        return Project.create({ ...this.toProps(), updatedAt: now });
    }
    withOrchestrationMode(orchestrationMode, now) {
        return Project.create({ ...this.toProps(), orchestrationMode, updatedAt: now });
    }
    sameIdentity(other) {
        return this.id.equals(other.id);
    }
    toProps() {
        return {
            id: this.id,
            name: this.name,
            root: this.root,
            schemaVersion: this.schemaVersion,
            orchestrationMode: this.orchestrationMode,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt,
        };
    }
}
function validateName(name) {
    if (typeof name !== "string" || name.trim().length === 0 || name.length > 256) {
        throw new InvalidProjectOptionError("name", "must contain between 1 and 256 characters");
    }
}
function validateRoot(root) {
    if (typeof root !== "string" || (!root.startsWith("/") && !/^[A-Za-z]:[\\/]/.test(root))) {
        throw new InvalidProjectOptionError("root", "must be an absolute POSIX or Windows path");
    }
}
function validateSchemaVersion(schemaVersion) {
    if (schemaVersion !== 3 && schemaVersion !== 4) {
        throw new InvalidProjectOptionError("schemaVersion", "must be 3 or 4");
    }
}
function validateOrchestrationMode(orchestrationMode) {
    if (!isProjectOrchestrationMode(orchestrationMode)) {
        throw new InvalidProjectOptionError("orchestrationMode", "must be manual or automatic");
    }
}
function validateDate(value, field) {
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
        throw new InvalidProjectOptionError(field, "must be a valid Date");
    }
}
export function isProjectOrchestrationMode(value) {
    return value === "manual" || value === "automatic";
}
//# sourceMappingURL=project.js.map