import { join } from "node:path";
import { AgentId } from "../../../domain/agent/agent-id.js";
import { readJson, writeJsonAtomic } from "./_shared/atomic-json.js";
import { withFileLock } from "./_shared/file-lock.js";
export class FsAgentSessionStore {
    homeDir;
    constructor(homeDir) {
        this.homeDir = homeDir;
    }
    async current(projectId) {
        const session = await this.load();
        const value = session.selectedByProject[projectId.value];
        return value === undefined ? undefined : AgentId.of(value);
    }
    async select(projectId, agentId) {
        const path = this.path();
        await withFileLock(path, async () => {
            const session = await this.load();
            const selectedByProject = { ...session.selectedByProject };
            if (agentId === undefined)
                delete selectedByProject[projectId.value];
            else
                selectedByProject[projectId.value] = agentId.value;
            await writeJsonAtomic(path, { schemaVersion: 1, selectedByProject }, { mode: 0o600 });
        });
    }
    path() {
        return join(this.homeDir, ".arka-norn", "context", "agents.json");
    }
    async load() {
        const value = await readJson(this.path());
        if (value === undefined)
            return { schemaVersion: 1, selectedByProject: {} };
        if (!isAgentSessionFile(value))
            throw new Error(`Invalid agent session file: ${this.path()}`);
        return value;
    }
}
export function isAgentSessionFile(value) {
    if (typeof value !== "object" || value === null || Array.isArray(value))
        return false;
    const record = value;
    const selected = record["selectedByProject"];
    return Object.keys(record).length === 2
        && record["schemaVersion"] === 1
        && typeof selected === "object"
        && selected !== null
        && !Array.isArray(selected)
        && Object.values(selected).every((item) => typeof item === "string" && AgentId.isValid(item));
}
//# sourceMappingURL=fs-agent-session-store.js.map