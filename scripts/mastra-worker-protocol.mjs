import { basename, isAbsolute } from "node:path";

const MAX_REQUEST_BYTES = 128 * 1024;
const MAX_MISSION_LENGTH = 64 * 1024;
const PROHIBITED_LAUNCHERS = new Set(["npx", "npx.cmd", "npm", "npm.cmd", "bunx", "yarn", "yarn.cmd", "pnpm", "pnpm.cmd"]);
const ALLOWED_WORKER_ENVIRONMENT = new Set([
  "ARKA_NORN_MASTRA_ISOLATED",
  "HOME",
  "USERPROFILE",
  "TMPDIR",
  "TMP",
  "TEMP",
  "PATH",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "TERM",
  "NO_COLOR",
  "TZ",
  "SystemRoot",
  "SYSTEMROOT",
  // Added only by MastraAgentExecutionAdapter from an explicit runtime option.
  // They never arrive in the JSON request and are never written to stdout.
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "ANTHROPIC_BASE_URL",
  "KIMI_MODEL_API_KEY",
  "KIMI_MODEL_BASE_URL",
  "KIMI_MODEL_NAME",
  "KIMI_CODE_HOME",
  "KIMI_DISABLE_TELEMETRY",
]);

export async function readWorkerRequest(expectedProvider) {
  enforceIsolatedEnvironment();
  let raw = "";
  for await (const chunk of process.stdin) {
    raw += String(chunk);
    if (Buffer.byteLength(raw, "utf8") > MAX_REQUEST_BYTES) {
      throw new Error("Worker request exceeds its bounded size.");
    }
  }
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("Worker request is not valid JSON.");
  }
  if (!isRecord(value) || value.type !== "run" || value.provider !== expectedProvider) {
    throw new Error("Worker request provider is invalid.");
  }
  const executionId = requiredString(value.executionId);
  const mission = requiredString(value.mission);
  const workspace = requiredString(value.workspace);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(executionId) || mission.length > MAX_MISSION_LENGTH || mission.includes("\u0000")) {
    throw new Error("Worker request values are invalid.");
  }
  if (!isAbsolute(workspace)) throw new Error("Worker workspace must be absolute.");
  const permissionPolicy = parsePermissionPolicy(value.permissionPolicy);
  const model = optionalString(value.model);
  if (expectedProvider === "codex-acp" || expectedProvider === "kimi-acp") {
    const command = requiredString(value.command);
    if (!isAbsolute(command) || PROHIBITED_LAUNCHERS.has(basename(command).toLowerCase())) {
      throw new Error("Worker ACP command is invalid.");
    }
    const args = optionalStringArray(value.args);
    const authMethodId = optionalString(value.authMethodId);
    return {
      executionId,
      provider: expectedProvider,
      mission,
      workspace,
      permissionPolicy,
      command,
      args,
      ...(authMethodId === undefined ? {} : { authMethodId }),
      ...(model === undefined ? {} : { model }),
    };
  }
  return {
    executionId,
    provider: "claude",
    mission,
    workspace,
    permissionPolicy,
    ...(model === undefined ? {} : { model }),
  };
}

export function writeWorkerResult(result) {
  process.stdout.write(JSON.stringify({ type: "result", ...result }) + "\n");
}

export function enforceIsolatedEnvironment() {
  if (process.env.ARKA_NORN_MASTRA_ISOLATED !== "1") {
    throw new Error("Mastra worker refuses a non-isolated environment.");
  }
  for (const name of Object.keys(process.env)) {
    if (!ALLOWED_WORKER_ENVIRONMENT.has(name)) delete process.env[name];
  }
  if (process.env.ANTHROPIC_BASE_URL !== undefined && process.env.ANTHROPIC_BASE_URL !== "https://api.z.ai/api/anthropic") {
    throw new Error("Mastra worker refuses an untrusted Anthropic endpoint.");
  }
  if (process.env.KIMI_MODEL_BASE_URL !== undefined && process.env.KIMI_MODEL_BASE_URL !== "https://api.kimi.com/coding/v1") {
    throw new Error("Mastra worker refuses an untrusted Kimi endpoint.");
  }
}

function requiredString(value) {
  if (typeof value !== "string" || value.trim().length === 0 || value.includes("\u0000")) {
    throw new Error("Worker request string is invalid.");
  }
  return value;
}

function optionalString(value) {
  if (value === undefined) return undefined;
  return requiredString(value);
}

function optionalStringArray(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 64 || value.some((item) => typeof item !== "string" || item.includes("\u0000"))) {
    throw new Error("Worker ACP arguments are invalid.");
  }
  return value;
}

function parsePermissionPolicy(value) {
  if (value === "deny-all") return "deny-all";
  if (!isRecord(value) || value.mode !== "preauthorized-workspace") {
    throw new Error("Worker permission policy is invalid.");
  }
  if (!Array.isArray(value.scopePaths) || value.scopePaths.length === 0 || value.scopePaths.length > 64
    || value.scopePaths.some((path) => !isRelativeScopePath(path))) {
    throw new Error("Worker workspace scope is invalid.");
  }
  const normalizedPaths = value.scopePaths.map((path) => path.replaceAll("\\", "/").replace(/^\.\//u, "").replace(/\/+$/u, "") || ".");
  if (new Set(normalizedPaths).size !== normalizedPaths.length) {
    throw new Error("Worker workspace scope contains duplicate paths.");
  }
  if (!Array.isArray(value.permissions) || value.permissions.length === 0 || value.permissions.length > 2
    || value.permissions.some((permission) => permission !== "read_workspace" && permission !== "write_workspace")
    || new Set(value.permissions).size !== value.permissions.length) {
    throw new Error("Worker workspace permissions are invalid.");
  }
  return {
    mode: "preauthorized-workspace",
    scopePaths: normalizedPaths,
    permissions: [...value.permissions],
  };
}

function isRelativeScopePath(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 512 || /[\u0000-\u001f\u007f]/u.test(value)) {
    return false;
  }
  const normalized = value.replaceAll("\\", "/").replace(/^\.\//u, "").replace(/\/+$/u, "") || ".";
  const segments = normalized.split("/");
  return !normalized.startsWith("/") && !/^[A-Za-z]:\//u.test(normalized)
    && !segments.includes("..") && !segments.some((segment) => segment.length === 0);
}

function isRecord(value) {
  return typeof value === "object" && value !== null;
}
