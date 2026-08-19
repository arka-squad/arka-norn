import { InvalidAgentIdError } from "../errors.js";
export const AGENT_ID_PATTERN = /^[A-Z][A-Za-z0-9-]{0,39}_[a-z][a-z0-9-]{0,39}_\d{8}(?:_\d{2})?$/;
export class AgentId {
    value;
    constructor(value) {
        this.value = value;
    }
    static of(value) {
        if (typeof value !== "string" || !AGENT_ID_PATTERN.test(value)) {
            throw new InvalidAgentIdError(String(value), "must match Provider_role_YYYYMMDD with an optional _NN collision suffix");
        }
        return new AgentId(value);
    }
    static isValid(value) {
        return typeof value === "string" && AGENT_ID_PATTERN.test(value);
    }
    equals(other) {
        return this.value === other.value;
    }
    toString() {
        return this.value;
    }
}
export function createReadableAgentId(provider, role, at, occupiedIds) {
    const normalizedProvider = normalizeProvider(provider);
    const normalizedRole = normalizeRole(role);
    const date = `${at.getUTCFullYear()}${String(at.getUTCMonth() + 1).padStart(2, "0")}${String(at.getUTCDate()).padStart(2, "0")}`;
    const base = `${normalizedProvider}_${normalizedRole}_${date}`;
    if (!occupiedIds.has(base))
        return AgentId.of(base);
    for (let index = 2; index <= 99; index += 1) {
        const candidate = `${base}_${String(index).padStart(2, "0")}`;
        if (!occupiedIds.has(candidate))
            return AgentId.of(candidate);
    }
    throw new InvalidAgentIdError(base, "daily provider/role namespace exhausted");
}
export function normalizeProvider(value) {
    const parts = ascii(value).split(/[^A-Za-z0-9]+/).filter(Boolean);
    const normalized = parts.map((part) => `${part[0].toUpperCase()}${part.slice(1)}`).join("-").slice(0, 40);
    if (normalized.length === 0)
        throw new InvalidAgentIdError(value, "provider must contain an ASCII letter or digit");
    return normalized;
}
export function normalizeRole(value) {
    const normalized = ascii(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
    if (!/^[a-z]/.test(normalized))
        throw new InvalidAgentIdError(value, "role must start with a letter");
    return normalized;
}
function ascii(value) {
    return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
//# sourceMappingURL=agent-id.js.map