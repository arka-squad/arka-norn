import { join } from "node:path";

import { AgentId } from "../../../domain/agent/agent-id.js";
import type { ProjectId } from "../../../domain/project/project-id.js";
import type { AgentSessionStore } from "../../../ports/outbound/agent-session-store.js";

import { readJson, writeJsonAtomic } from "./_shared/atomic-json.js";
import { withFileLock } from "./_shared/file-lock.js";

interface SessionFileV1 {
  readonly schemaVersion: 1;
  readonly selectedByProject: Readonly<Record<string, string>>;
}

export class FsAgentSessionStore implements AgentSessionStore {
  public constructor(private readonly homeDir: string) {}

  public async current(projectId: ProjectId): Promise<AgentId | undefined> {
    const session = await this.load();
    const value = session.selectedByProject[projectId.value];
    return value === undefined ? undefined : AgentId.of(value);
  }

  public async select(projectId: ProjectId, agentId: AgentId | undefined): Promise<void> {
    const path = this.path();
    await withFileLock(path, async () => {
      const session = await this.load();
      const selectedByProject = { ...session.selectedByProject };
      if (agentId === undefined) delete selectedByProject[projectId.value];
      else selectedByProject[projectId.value] = agentId.value;
      await writeJsonAtomic(path, { schemaVersion: 1, selectedByProject } satisfies SessionFileV1, { mode: 0o600 });
    });
  }

  private path(): string {
    return join(this.homeDir, ".arka-norn", "context", "agents.json");
  }

  private async load(): Promise<SessionFileV1> {
    const value = await readJson<unknown>(this.path());
    if (value === undefined) return { schemaVersion: 1, selectedByProject: {} };
    if (!isAgentSessionFile(value)) throw new Error(`Invalid agent session file: ${this.path()}`);
    return value;
  }
}

export function isAgentSessionFile(value: unknown): value is SessionFileV1 {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Readonly<Record<string, unknown>>;
  const selected = record["selectedByProject"];
  return Object.keys(record).length === 2
    && record["schemaVersion"] === 1
    && typeof selected === "object"
    && selected !== null
    && !Array.isArray(selected)
    && Object.values(selected).every((item) => typeof item === "string" && AgentId.isValid(item));
}
