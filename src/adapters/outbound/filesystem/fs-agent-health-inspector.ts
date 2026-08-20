import * as fs from "node:fs/promises";
import { join } from "node:path";

import type { IndexInspection } from "../../../ports/outbound/doctor-index-inspector.js";
import { readRaw } from "./_shared/atomic-json.js";
import { isProjectIndexFile } from "./_shared/index-codec.js";
import { FsAgentRegistryStore, agentRegistryPath } from "./fs-agent-registry-store.js";
import { agentSessionSelections, isAgentSessionFile } from "./fs-agent-session-store.js";
import { FsProjectStore } from "./fs-project-store.js";

export class FsAgentHealthInspector {
  public constructor(
    private readonly home: string,
    private readonly target: string | undefined,
  ) {}

  public async inspectSession(): Promise<IndexInspection> {
    const target = join(this.home, ".arka-norn", "context", "agents.json");
    const raw = await readRaw(target).catch((error: unknown) => error instanceof Error ? error : new Error(String(error)));
    if (raw instanceof Error) return check("agents.session", "fail", raw.message);
    if (raw === undefined) return check("agents.session", "pass", "no local agent selection yet");
    try {
      const value = JSON.parse(raw) as unknown;
      if (!isAgentSessionFile(value)) return check("agents.session", "fail", "local agent selection schema invalid");
      const selections = agentSessionSelections(value);
      const invalid = await this.invalidSelections(selections);
      if (invalid.length > 0) {
        return check("agents.session", "fail", `${invalid.length}/${selections.length} invalid local selection(s): ${invalid.slice(0, 3).join(", ")}`);
      }
      const mode = (await fs.stat(target)).mode & 0o777;
      if (process.platform !== "win32" && mode !== 0o600) {
        return check("agents.session", "warn", `permissions are ${mode.toString(8)} instead of 600`);
      }
      return check("agents.session", "pass", `${selections.length} local project selection(s) valid`);
    } catch (error) {
      return check("agents.session", "fail", error instanceof Error ? error.message : String(error));
    }
  }

  public async inspectRegistries(): Promise<IndexInspection> {
    const raw = await readRaw(join(this.home, ".arka-norn", "index", "projects.json")).catch(() => undefined);
    if (raw === undefined) return check("agents.registries", "warn", "project index absent; no agent registry to verify");
    let value: unknown;
    try {
      value = JSON.parse(raw) as unknown;
    } catch {
      return check("agents.registries", "fail", "project index invalid; agent registries cannot be verified");
    }
    if (!isProjectIndexFile(value)) return check("agents.registries", "fail", "project index invalid; agent registries cannot be verified");
    const projectStore = new FsProjectStore();
    const registryStore = new FsAgentRegistryStore();
    const inspections = await Promise.all(value.entries.map(async (entry) => {
      if (await readRaw(agentRegistryPath(entry.root)).catch(() => undefined) === undefined) return { id: entry.id, status: "missing" as const };
      try {
        const project = await projectStore.load(entry.root);
        const agents = await registryStore.load(project);
        return { id: entry.id, status: "valid" as const, active: agents.filter((agent) => agent.active).length };
      } catch {
        return { id: entry.id, status: "invalid" as const };
      }
    }));
    const invalid = inspections.filter((item) => item.status === "invalid");
    if (invalid.length > 0) return check("agents.registries", "fail", `${invalid.length}/${inspections.length} invalid agent registry: ${invalid.map((item) => item.id).slice(0, 3).join(", ")}`);
    const missing = inspections.filter((item) => item.status === "missing");
    if (missing.length > 0) return check("agents.registries", "warn", `${missing.length}/${inspections.length} project(s) without an agent registry; register an identity before producing`);
    const active = inspections.reduce((sum, item) => sum + ("active" in item ? item.active : 0), 0);
    return check("agents.registries", "pass", `${inspections.length}/${inspections.length} registry file(s) valid, ${active} active agent(s)`);
  }

  public async inspectProjectContext(): Promise<IndexInspection> {
    if (this.target === undefined) return check("project.context", "pass", "no target Project context requested");
    const registry = await readRaw(agentRegistryPath(this.target)).catch(() => undefined);
    const projectStore = new FsProjectStore();
    const hasMarker = await projectStore.exists(this.target).catch(() => false);
    if (!hasMarker && registry === undefined) return check("project.context", "pass", "target directory is not an initialized Project");
    if (!hasMarker) return check("project.context", "fail", "agent registry exists without a Project marker in target directory");
    let project;
    try {
      project = await projectStore.load(this.target);
    } catch (error) {
      return check("project.context", "fail", `target Project marker invalid: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (registry === undefined) return check("project.context", "warn", `Project ${project.id.value} has no agent registry yet`);
    try {
      const agents = await new FsAgentRegistryStore().load(project);
      const active = agents.filter((agent) => agent.active).length;
      return check("project.context", active > 0 ? "pass" : "warn", `Project ${project.id.value} marker and registry valid; ${active} active agent(s)`);
    } catch (error) {
      return check("project.context", "fail", `target agent registry invalid: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async invalidSelections(selections: readonly { readonly sessionId: string; readonly projectId: string; readonly agentId: string }[]): Promise<readonly string[]> {
    if (selections.length === 0) return [];
    const raw = await readRaw(join(this.home, ".arka-norn", "index", "projects.json")).catch(() => undefined);
    if (raw === undefined) return selections.map(({ sessionId, projectId }) => `${sessionId}/${projectId}:project-not-indexed`);
    let index: unknown;
    try {
      index = JSON.parse(raw) as unknown;
    } catch {
      return selections.map(({ sessionId, projectId }) => `${sessionId}/${projectId}:project-index-invalid`);
    }
    if (!isProjectIndexFile(index)) return selections.map(({ sessionId, projectId }) => `${sessionId}/${projectId}:project-index-invalid`);
    const projectStore = new FsProjectStore();
    const registryStore = new FsAgentRegistryStore();
    const checks = await Promise.all(selections.map(async ({ sessionId, projectId, agentId }) => {
      const prefix = `${sessionId}/${projectId}`;
      const entry = index.entries.find((candidate) => candidate.id === projectId);
      if (entry === undefined) return `${prefix}:project-not-indexed`;
      try {
        const project = await projectStore.load(entry.root);
        if (project.id.value !== projectId) return `${prefix}:marker-id-mismatch`;
        if (await readRaw(agentRegistryPath(entry.root)).catch(() => undefined) === undefined) return `${prefix}:registry-missing`;
        const agent = (await registryStore.load(project)).find((candidate) => candidate.id.value === agentId);
        if (agent === undefined) return `${prefix}:${agentId}-missing`;
        return agent.active ? undefined : `${prefix}:${agentId}-inactive`;
      } catch {
        return `${prefix}:project-or-registry-invalid`;
      }
    }));
    return checks.filter((item): item is string => item !== undefined);
  }
}

function check(id: string, status: "pass" | "warn" | "fail", message: string): IndexInspection {
  return { check: { id, status, message, repairable: false } };
}
