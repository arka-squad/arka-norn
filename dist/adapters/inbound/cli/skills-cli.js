import { resolve } from "node:path";
import { createSkillCatalogRuntime } from "../../outbound/skills/skill-catalog.js";
import { findOrphanSkills, inspectSkills, installSkills } from "../../outbound/skills/skill-installer.js";
import { CliUsageError, parseStrictArguments } from "./strict-arguments.js";
export function runSkillsCommand(argv, context) {
    const action = argv[0];
    const rest = argv.slice(1);
    const json = rest.includes("--json");
    try {
        if (action === "install")
            return install(rest, context, json);
        const parsed = parseStrictArguments(rest, {
            options: { target: "string", profile: "string", installed: "boolean", global: "boolean", json: "boolean" },
            minPositionals: 0,
            maxPositionals: 0,
        });
        const target = resolve(context.cwd, parsed.values.get("target") ?? context.cwd);
        const profile = parsed.values.get("profile") ?? "all";
        const globalHome = parsed.booleans.has("global") ? context.homeDir : undefined;
        const catalog = createSkillCatalogRuntime(context.frameworkRoot, profile);
        if (action === "list") {
            const health = parsed.booleans.has("installed")
                ? new Map(inspectSkills(context.frameworkRoot, target, profile, globalHome).map((item) => [item.name, item.status]))
                : undefined;
            const data = catalog.definitions.map((definition) => ({
                name: definition.name,
                version: definition.catalog.version,
                step: definition.catalog.step,
                checksum: definition.catalog.checksum,
                profiles: definition.catalog.profiles,
                ...(health === undefined ? {} : { status: health.get(definition.name) ?? "missing" }),
            }));
            return success("skills.list", data, json, data.map((item) => `${item.name}\t${item.version}\t${item.step}${"status" in item ? `\t${item.status}` : ""}`).join("\n"));
        }
        if (action === "doctor") {
            const checks = inspectSkills(context.frameworkRoot, target, profile, globalHome);
            const orphans = findOrphanSkills(context.frameworkRoot, target, profile, globalHome);
            const ok = checks.every((check) => check.status === "ok");
            const data = { profile, target, global: globalHome !== undefined, checks, orphans };
            const human = [
                ...checks.map((check) => `${check.status.toUpperCase()}\t${check.name}`),
                ...orphans.map((orphan) => `WARN\t${orphan.name}\tentrée arka non gérée — ${orphan.location}`),
            ].join("\n");
            return envelope("skills.doctor", ok, data, ok ? [] : ["Skills absents ou divergents."], json, ok ? 0 : 3, human);
        }
        throw new CliUsageError("skills action must be list, install or doctor");
    }
    catch (error) {
        return failure(`skills.${action ?? "unknown"}`, error, json);
    }
}
function install(argv, context, json) {
    const parsed = parseStrictArguments(argv, {
        options: { global: "boolean", "dry-run": "boolean", force: "boolean", json: "boolean", target: "string", profile: "string" },
        minPositionals: 0,
        maxPositionals: 0,
    });
    const result = installSkills(context.frameworkRoot, {
        target: resolve(context.cwd, parsed.values.get("target") ?? context.cwd),
        profile: parsed.values.get("profile") ?? "all",
        global: parsed.booleans.has("global"),
        globalHome: context.homeDir,
        dryRun: parsed.booleans.has("dry-run"),
        force: parsed.booleans.has("force"),
    });
    const data = publicInstallResult(result);
    const human = [
        `${result.dryRun ? "Plan" : "Installation"} — ${result.skills.length} skill(s), profil ${result.profile}`,
        ...data.plan.map((item) => `  ${item.action.padEnd(9)} ${item.file}`),
    ].join("\n");
    return envelope("skills.install", result.ok, data, result.error === undefined ? [] : [result.error], json, result.code, human);
}
function publicInstallResult(result) {
    return {
        dryRun: result.dryRun,
        profile: result.profile,
        skills: result.skills,
        plan: result.plan.map((item) => ({ file: item.file, action: item.action })),
    };
}
function success(command, data, json, human) {
    return envelope(command, true, data, [], json, 0, human);
}
function envelope(command, ok, data, errors, json, code, human) {
    if (json)
        return { code, stdout: `${JSON.stringify({ schemaVersion: 1, command, ok, data, errors, warnings: [] })}\n`, stderr: "" };
    return { code, stdout: human.length === 0 ? "" : `${human}\n`, stderr: errors.map((error) => `ERREUR — ${error}\n`).join("") };
}
function failure(command, error, json) {
    const message = error instanceof Error ? error.message : String(error);
    const code = error instanceof CliUsageError || message.startsWith("Profil inconnu") || message.startsWith("Catalogue") ? 64 : 70;
    return json
        ? { code, stdout: `${JSON.stringify({ schemaVersion: 1, command, ok: false, data: null, errors: [message], warnings: [] })}\n`, stderr: "" }
        : { code, stdout: "", stderr: `ERREUR — ${message}\n` };
}
//# sourceMappingURL=skills-cli.js.map