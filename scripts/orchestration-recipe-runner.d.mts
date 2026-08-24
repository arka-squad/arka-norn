export interface RecipeResolution {
  readonly status: "ready" | "blocked";
  readonly script?: string;
  readonly code?: string;
  readonly reason?: string;
}

export interface RecipeOutcome extends RecipeResolution {
  readonly recipe?: "test" | "build" | "typecheck" | "lint";
  readonly image?: string;
  readonly runtime?: "docker" | "podman";
  readonly exitCode?: number | null;
  readonly stdout?: string;
  readonly stderr?: string;
  readonly truncated?: boolean;
}

export function resolveNodeRecipe(workspace: string, kind: string): Promise<RecipeResolution>;
export function prepareRecipeWorkspace(workspace: string): Promise<string>;
export function runRecipe(input: { readonly workspace: string; readonly kind: "test" | "build" | "typecheck" | "lint"; readonly timeoutMs?: number }): Promise<RecipeOutcome>;
