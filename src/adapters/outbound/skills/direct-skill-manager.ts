import { homedir } from "node:os";

import type { SkillHealth, SkillInstallResult, SkillManager } from "../../../ports/outbound/skill-manager.js";
import { inspectSkills, installSkills } from "./skill-installer.js";

export class DirectSkillManager implements SkillManager {
  private readonly frameworkRoot: string;

  public constructor(frameworkRoot: string) {
    this.frameworkRoot = frameworkRoot;
  }

  public inspect(target: string, profile = "all"): Promise<SkillHealth> {
    const definitions = inspectSkills(this.frameworkRoot, target, profile);
    let healthy = 0;
    let missing = 0;
    let divergent = 0;
    for (const definition of definitions) {
      if (definition.status === "ok") healthy++;
      else if (definition.status === "divergent") divergent++;
      else missing++;
    }
    return Promise.resolve({ total: definitions.length, healthy, missing, divergent });
  }

  public install(input: { readonly target: string; readonly profile?: string; readonly global?: boolean; readonly force?: boolean }): Promise<SkillInstallResult> {
    const result = installSkills(this.frameworkRoot, {
      target: input.target,
      profile: input.profile ?? "all",
      ...(input.global === undefined ? {} : { global: input.global }),
      ...(input.global === true ? { globalHome: homedir() } : {}),
      ...(input.force === undefined ? {} : { force: input.force }),
    });
    const counts = result.plan.reduce<Record<string, number>>((summary, item) => ({ ...summary, [item.action]: (summary[item.action] ?? 0) + 1 }), {});
    const output = result.error ?? `Skills : ${result.skills.length} · créations=${counts["create"] ?? 0} · inchangés=${counts["unchanged"] ?? 0} · conflits=${counts["conflict"] ?? 0}`;
    return Promise.resolve({ code: result.code, output });
  }
}
