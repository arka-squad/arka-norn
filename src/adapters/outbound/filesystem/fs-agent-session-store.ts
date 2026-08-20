import { join } from "node:path";

import { AgentId } from "../../../domain/agent/agent-id.js";
import { AgentSessionId } from "../../../domain/agent/agent-session-id.js";
import { ProjectId } from "../../../domain/project/project-id.js";
import type { AgentSessionBinding, AgentSessionStore } from "../../../ports/outbound/agent-session-store.js";

import { readJson, writeJsonAtomic } from "./_shared/atomic-json.js";
import { withFileLock } from "./_shared/file-lock.js";

export interface SessionFileV1 {
  readonly schemaVersion: 1;
  readonly selectedByProject: Readonly<Record<string, string>>;
}

export interface SessionFileV2 {
  readonly schemaVersion: 2;
  readonly selectedBySession: Readonly<Record<string, Readonly<Record<string, string>>>>;
}

export type AgentSessionFile = SessionFileV1 | SessionFileV2;

export class FsAgentSessionStore implements AgentSessionStore {
  public constructor(private readonly homeDir: string) {}

  public async current(sessionId: AgentSessionId, projectId: ProjectId): Promise<AgentId | undefined> {
    const session = await this.load();
    const value = session.selectedBySession[sessionId.value]?.[projectId.value];
    return value === undefined ? undefined : AgentId.of(value);
  }

  public async select(sessionId: AgentSessionId, projectId: ProjectId, agentId: AgentId | undefined): Promise<void> {
    await this.mutate((session) => {
      const selectedBySession = cloneSelections(session.selectedBySession);
      const selectedByProject = { ...(selectedBySession[sessionId.value] ?? {}) };
      if (agentId === undefined) delete selectedByProject[projectId.value];
      else selectedByProject[projectId.value] = agentId.value;
      if (Object.keys(selectedByProject).length === 0) delete selectedBySession[sessionId.value];
      else selectedBySession[sessionId.value] = selectedByProject;
      return { schemaVersion: 2, selectedBySession };
    });
  }

  public async list(projectId: ProjectId): Promise<readonly AgentSessionBinding[]> {
    const session = await this.load();
    return Object.entries(session.selectedBySession)
      .flatMap(([sessionId, selectedByProject]) => {
        const agentId = selectedByProject[projectId.value];
        return agentId === undefined ? [] : [{ sessionId: AgentSessionId.of(sessionId), projectId, agentId: AgentId.of(agentId) }];
      })
      .sort((left, right) => left.sessionId.value.localeCompare(right.sessionId.value));
  }

  public async clearAgent(projectId: ProjectId, agentId: AgentId): Promise<void> {
    await this.mutate((session) => mapAgent(session, projectId, agentId, undefined));
  }

  public async replaceAgent(projectId: ProjectId, replacedAgentId: AgentId, replacementAgentId: AgentId): Promise<void> {
    await this.mutate((session) => mapAgent(session, projectId, replacedAgentId, replacementAgentId));
  }

  private async mutate(operation: (session: SessionFileV2) => SessionFileV2): Promise<void> {
    const path = this.path();
    await withFileLock(path, async () => {
      const next = operation(await this.load());
      await writeJsonAtomic(path, next, { mode: 0o600 });
    });
  }

  private path(): string {
    return join(this.homeDir, ".arka-norn", "context", "agents.json");
  }

  private async load(): Promise<SessionFileV2> {
    const value = await readJson<unknown>(this.path());
    if (value === undefined) return { schemaVersion: 2, selectedBySession: {} };
    if (!isAgentSessionFile(value)) throw new Error(`Invalid agent session file: ${this.path()}`);
    return normalizeAgentSessionFile(value);
  }
}

export function isAgentSessionFile(value: unknown): value is AgentSessionFile {
  if (!isRecord(value)) return false;
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

export function normalizeAgentSessionFile(value: AgentSessionFile): SessionFileV2 {
  return value.schemaVersion === 2
    ? { schemaVersion: 2, selectedBySession: cloneSelections(value.selectedBySession) }
    : { schemaVersion: 2, selectedBySession: Object.keys(value.selectedByProject).length === 0 ? {} : { main: { ...value.selectedByProject } } };
}

export function agentSessionSelections(value: AgentSessionFile): readonly { readonly sessionId: string; readonly projectId: string; readonly agentId: string }[] {
  const normalized = normalizeAgentSessionFile(value);
  return Object.entries(normalized.selectedBySession).flatMap(([sessionId, projects]) =>
    Object.entries(projects).map(([projectId, agentId]) => ({ sessionId, projectId, agentId })),
  );
}

function mapAgent(session: SessionFileV2, projectId: ProjectId, source: AgentId, target: AgentId | undefined): SessionFileV2 {
  const selectedBySession = cloneSelections(session.selectedBySession);
  for (const [sessionId, projects] of Object.entries(selectedBySession)) {
    if (projects[projectId.value] !== source.value) continue;
    const nextProjects = { ...projects };
    if (target === undefined) delete nextProjects[projectId.value];
    else nextProjects[projectId.value] = target.value;
    if (Object.keys(nextProjects).length === 0) delete selectedBySession[sessionId];
    else selectedBySession[sessionId] = nextProjects;
  }
  return { schemaVersion: 2, selectedBySession };
}

function cloneSelections(value: SessionFileV2["selectedBySession"]): Record<string, Record<string, string>> {
  return Object.fromEntries(Object.entries(value).map(([sessionId, projects]) => [sessionId, { ...projects }]));
}

function isProjectSelections(value: unknown): value is Readonly<Record<string, string>> {
  return isRecord(value)
    && Object.entries(value).every(([projectId, agentId]) => ProjectId.isValid(projectId) && typeof agentId === "string" && AgentId.isValid(agentId));
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Readonly<Record<string, unknown>>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length && actual.every((key, index) => key === sortedExpected[index]);
}
