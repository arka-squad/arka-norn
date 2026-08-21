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