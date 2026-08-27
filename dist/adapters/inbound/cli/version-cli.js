/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
import { uptime } from "node:os";
import { PRODUCT_VERSION } from "../../../application/product-metadata.js";
import { translate } from "../../../application/localization/locale.js";
import { bootId, evaluateVersionAdvisory } from "../../../application/version/version-advisory.js";
import { FsVersionSkipStore } from "../../outbound/filesystem/fs-version-skip-store.js";
import { fetchLatestNpmVersion } from "../../outbound/version/npm-version-source.js";
import { createTheme } from "../tui/runtime/theme.js";
import { renderArkaHeader } from "../tui/components/banner.js";
import { cliEnvelope } from "./cli-envelope.js";
import { CliUsageError, parseStrictArguments } from "./strict-arguments.js";
export async function runVersionCommand(argv, context) {
    const json = argv.includes("--json");
    try {
        const parsed = parseStrictArguments(argv, {
            options: { json: "boolean", update: "boolean", "skip-reboot": "boolean", "skip-version": "boolean", "clear-skip": "boolean" },
            exclusiveGroups: [["update", "skip-reboot", "skip-version", "clear-skip"]],
            minPositionals: 0,
            maxPositionals: 0,
        });
        const store = new FsVersionSkipStore(context.homeDir);
        const currentBootId = bootId(context.nowMs ?? Date.now(), context.uptimeSeconds ?? uptime());
        const latest = await (context.latestVersion ?? (() => fetchLatestNpmVersion("arka-norn")))();
        if (parsed.booleans.has("clear-skip")) {
            await store.clear();
            return envelope("version.skip.cleared", { current: PRODUCT_VERSION }, json, [], translate("cli.version.skipCleared"));
        }
        if (parsed.booleans.has("skip-reboot") || parsed.booleans.has("skip-version")) {
            if (latest === undefined)
                return envelope("version.skip", { current: PRODUCT_VERSION }, json, [], translate("cli.version.unknown"));
            const kind = parsed.booleans.has("skip-version") ? "version" : "reboot";
            await store.save({ kind, version: latest, ...(kind === "reboot" ? { bootId: currentBootId } : {}) });
            const message = kind === "version"
                ? translate("cli.version.skippedVersion", { latest })
                : translate("cli.version.skippedReboot", { latest });
            return envelope(`version.skip.${kind}`, { current: PRODUCT_VERSION, latest, kind }, json, [], message);
        }
        const skip = await store.load();
        const advisory = evaluateVersionAdvisory({ current: PRODUCT_VERSION, ...(latest === undefined ? {} : { latest }), ...(skip === undefined ? {} : { skip }), currentBootId });
        if (parsed.booleans.has("update")) {
            return envelope("version.update", advisory, json, [], renderUpdateInstructions(advisory));
        }
        return envelope("version", advisory, json, [], renderAdvisory(advisory));
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (json)
            return { code: error instanceof CliUsageError ? 64 : 70, stdout: cliEnvelopeJson("version", false, { current: PRODUCT_VERSION }, [message]), stderr: "" };
        return { code: error instanceof CliUsageError ? 64 : 70, stdout: "", stderr: `${message}\n` };
    }
}
function envelope(command, data, json, errors, message) {
    if (json)
        return { code: 0, stdout: cliEnvelopeJson(command, errors.length === 0, data, errors, message), stderr: "" };
    return { code: 0, stdout: `${message}\n`, stderr: "" };
}
function cliEnvelopeJson(command, ok, data, errors, message) {
    return `${JSON.stringify(cliEnvelope({ command, ok, data, errors, ...(message === undefined ? {} : { message }) }))}\n`;
}
export function renderAdvisory(advisory) {
    const theme = createTheme(process.env, Boolean(process.stdout.isTTY));
    const header = renderArkaHeader(theme, { version: advisory.current }).join("\n");
    const body = advisoryBody(advisory, theme);
    return `${header}\n${body}`;
}
function advisoryBody(advisory, theme) {
    switch (advisory.status) {
        case "up_to_date":
            return `  ${theme.arkaAccent(translate("cli.version.upToDate", { version: advisory.current }))}`;
        case "unknown":
            return `  ${theme.gray(translate("cli.version.unknown"))}`;
        case "skipped_reboot":
            return [`  ${theme.gray(translate("cli.version.skippedRebootActive", { latest: advisory.latest }))}`, actionsHint(theme)].join("\n");
        case "skipped_version":
            return [`  ${theme.gray(translate("cli.version.skippedVersionActive", { latest: advisory.latest }))}`, actionsHint(theme)].join("\n");
        case "update_available":
            return [
                `  ${theme.arkaRed(translate("cli.version.updateAvailable", { current: advisory.current, latest: advisory.latest }))}`,
                "",
                `  ${theme.bold(translate("cli.version.chooseAction"))}`,
                `    ${theme.arkaAccent("arka-norn version --update")}       ${theme.dim(translate("cli.version.optionUpdate"))}`,
                `    ${theme.arkaAccent("arka-norn version --skip-reboot")}  ${theme.dim(translate("cli.version.optionSkipReboot"))}`,
                `    ${theme.arkaAccent("arka-norn version --skip-version")} ${theme.dim(translate("cli.version.optionSkipVersion"))}`,
            ].join("\n");
    }
}
function actionsHint(theme) {
    return `  ${theme.dim(translate("cli.version.clearHint"))}`;
}
function renderUpdateInstructions(advisory) {
    const theme = createTheme(process.env, Boolean(process.stdout.isTTY));
    if (advisory.status !== "update_available" && advisory.status !== "skipped_reboot" && advisory.status !== "skipped_version") {
        return `  ${theme.arkaAccent(translate("cli.version.upToDate", { version: advisory.current }))}`;
    }
    return [
        `  ${theme.bold(translate("cli.version.updateHow"))}`,
        `    ${theme.arkaAccent("npm install -g arka-norn@latest")}`,
        `    ${theme.arkaAccent("arka-norn setup")}`,
    ].join("\n");
}
//# sourceMappingURL=version-cli.js.map