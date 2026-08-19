import { homedir } from "node:os";
import { inspectSkills, installSkills } from "./skill-installer.js";
export class DirectSkillManager {
    frameworkRoot;
    constructor(frameworkRoot) {
        this.frameworkRoot = frameworkRoot;
    }
    inspect(target) {
        const definitions = inspectSkills(this.frameworkRoot, target);
        let healthy = 0;
        let missing = 0;
        let divergent = 0;
        for (const definition of definitions) {
            if (definition.status === "ok")
                healthy++;
            else if (definition.status === "divergent")
                divergent++;
            else
                missing++;
        }
        return Promise.resolve({ total: definitions.length, healthy, missing, divergent });
    }
    install(input) {
        const result = installSkills(this.frameworkRoot, {
            target: input.target,
            profile: "all",
            ...(input.global === undefined ? {} : { global: input.global }),
            ...(input.global === true ? { globalHome: homedir() } : {}),
            ...(input.force === undefined ? {} : { force: input.force }),
        });
        const counts = result.plan.reduce((summary, item) => ({ ...summary, [item.action]: (summary[item.action] ?? 0) + 1 }), {});
        const output = result.error ?? `Skills : ${result.skills.length} · créations=${counts["create"] ?? 0} · inchangés=${counts["unchanged"] ?? 0} · conflits=${counts["conflict"] ?? 0}`;
        return Promise.resolve({ code: result.code, output });
    }
}
//# sourceMappingURL=direct-skill-manager.js.map