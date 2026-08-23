/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
import { activeLocale } from "../../../application/localization/locale.js";
export function cliEnvelope(input) {
    const displayErrors = input.errors ?? [];
    const displayWarnings = input.warnings ?? [];
    const errorCode = input.errorCode ?? "command_error";
    const warningCode = input.warningCode ?? "command_warning";
    const errors = displayErrors.map(() => errorCode);
    const warnings = displayWarnings.map(() => warningCode);
    return {
        schemaVersion: 2,
        command: input.command,
        ok: input.ok,
        data: input.data,
        errors,
        warnings,
        diagnostics: {
            errors: displayErrors.map((_message, index) => ({ code: errorCode, params: { index } })),
            warnings: displayWarnings.map((_message, index) => ({ code: warningCode, params: { index } })),
        },
        display: {
            locale: input.displayLocale ?? activeLocale(),
            errors: displayErrors,
            warnings: displayWarnings,
            ...(input.message === undefined ? {} : { message: input.message }),
        },
    };
}
export function jsonEnvelope(input) {
    return `${JSON.stringify(cliEnvelope(input))}\n`;
}
//# sourceMappingURL=cli-envelope.js.map