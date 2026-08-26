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
import { resolve } from "node:path";
import { translate } from "../../../application/localization/locale.js";
import { createSkillCatalogRuntime } from "../../outbound/skills/skill-catalog.js";
import { detectHostsFiltered, formatHosts, SUPPORTED_HOSTS } from "../../outbound/skills/host-detector.js";
import { findOrphanSkills, inspectSkills, installSkills } from "../../outbound/skills/skill-installer.js";
import { CliUsageError, parseStrictArguments } from "./strict-arguments.js";
import { jsonEnvelope } from "./cli-envelope.js";
export function runSkillsCommand(argv, context) {
    const action = argv[0];
    const rest = argv.slice(1);
    const json = rest.includes("--json");
    try {
        if (action === "install" || action === "setup")
            return setup(rest, context, json);
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
                ...orphans.map((orphan) => `WARN\t${orphan.name}\tunmanaged arka entry - ${orphan.location}`),
            ].join("\n");
            return envelope("skills.doctor", ok, data, ok ? [] : ["Skills are missing or divergent."], json, ok ? 0 : 3, human);
        }
        throw new CliUsageError("skills action must be list, install or doctor");
    }
    catch (error) {
        return failure(`skills.${action ?? "unknown"}`, error, json);
    }
}
function setup(argv, context, json) {
    const parsed = parseStrictArguments(argv, {
        options: {
            global: "boolean",
            project: "boolean",
            host: "string",
            "dry-run": "boolean",
            force: "boolean",
            json: "boolean",
            target: "string",
            profile: "string",
        },
        minPositionals: 0,
        maxPositionals: 0,
    });
    const hostFilter = parseHostFilter(parsed.values.get("host"));
    const hosts = detectHostsFiltered(hostFilter ?? "all");
    if (hosts.detected.length === 0) {
        const data = { hosts: { requested: hostFilter ?? "all", detected: hosts.detected.map((h) => h.host), supported: SUPPORTED_HOSTS } };
        const message = translate("cli.setup.noHost", { hosts: SUPPORTED_HOSTS.join(", ") });
        return envelope("skills.setup", false, data, [message], json, 2, `${translate("cli.setup.header")}\n${message}`);
    }
    const target = resolve(context.cwd, parsed.values.get("target") ?? context.cwd);
    const profile = parsed.values.get("profile") ?? "all";
    const globalFlag = parsed.booleans.has("global");
    const projectFlag = parsed.booleans.has("project");
    const dryRun = parsed.booleans.has("dry-run");
    const force = parsed.booleans.has("force");
    // Par défaut, setup installe dans le project courant ; --project le force explicitement.
    const installProject = !globalFlag || projectFlag;
    const installGlobal = globalFlag;
    const targets = [];
    if (installProject)
        targets.push(target);
    if (installGlobal)
        targets.push(context.homeDir);
    const preview = targets.length === 0
        ? [translate("cli.setup.targetProject", { target })]
        : targets.map((t) => translate(t === context.homeDir ? "cli.setup.targetGlobal" : "cli.setup.targetProject", { target: t }));
    const results = [];
    if (installProject) {
        results.push(installSkills(context.frameworkRoot, { target, profile, dryRun, force }));
    }
    if (installGlobal) {
        results.push(installSkills(context.frameworkRoot, { target, profile, global: true, globalHome: context.homeDir, dryRun, force }));
    }
    const ok = results.every((r) => r.ok);
    const combinedError = results.map((r) => r.error).filter(Boolean).join("; ") || undefined;
    const plan = results.flatMap((r) => r.plan);
    if (!ok) {
        const data = publicSetupResult({ hosts: hosts.detected.map((h) => h.host), targets: preview, profile, dryRun, plan, doctor: null });
        return envelope("skills.setup", false, data, combinedError === undefined ? [] : [combinedError], json, 70, humanSetupPreview(preview, hosts.detected, profile, plan));
    }
    const doctorTarget = installProject ? target : context.homeDir;
    const doctorGlobalHome = installGlobal ? context.homeDir : undefined;
    const doctorChecks = inspectSkills(context.frameworkRoot, doctorTarget, profile, doctorGlobalHome);
    const doctorOrphans = findOrphanSkills(context.frameworkRoot, doctorTarget, profile, doctorGlobalHome);
    const doctorOk = doctorChecks.every((check) => check.status === "ok") && doctorOrphans.length === 0;
    const data = publicSetupResult({
        hosts: hosts.detected.map((h) => h.host),
        targets: preview,
        profile,
        dryRun,
        plan,
        doctor: { checks: doctorChecks, orphans: doctorOrphans, ok: doctorOk },
    });
    const human = [
        humanSetupPreview(preview, hosts.detected, profile, plan),
        "",
        translate("cli.setup.hostsDetected", { hosts: formatHosts(hosts.detected) }),
        ...doctorChecks.map((check) => `  ${check.status.toUpperCase().padEnd(9)} ${check.name}`),
        ...doctorOrphans.map((orphan) => `  WARN      ${orphan.name} — ${orphan.location}`),
        "",
        doctorOk ? translate("cli.setup.ready") : translate("cli.setup.doctorWarning"),
    ].join("\n");
    const errors = doctorOk ? [] : [translate("cli.setup.doctorWarning")];
    const code = dryRun ? 0 : doctorOk ? 0 : 3;
    return envelope("skills.setup", ok && doctorOk, data, errors, json, code, human);
}
function humanSetupPreview(targets, hosts, profile, plan) {
    const lines = [
        translate("cli.setup.header"),
        translate("cli.setup.hostsDetected", { hosts: formatHosts(hosts) }),
        ...targets.map((t) => `  ${t}`),
        translate("cli.setup.profile", { profile }),
    ];
    if (plan.length > 0) {
        lines.push(translate("cli.setup.plan"));
        for (const item of plan)
            lines.push(`  ${item.action.padEnd(9)} ${item.file}`);
    }
    return lines.join("\n");
}
function parseHostFilter(value) {
    if (value === undefined)
        return undefined;
    const normalized = value.toLowerCase();
    if (normalized === "all")
        return "all";
    if (SUPPORTED_HOSTS.includes(normalized))
        return normalized;
    throw new CliUsageError(translate("cli.setup.unknownHost", { host: value, hosts: SUPPORTED_HOSTS.join(", ") }));
}
function publicSetupResult(result) {
    return {
        hosts: result.hosts,
        targets: result.targets,
        profile: result.profile,
        dryRun: result.dryRun,
        plan: result.plan,
        doctor: result.doctor,
    };
}
function success(command, data, json, human) {
    return envelope(command, true, data, [], json, 0, human);
}
function envelope(command, ok, data, errors, json, code, human) {
    if (json)
        return { code, stdout: jsonEnvelope({ command, ok, data, errors, errorCode: "skills_command_failed" }), stderr: "" };
    return { code, stdout: human.length === 0 ? "" : `${human}\n`, stderr: errors.map((error) => `${translate("common.error", { message: error })}\n`).join("") };
}
function failure(command, error, json) {
    const message = error instanceof Error ? error.message : String(error);
    const code = error instanceof CliUsageError || message.startsWith("Profil inconnu") || message.startsWith("Catalogue") ? 64 : 70;
    return json
        ? { code, stdout: jsonEnvelope({ command, ok: false, data: null, errors: [message], errorCode: "skills_command_failed" }), stderr: "" }
        : { code, stdout: "", stderr: `${translate("common.error", { message })}\n` };
}
//# sourceMappingURL=skills-cli.js.map