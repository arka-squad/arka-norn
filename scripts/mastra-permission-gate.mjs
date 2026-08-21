/*
 * Copyright 2026 Arka Labs
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { existsSync, lstatSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";

// These directories are Arka's control plane or a nested repository's control
// plane. A Feature worker must never be able to read or change them, even
// when the mission legitimately covers the whole Feature workspace (`.`).
const RESERVED_WORKSPACE_SEGMENTS = new Set([".arka-norn", ".git"]);

/**
 * Provider-side guard for the small, structured Claude tool surface used by
 * automatic Feature missions. It is deliberately not presented as an OS
 * sandbox: it denies unknown tools and validates every declared file path
 * before the SDK receives an allow decision.
 */
export function createWorkspacePermissionGate(request) {
  const workspace = realpathSync(request.workspace);
  const policy = request.permissionPolicy;
  if (policy === "deny-all") return () => deny("No workspace permission is preauthorized.");
  const scopes = policy.scopePaths.map((path) => resolveWorkspacePath(workspace, path));

  return (toolName, input) => {
    const access = accessForTool(toolName);
    if (access === undefined) return deny("This tool is not available to an automatic Arka mission.");
    if (!policy.permissions.includes(access.permission)) return deny("This workspace operation is not preauthorized.");
    const target = targetForTool(toolName, input, workspace);
    if (target === undefined || !isAllowedTarget(target, workspace, scopes, access.glob)) {
      return deny("The requested workspace path is outside the preauthorized Feature scope.");
    }
    return { behavior: "allow" };
  };
}

/**
 * Keep the provider's exposed tool surface aligned with the immutable
 * MissionOrder permission policy. The gate below remains the second line of
 * defence for every individual call, but a read-only mission must not even
 * advertise Edit or Write to the SDK.
 */
export function claudeToolsForPermissionPolicy(permissionPolicy) {
  if (permissionPolicy === "deny-all") return [];
  const tools = ["Read", "Glob", "Grep"];
  if (permissionPolicy.permissions.includes("write_workspace")) {
    tools.push("Edit", "Write");
  }
  return tools;
}

/** Exported for deterministic tests; never returns a raw filesystem path. */
export function isAllowedWorkspacePath(workspace, scopePaths, target, glob = false) {
  const root = realpathSync(workspace);
  const scopes = scopePaths.map((path) => resolveWorkspacePath(root, path));
  return isAllowedTarget(target, root, scopes, glob);
}

function accessForTool(toolName) {
  if (["Read", "Glob", "Grep"].includes(toolName)) {
    return { permission: "read_workspace", glob: toolName === "Glob" || toolName === "Grep" };
  }
  if (["Edit", "Write"].includes(toolName)) return { permission: "write_workspace", glob: false };
  return undefined;
}

function targetForTool(toolName, input, workspace) {
  if (!isRecord(input)) return undefined;
  const value = input.file_path ?? input.filePath ?? input.path;
  if ((toolName === "Glob" || toolName === "Grep") && !isSafeRelativePatternPath(value)) return undefined;
  if (typeof value === "string" && value.length > 0 && !value.includes("\u0000")) {
    return resolveWorkspacePath(workspace, value);
  }
  // Glob/Grep must provide an explicit structured path. A pattern by itself is
  // resolved by the SDK from cwd and could include the control plane.
  return undefined;
}

function resolveWorkspacePath(workspace, value) {
  return resolve(isAbsolute(value) ? value : resolve(workspace, value));
}

function isAllowedTarget(target, workspace, scopes, glob) {
  const checked = canonicalExistingAncestor(glob ? globBase(target) : target);
  if (!inside(workspace, checked) || !inside(workspace, target)) return false;
  if (isReservedControlPlanePath(workspace, checked) || isReservedControlPlanePath(workspace, target)) return false;
  return scopes.some((scope) => inside(scope, checked) && inside(scope, target));
}

function isSafeRelativePatternPath(value) {
  return typeof value === "string"
    && value.length > 0
    && !value.includes("\u0000")
    && !isAbsolute(value)
    && !value.replaceAll("\\", "/").split("/").includes("..");
}

function isReservedControlPlanePath(workspace, target) {
  const path = relative(workspace, target).replaceAll("\\", "/");
  return path.split("/").some((segment) => RESERVED_WORKSPACE_SEGMENTS.has(segment));
}

function canonicalExistingAncestor(target) {
  let current = target;
  while (!existsSync(current)) {
    const parent = resolve(current, "..");
    if (parent === current) return current;
    current = parent;
  }
  // lstat protects existing symlink leaves; realpath protects every existing
  // ancestor that can redirect the provider outside the Feature workspace.
  if (lstatSync(current).isSymbolicLink()) return realpathSync(current);
  return realpathSync(current);
}

function globBase(target) {
  const index = [...target].findIndex((character) => "*!?[]{}".includes(character));
  if (index === -1) return target;
  const prefix = target.slice(0, index);
  if (prefix.length === 0) return target;
  return prefix.endsWith("/") || prefix.endsWith("\\") ? resolve(prefix) : resolve(prefix, "..");
}

function inside(root, target) {
  const relation = relative(root, target);
  return relation === "" || (!relation.startsWith(`..${String.fromCharCode(47)}`) && relation !== ".." && !isAbsolute(relation));
}

function deny(message) {
  return { behavior: "deny", message };
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
