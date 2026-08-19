import { InvalidProjectOptionError } from "../errors.js";
export class Project {
    id;
    name;
    root;
    schemaVersion;
    createdAt;
    updatedAt;
    constructor(props) {
        this.id = props.id;
        this.name = props.name;
        this.root = props.root;
        this.schemaVersion = props.schemaVersion;
        this.createdAt = new Date(props.createdAt.getTime());
        this.updatedAt = new Date(props.updatedAt.getTime());
    }
    static create(props) {
        validateName(props.name);
        validateRoot(props.root);
        validateDate(props.createdAt, "createdAt");
        validateDate(props.updatedAt, "updatedAt");
        if (props.updatedAt.getTime() < props.createdAt.getTime()) {
            throw new InvalidProjectOptionError("updatedAt", "must not be earlier than createdAt");
        }
        return new Project(props);
    }
    withName(name, now) {
        return Project.create({ ...this.toProps(), name, updatedAt: now });
    }
    touched(now) {
        return Project.create({ ...this.toProps(), updatedAt: now });
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
function validateDate(value, field) {
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
        throw new InvalidProjectOptionError(field, "must be a valid Date");
    }
}
//# sourceMappingURL=project.js.map