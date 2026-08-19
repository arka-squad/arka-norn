import { createHash } from "node:crypto";
import * as fs from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
export class DirectSkillManager {
    installModuleUrl;
    constructor(frameworkRoot) {
        this.installModuleUrl = pathToFileURL(resolve(frameworkRoot, "scripts", "install.mjs")).href;
    }
    async inspect(target) {
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
            ];
            const states = await Promise.all(expected.map(([file, content]) => fileState(file, content)));
            if (states.every((state) => state === "ok"))
                healthy++;
            else if (states.some((state) => state === "divergent"))
                divergent++;
            else
                missing++;
        }
        return { total: definitions.length, healthy, missing, divergent };
    }
    async install(input) {
        const module = await this.loadModule();
        const args = ["--target", input.target, "--profile", "all", ...(input.global === true ? ["--global"] : []), ...(input.force === true ? ["--force"] : [])];
        const result = module.runInstall(args, { silent: true, embedded: true });
        const counts = result.plan.reduce((summary, item) => ({ ...summary, [item.action]: (summary[item.action] ?? 0) + 1 }), {});
        const output = result.error ?? `Skills : ${result.skills.length} · créations=${counts["create"] ?? 0} · inchangés=${counts["unchanged"] ?? 0} · conflits=${counts["conflict"] ?? 0}`;
        return { code: result.code, output };
    }
    async loadModule() {
        const loaded = await import(this.installModuleUrl);
        return loaded;
    }
}
async function fileState(file, expected) {
    try {
        const stat = await fs.lstat(file);
        if (stat.isSymbolicLink() || !stat.isFile())
            return "divergent";
        const actual = await fs.readFile(file);
        return digest(actual) === digest(expected) ? "ok" : "divergent";
    }
    catch (error) {
        if (error instanceof Error && "code" in error && error.code === "ENOENT")
            return "missing";
        throw error;
    }
}
function digest(value) {
    return createHash("sha256").update(value).digest("hex");
}
//# sourceMappingURL=direct-skill-manager.js.map