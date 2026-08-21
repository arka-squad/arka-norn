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
