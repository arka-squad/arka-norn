import { homedir } from "node:os";
import { inspectGlobalSkills, inspectSkills, installSkills } from "./skill-installer.js";
export class DirectSkillManager {
    frameworkRoot;
    globalHome;
    constructor(frameworkRoot, globalHome = homedir()) {
        this.frameworkRoot = frameworkRoot;
        this.globalHome = globalHome;
    }
    inspect(target, profile = "all") {
        return Promise.resolve(summarize(inspectSkills(this.frameworkRoot, target, profile)));
    }
    inspectGlobal(profile = "all") {
        return Promise.resolve(summarize(inspectGlobalSkills(this.frameworkRoot, this.globalHome, profile)));
    }
    install(input) {
        const result = installSkills(this.frameworkRoot, {
            target: input.target,
            profile: input.profile ?? "all",
            ...(input.global === undefined ? {} : { global: input.global }),
            ...(input.global === true ? { globalHome: this.globalHome } : {}),
            ...(input.force === undefined ? {} : { force: input.force }),
        });
        const counts = result.plan.reduce((summary, item) => ({ ...summary, [item.action]: (summary[item.action] ?? 0) + 1 }), {});
        const output = result.error ?? `Skills : ${result.skills.length} · créations=${counts["create"] ?? 0} · inchangés=${counts["unchanged"] ?? 0} · conflits=${counts["conflict"] ?? 0}`;
        return Promise.resolve({ code: result.code, output });
    }
}
function summarize(definitions) {
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
    return { total: definitions.length, healthy, missing, divergent };
}
//# sourceMappingURL=direct-skill-manager.js.map