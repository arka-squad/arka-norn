/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import { activeLocale, type Locale } from "../../../application/localization/locale.js";

export interface CliDiagnostic {
  readonly code: string;
  readonly params: Readonly<Record<string, string | number | boolean>>;
}

export interface CliEnvelope<T> {
  readonly schemaVersion: 2;
  readonly command: string;
  readonly ok: boolean;
  readonly data: T;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
  readonly diagnostics: {
    readonly errors: readonly CliDiagnostic[];
    readonly warnings: readonly CliDiagnostic[];
  };
  readonly display: {
    readonly locale: "en" | "fr";
    readonly errors: readonly string[];
    readonly warnings: readonly string[];
    readonly message?: string;
  };
}

export function cliEnvelope<T>(input: {
  readonly command: string;
  readonly ok: boolean;
  readonly data: T;
  readonly errors?: readonly string[];
  readonly warnings?: readonly string[];
  readonly errorCode?: string;
  readonly warningCode?: string;
  readonly message?: string;
  readonly displayLocale?: Locale;
}): CliEnvelope<T> {
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

export function jsonEnvelope<T>(input: Parameters<typeof cliEnvelope<T>>[0]): string {
  return `${JSON.stringify(cliEnvelope(input))}\n`;
}
