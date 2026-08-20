/**
 * Env -- lecture de la config runtime depuis process.env. Port TS
 * simplifié de arka-cc-management (composition/env.ts) : pas d'API
 * distante (pas d'apiUrl/apiKey -- arka-norn n'a pas de backend).
 */
import { dirname, isAbsolute, resolve } from "node:path";
import { AgentSessionId } from "../domain/agent/agent-session-id.js";
const DEFAULT_LOG_LEVEL = "info";
const LOG_LEVELS = ["debug", "info", "warn", "error"];
export function readEnv(source = process.env, cwd = process.cwd()) {
    return {
        homeDir: parseHomeDir(source["ARKA_NORN_HOME"]),
        logLevel: parseLogLevel(source["ARKA_NORN_LOG_LEVEL"]),
        cwd,
        agentSessionId: parseAgentSessionId(source["ARKA_NORN_SESSION"]),
        raw: source,
    };
}
function parseAgentSessionId(value) {
    if (value === undefined || value.trim() === "")
        return AgentSessionId.MAIN;
    return AgentSessionId.of(value.trim());
}
function parseHomeDir(value) {
    if (value === undefined || value.trim() === "")
        return undefined;
    const raw = value.trim();
    const absolute = isAbsolute(raw) ? raw : resolve(raw);
    return absolute.endsWith("/.arka-norn") ? dirname(absolute) : absolute;
}
function parseLogLevel(value) {
    if (value === undefined || value.trim() === "")
        return DEFAULT_LOG_LEVEL;
    const normalized = value.trim().toLowerCase();
    if (LOG_LEVELS.includes(normalized)) {
        return normalized;
    }
    throw new Error(`Invalid ARKA_NORN_LOG_LEVEL: ${JSON.stringify(value)}`);
}
//# sourceMappingURL=env.js.map