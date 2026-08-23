/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
import { CliUsageError } from "./strict-arguments.js";
export function extractGlobalOptions(argv) {
    const remaining = [];
    let locale;
    let positionalOnly = false;
    for (let index = 0; index < argv.length; index += 1) {
        const token = argv[index];
        if (token === "--")
            positionalOnly = true;
        if (positionalOnly || (token !== "--locale" && !token.startsWith("--locale="))) {
            remaining.push(token);
            continue;
        }
        if (locale !== undefined)
            throw new CliUsageError("--locale may only be provided once");
        const inline = token.startsWith("--locale=") ? token.slice("--locale=".length) : undefined;
        const value = inline ?? argv[index + 1];
        if (value !== "en" && value !== "fr")
            throw new CliUsageError("--locale requires en or fr");
        locale = value;
        if (inline === undefined)
            index += 1;
    }
    return { argv: remaining, ...(locale === undefined ? {} : { locale }) };
}
//# sourceMappingURL=global-options.js.map