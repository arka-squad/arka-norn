export interface SkillHealth {
  readonly total: number;
  readonly healthy: number;
  readonly missing: number;
  readonly divergent: number;
}

export interface SkillInstallResult {
  readonly code: number;
  readonly output: string;
}

export interface SkillManager {
  inspect(target: string): Promise<SkillHealth>;
  install(input: { readonly target: string; readonly global?: boolean; readonly force?: boolean }): Promise<SkillInstallResult>;
}
