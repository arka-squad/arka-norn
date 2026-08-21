import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join } from "node:path";

import type { AgentExecutionMission, AgentExecutionPermissionPolicy } from "../../../ports/outbound/agent-execution-port.js";

const MAX_EXECUTION_ID_LENGTH = 128;
const MAX_MISSION_LENGTH = 64 * 1024;
const MAX_ARGUMENTS = 64;
const MAX_ARGUMENT_LENGTH = 4 * 1024;
const MAX_SCOPE_PATHS = 64;
const MAX_TIMEOUT_MS = 60 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const SAFE_ENVIRONMENT_NAMES = new Set(["LANG", "LC_ALL", "LC_CTYPE", "TERM", "NO_COLOR", "TZ"]);
const PROHIBITED_LAUNCHERS = new Set(["npx", "npx.cmd", "npm", "npm.cmd", "bunx", "yarn", "yarn.cmd", "pnpm", "pnpm.cmd"]);

export interface IsolatedExecutionRuntime {
  readonly environment: NodeJS.ProcessEnv;
  cleanup(): void;
}

/**
 * An explicitly supplied credential is held only in the worker process
 * environment. It never enters a MissionOrder, worker payload, audit event or
 * durable execution record.
 */
export interface EphemeralProviderCredential {
  readonly name: "ANTHROPIC_API_KEY" | "OPENAI_API_KEY";
  readonly value: string;
}

export function validateAgentExecutionMission(mission: AgentExecutionMission): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(mission.executionId)) {
    throw new Error("Agent execution id is invalid.");
  }
  if (mission.executionId.length > MAX_EXECUTION_ID_LENGTH) {
    throw new Error("Agent execution id exceeds the supported length.");
  }
  if (mission.mission.trim().length === 0 || mission.mission.length > MAX_MISSION_LENGTH || mission.mission.includes("\u0000")) {
    throw new Error("Agent mission is invalid or exceeds the supported length.");
  }
  validatePermissionPolicy(mission.permissionPolicy);
  resolveExecutionWorkspace(mission.workspace);
  validateSafeEnvironment(mission.safeEnvironment);
  normalizeTimeout(mission.timeoutMs);
  if (mission.provider === "codex-acp") {
    resolveAcpExecutable(mission.command);
    validateArguments(mission.args);
    validateOptionalValue(mission.authMethodId, "ACP authentication method");
    validateOptionalValue(mission.model, "ACP model");
    return;
  }
  validateOptionalValue(mission.model, "Claude model");
}

export function resolveExecutionWorkspace(workspace: string): string {
  if (!isAbsolute(workspace)) throw new Error("Agent execution workspace must be absolute.");
  try {
    const resolved = realpathSync(workspace);
    if (!statSync(resolved).isDirectory()) throw new Error("not-directory");
    return resolved;
  } catch {
    throw new Error("Agent execution workspace is not an accessible directory.");
  }
}

export function resolveAcpExecutable(command: string): string {
  if (!isAbsolute(command)) throw new Error("Codex ACP command must be an absolute executable path.");
  try {
    const resolved = realpathSync(command);
    if (!statSync(resolved).isFile()) throw new Error("not-file");
    if (PROHIBITED_LAUNCHERS.has(basename(resolved).toLowerCase())) {
      throw new Error("package-launcher");
    }
    return resolved;
  } catch {
    throw new Error("Codex ACP command must be an installed executable, not a package launcher.");
  }
}

export function normalizeTimeout(timeoutMs: number | undefined): number {
  const normalized = timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isSafeInteger(normalized) || normalized < 1_000 || normalized > MAX_TIMEOUT_MS) {
    throw new Error("Agent execution timeout must be between 1000 and 3600000 milliseconds.");
  }
  return normalized;
}

export function createIsolatedExecutionRuntime(
  safeEnvironment: Readonly<Record<string, string>> | undefined,
  credential?: EphemeralProviderCredential,
): IsolatedExecutionRuntime {
  const root = mkdtempSync(join(tmpdir(), "arka-norn-mastra-"));
  try {
    chmodSync(root, 0o700);
    const home = join(root, "home");
    const temporaryDirectory = join(root, "tmp");
    mkdirSync(home, { mode: 0o700 });
    mkdirSync(temporaryDirectory, { mode: 0o700 });
    const environment: NodeJS.ProcessEnv = {
      ARKA_NORN_MASTRA_ISOLATED: "1",
      HOME: home,
      USERPROFILE: home,
      TMPDIR: temporaryDirectory,
      TMP: temporaryDirectory,
      TEMP: temporaryDirectory,
      PATH: dirname(process.execPath),
    };
    if (process.platform === "win32") {
      const systemRoot = process.env["SystemRoot"] ?? process.env["SYSTEMROOT"];
      if (systemRoot !== undefined) {
        environment["SystemRoot"] = systemRoot;
        environment["SYSTEMROOT"] = systemRoot;
      }
    }
    for (const [name, value] of Object.entries(safeEnvironment ?? {})) environment[name] = value;
    if (credential !== undefined) {
      validateEphemeralCredential(credential);
      environment[credential.name] = credential.value;
    }
    return {
      environment,
      cleanup(): void {
        rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 25 });
      },
    };
  } catch (error) {
    rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 25 });
    throw error;
  }
}

function validateArguments(args: readonly string[] | undefined): void {
  if (args === undefined) return;
  if (args.length > MAX_ARGUMENTS) throw new Error("Codex ACP has too many arguments.");
  for (const argument of args) {
    if (argument.length > MAX_ARGUMENT_LENGTH || argument.includes("\u0000")) {
      throw new Error("Codex ACP argument is invalid.");
    }
  }
}

function validateSafeEnvironment(environment: Readonly<Record<string, string>> | undefined): void {
  if (environment === undefined) return;
  for (const [name, value] of Object.entries(environment)) {
    if (!SAFE_ENVIRONMENT_NAMES.has(name) || !/^[A-Z][A-Z0-9_]{0,63}$/.test(name)) {
      throw new Error("Agent execution environment contains an unsupported variable.");
    }
    if (value.length > MAX_ARGUMENT_LENGTH || value.includes("\u0000")) {
      throw new Error("Agent execution environment contains an invalid value.");
    }
  }
}

function validatePermissionPolicy(policy: AgentExecutionPermissionPolicy | undefined): void {
  if (policy === undefined || policy === "deny-all") return;
  if (policy.mode !== "preauthorized-workspace") {
    throw new Error("Agent execution permission policy is unsupported.");
  }
  if (!Array.isArray(policy.scopePaths) || policy.scopePaths.length === 0 || policy.scopePaths.length > MAX_SCOPE_PATHS) {
    throw new Error("Agent execution workspace scope is invalid.");
  }
  const paths = policy.scopePaths.map(normalizeRelativeScopePath);
  if (new Set(paths).size !== paths.length) {
    throw new Error("Agent execution workspace scope contains duplicate paths.");
  }
  if (!Array.isArray(policy.permissions) || policy.permissions.length === 0 || policy.permissions.length > 2) {
    throw new Error("Agent execution workspace permissions are invalid.");
  }
  if (policy.permissions.some((permission) => permission !== "read_workspace" && permission !== "write_workspace")
    || new Set(policy.permissions).size !== policy.permissions.length) {
    throw new Error("Agent execution workspace permissions are invalid.");
  }
}

function normalizeRelativeScopePath(value: string): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 512 || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new Error("Agent execution workspace scope contains an invalid path.");
  }
  const normalized = value.replaceAll("\\", "/").replace(/^\.\//u, "").replace(/\/+$/u, "") || ".";
  const segments = normalized.split("/");
  if (normalized.startsWith("/") || /^[A-Za-z]:\//u.test(normalized) || segments.includes("..") || segments.some((segment) => segment.length === 0)) {
    throw new Error("Agent execution workspace scope must stay relative to the workspace.");
  }
  return normalized;
}

function validateOptionalValue(value: string | undefined, label: string): void {
  if (value === undefined) return;
  if (value.trim().length === 0 || value.length > MAX_ARGUMENT_LENGTH || value.includes("\u0000")) {
    throw new Error(label + " is invalid.");
  }
}

function validateEphemeralCredential(value: EphemeralProviderCredential): void {
  if ((value.name !== "ANTHROPIC_API_KEY" && value.name !== "OPENAI_API_KEY")
    || typeof value.value !== "string"
    || value.value.length === 0
    || value.value.length > 16 * 1024
    || value.value.includes("\u0000")) {
    throw new Error("An explicit provider credential is invalid.");
  }
}
