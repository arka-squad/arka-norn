import { join } from "node:path";
import { AgentId } from "../../../domain/agent/agent-id.js";
import { AgentSessionId } from "../../../domain/agent/agent-session-id.js";
import { ProjectId } from "../../../domain/project/project-id.js";
import { readJson, writeJsonAtomic } from "./_shared/atomic-json.js";
import { withFileLock } from "./_shared/file-lock.js";
export class FsAgentSessionStore {
    homeDir;
    constructor(homeDir) {
        this.homeDir = homeDir;
    }
    async current(sessionId, projectId) {
        const session = await this.load();
        const value = session.selectedBySession[sessionId.value]?.[projectId.value];
        return value === undefined ? undefined : AgentId.of(value);
    }
    async select(sessionId, projectId, agentId) {
        await this.mutate((session) => {
            const selectedBySession = cloneSelections(session.selectedBySession);
            const selectedByProject = { ...(selectedBySession[sessionId.value] ?? {}) };
            if (agentId === undefined)
                delete selectedByProject[projectId.value];
            else
                selectedByProject[projectId.value] = agentId.value;
            if (Object.keys(selectedByProject).length === 0)
                delete selectedBySession[sessionId.value];
            else
                selectedBySession[sessionId.value] = selectedByProject;
            return { schemaVersion: 2, selectedBySession };
        });
    }
    async list(projectId) {
        const session = await this.load();
        return Object.entries(session.selectedBySession)
            .flatMap(([sessionId, selectedByProject]) => {
            const agentId = selectedByProject[projectId.value];
            return agentId === undefined ? [] : [{ sessionId: AgentSessionId.of(sessionId), projectId, agentId: AgentId.of(agentId) }];
        })
            .sort((left, right) => left.sessionId.value.localeCompare(right.sessionId.value));
    }
    async clearAgent(projectId, agentId) {
        await this.mutate((session) => mapAgent(session, projectId, agentId, undefined));
    }
    async replaceAgent(projectId, replacedAgentId, replacementAgentId) {
        await this.mutate((session) => mapAgent(session, projectId, replacedAgentId, replacementAgentId));
    }
    async mutate(operation) {
        const path = this.path();
        await withFileLock(path, async () => {
            const next = operation(await this.load());
            await writeJsonAtomic(path, next, { mode: 0o600 });
        });
    }
    path() {
        return join(this.homeDir, ".arka-norn", "context", "agents.json");
    }
    async load() {
        const value = await readJson(this.path());
        if (value === undefined)
            return { schemaVersion: 2, selectedBySession: {} };
        if (!isAgentSessionFile(value))
            throw new Error(`Invalid agent session file: ${this.path()}`);
        return normalizeAgentSessionFile(value);
    }
}
export function isAgentSessionFile(value) {
    if (!isRecord(value))
        return false;
    if (value["schemaVersion"] === 1) {
        return hasExactKeys(value, ["schemaVersion", "selectedByProject"])
            && isProjectSelections(value["selectedByProject"]);
    }
    if (value["schemaVersion"] === 2) {
        const selected = value["selectedBySession"];
        return hasExactKeys(value, ["schemaVersion", "selectedBySession"])
            && isRecord(selected)
            && Object.entries(selected).every(([sessionId, projects]) => AgentSessionId.isValid(sessionId) && isProjectSelections(projects));
    }
    return false;
}
export function normalizeAgentSessionFile(value) {
    return value.schemaVersion === 2
        ? { schemaVersion: 2, selectedBySession: cloneSelections(value.selectedBySession) }
        : { schemaVersion: 2, selectedBySession: Object.keys(value.selectedByProject).length === 0 ? {} : { main: { ...value.selectedByProject } } };
}
export function agentSessionSelections(value) {
    const normalized = normalizeAgentSessionFile(value);
    return Object.entries(normalized.selectedBySession).flatMap(([sessionId, projects]) => Object.entries(projects).map(([projectId, agentId]) => ({ sessionId, projectId, agentId })));
}
function mapAgent(session, projectId, source, target) {
    const selectedBySession = cloneSelections(session.selectedBySession);
    for (const [sessionId, projects] of Object.entries(selectedBySession)) {
        if (projects[projectId.value] !== source.value)
            continue;
        const nextProjects = { ...projects };
        if (target === undefined)
            delete nextProjects[projectId.value];
        else
            nextProjects[projectId.value] = target.value;
        if (Object.keys(nextProjects).length === 0)
            delete selectedBySession[sessionId];
        else
            selectedBySession[sessionId] = nextProjects;
    }
    return { schemaVersion: 2, selectedBySession };
}
function cloneSelections(value) {
    return Object.fromEntries(Object.entries(value).map(([sessionId, projects]) => [sessionId, { ...projects }]));
}
function isProjectSelections(value) {
    return isRecord(value)
        && Object.entries(value).every(([projectId, agentId]) => ProjectId.isValid(projectId) && typeof agentId === "string" && AgentId.isValid(agentId));
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function hasExactKeys(value, expected) {
    const actual = Object.keys(value).sort();
    const sortedExpected = [...expected].sort();
    return actual.length === sortedExpected.length && actual.every((key, index) => key === sortedExpected[index]);
}
//# sourceMappingURL=fs-agent-session-store.js.map