import { createHash } from "node:crypto";
import * as fs from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import type { SkillHealth, SkillInstallResult, SkillManager } from "../../../ports/outbound/skill-manager.js";

interface SkillDefinition {
  readonly name: string;
}

interface InstallPlanItem {
  readonly action: "create" | "unchanged" | "conflict";
  readonly file: string;
}

interface EmbeddedInstallResult {
  readonly code: number;
  readonly skills: readonly string[];
  readonly plan: readonly InstallPlanItem[];
  readonly error?: string;
}

interface InstallModule {
  loadSkillDefs(profile?: string): SkillDefinition[];
  renderRepoSkillMd(definition: SkillDefinition): string;
  renderOpenaiYaml(definition: SkillDefinition): string;
  runInstall(argv: readonly string[], runtime: { readonly silent: true; readonly embedded: true }): EmbeddedInstallResult;
}

export class DirectSkillManager implements SkillManager {
  private readonly installModuleUrl: string;

  public constructor(frameworkRoot: string) {
    this.installModuleUrl = pathToFileURL(resolve(frameworkRoot, "scripts", "install.mjs")).href;
  }

  public async inspect(target: string): Promise<SkillHealth> {
    const module = await this.loadModule();
    const definitions = module.loadSkillDefs("all");
    let healthy = 0;
    let missing = 0;
    let divergent = 0;
    for (const definition of definitions) {
      const expected = [
        [join(target, ".claude", "skills", definition.name, "SKILL.md"), module.renderRepoSkillMd(definition)],
        [join(target, ".agents", "skills", definition.name, "SKILL.md"), module.renderRepoSkillMd(definition)],
        [join(target, ".agents", "skills", definition.name, "agents", "openai.yaml"), module.renderOpenaiYaml(definition)],
      ] as const;
      const states = await Promise.all(expected.map(([file, content]) => fileState(file, content)));
      if (states.every((state) => state === "ok")) healthy++;
      else if (states.some((state) => state === "divergent")) divergent++;
      else missing++;
    }
    return { total: definitions.length, healthy, missing, divergent };
  }

  public async install(input: { readonly target: string; readonly global?: boolean; readonly force?: boolean }): Promise<SkillInstallResult> {
    const module = await this.loadModule();
    const args = ["--target", input.target, "--profile", "all", ...(input.global === true ? ["--global"] : []), ...(input.force === true ? ["--force"] : [])];
    const result = module.runInstall(args, { silent: true, embedded: true });
    const counts = result.plan.reduce<Record<string, number>>((summary, item) => ({ ...summary, [item.action]: (summary[item.action] ?? 0) + 1 }), {});
    const output = result.error ?? `Skills : ${result.skills.length} · créations=${counts["create"] ?? 0} · inchangés=${counts["unchanged"] ?? 0} · conflits=${counts["conflict"] ?? 0}`;
    return { code: result.code, output };
  }

  private async loadModule(): Promise<InstallModule> {
    const loaded: unknown = await import(this.installModuleUrl);
    return loaded as InstallModule;
  }
}

async function fileState(file: string, expected: string): Promise<"ok" | "missing" | "divergent"> {
  try {
    const stat = await fs.lstat(file);
    if (stat.isSymbolicLink() || !stat.isFile()) return "divergent";
    const actual = await fs.readFile(file);
    return digest(actual) === digest(expected) ? "ok" : "divergent";
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return "missing";
    throw error;
  }
}

function digest(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}
