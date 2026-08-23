/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
import { resolveLocale, translate } from "../../../application/localization/locale.js";
import { FsLocalePreferenceStore } from "../../outbound/filesystem/fs-locale-preference-store.js";
import { jsonEnvelope } from "./cli-envelope.js";
import { CliUsageError, parseStrictArguments } from "./strict-arguments.js";
export async function runLocaleCommand(argv, context) {
    const parsed = parseStrictArguments(argv, { options: { json: "boolean" }, minPositionals: 1, maxPositionals: 2 });
    const [command, requested] = parsed.positionals;
    const store = new FsLocalePreferenceStore(context.homeDir);
    if (command === "show" && requested === undefined) {
        const preference = await store.load();
        const locale = resolveLocale({ ...(context.override === undefined ? {} : { override: context.override }), environment: context.environment, preference });
        return output(parsed.booleans.has("json"), locale, preference, false);
    }
    if (command === "set" && requested !== undefined) {
        if (requested !== "auto" && requested !== "en" && requested !== "fr")
            throw new CliUsageError(translate("cli.locale.usage"));
        await store.save(requested);
        const locale = resolveLocale({ ...(context.override === undefined ? {} : { override: context.override }), environment: context.environment, preference: requested });
        return output(parsed.booleans.has("json"), locale, requested, true);
    }
    throw new CliUsageError(translate("cli.locale.usage"));
}
function output(json, locale, preference, saved) {
    if (json) {
        return {
            code: 0,
            stdout: jsonEnvelope({
                command: saved ? "locale.set" : "locale.show",
                ok: true,
                data: { locale, preference },
                message: translate(saved ? "cli.locale.saved" : "cli.locale.current", { locale, preference }, locale),
                displayLocale: locale,
            }),
            stderr: "",
        };
    }
    return { code: 0, stdout: `${translate(saved ? "cli.locale.saved" : "cli.locale.current", { locale, preference }, locale)}\n`, stderr: "" };
}
//# sourceMappingURL=locale-cli.js.map