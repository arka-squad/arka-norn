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

export interface WorkspacePermissionPolicy {
  readonly mode: "preauthorized-workspace";
  readonly scopePaths: readonly string[];
  readonly permissions: readonly ("read_workspace" | "write_workspace")[];
}

export interface WorkspacePermissionGateRequest {
  readonly workspace: string;
  readonly permissionPolicy: WorkspacePermissionPolicy | "deny-all";
}

export interface WorkspacePermissionDecision {
  readonly behavior: "allow" | "deny";
  readonly message?: string;
}

export function createWorkspacePermissionGate(request: WorkspacePermissionGateRequest): (toolName: string, input: Readonly<Record<string, unknown>>) => WorkspacePermissionDecision;
export function claudeToolsForPermissionPolicy(permissionPolicy: WorkspacePermissionPolicy | "deny-all"): readonly string[];
export function isAllowedWorkspacePath(workspace: string, scopePaths: readonly string[], target: string, glob?: boolean): boolean;
