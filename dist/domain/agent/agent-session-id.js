import { InvalidAgentOptionError } from "../errors.js";
const SESSION_ID_PATTERN = /^[a-z][a-z0-9-]{0,63}$/;
export class AgentSessionId {
    static MAIN = AgentSessionId.of("main");
    value;
    constructor(value) {
        this.value = value;
    }
    static of(value) {
        if (typeof value !== "string" || !SESSION_ID_PATTERN.test(value)) {
            throw new InvalidAgentOptionError("session", "must match [a-z][a-z0-9-]{0,63}");
        }
        return new AgentSessionId(value);
    }
    static isValid(value) {
        return typeof value === "string" && SESSION_ID_PATTERN.test(value);
    }
    equals(other) {
        return this.value === other.value;
    }
    toString() {
        return this.value;
    }
}
export function deriveAgentSessionId(role, subject) {
    const slug = `${role}-${subject}`
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
    const safe = /^[a-z]/.test(slug) ? slug : `agent-${slug}`;
    return AgentSessionId.of(safe.slice(0, 64).replace(/-+$/g, "") || "agent-session");
}
//# sourceMappingURL=agent-session-id.js.map