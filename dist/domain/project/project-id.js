import { InvalidProjectIdError } from "../errors.js";
const PROJECT_ID_REGEX = /^[a-z0-9][a-z0-9-]{0,63}$/;
export class ProjectId {
    value;
    constructor(value) {
        this.value = value;
    }
    static of(value) {
        if (typeof value !== "string") {
            throw new InvalidProjectIdError(String(value), "must be a string");
        }
        if (!PROJECT_ID_REGEX.test(value)) {
            throw new InvalidProjectIdError(value, "must match [a-z0-9][a-z0-9-]{0,63}");
        }
        return new ProjectId(value);
    }
    static isValid(value) {
        return typeof value === "string" && PROJECT_ID_REGEX.test(value);
    }
    equals(other) {
        return this.value === other.value;
    }
    toString() {
        return this.value;
    }
}
//# sourceMappingURL=project-id.js.map