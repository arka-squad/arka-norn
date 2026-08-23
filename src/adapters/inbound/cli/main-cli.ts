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
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { bootstrap } from "../../../composition/bootstrap.js";
import { readEnv } from "../../../composition/env.js";
import type { CliExecution } from "./cli-execution.js";
import { runAgentCommand } from "./agent-cli.js";
import { runDoctorCommand } from "./doctor-cli.js";
import { runManagementCommand } from "./management-cli.js";
import { runMigrateCommand } from "./migrate-cli.js";
import { runOrchestrationCommand } from "./orchestration-cli.js";
import { runPipelineCommand, runScaffoldCommand, runStatusCommand, runValidateCommand } from "./pipeline-cli.js";
import { runSkillsCommand } from "./skills-cli.js";
import { runWorkflowCommand } from "./workflow-cli.js";
import { runFastDevCommand } from "./fastdev-cli.js";
import { runEssentialCommand } from "./essential-cli.js";
import { runAuditCommand } from "./audit-cli.js";
import { extractGlobalOptions } from "./global-options.js";
import { runLocaleCommand } from "./locale-cli.js";
import { FsLocalePreferenceStore } from "../../outbound/filesystem/fs-locale-preference-store.js";
import { resolveLocale, runWithLocale, translate } from "../../../application/localization/locale.js";
import { jsonEnvelope, type CliDiagnostic } from "./cli-envelope.js";
import { CLI_GUIDE_EN, CLI_HELP_EN, localizedCliGuide, localizedCliHelp } from "../../../application/localization/cli-help.js";

export const CLI_HELP = CLI_HELP_EN;
export const CLI_GUIDE = CLI_GUIDE_EN;

const FRAMEWORK_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");


export async function runCli(argv: readonly string[]): Promise<number> {
  try {
    const global = extractGlobalOptions(argv);
    const env = readEnv(process.env, process.cwd());
    const homeDir = env.homeDir ?? homedir();
    const preference = await new FsLocalePreferenceStore(homeDir).load();
    const locale = resolveLocale({ ...(global.locale === undefined ? {} : { override: global.locale }), environment: process.env, preference });
    return await runWithLocale(locale, () => runLocalizedCli(global.argv, homeDir, env, global.locale));
  } catch (error) {
    process.stderr.write(`${translate("common.error", { message: error instanceof Error ? error.message : String(error) })}\n`);
    return 70;
  }
}

async function runLocalizedCli(argv: readonly string[], homeDir: string, env: ReturnType<typeof readEnv>, localeOverride?: "en" | "fr"): Promise<number> {
  const command = argv[0];
  const rest = argv.slice(1);
  const wantsJson = argv.includes("--json");
  const compatibilityWarnings: string[] = deprecatedAliasWarnings(argv);
  try {
    if (command === "help" || command === "--help" || command === "-h") {
      process.stdout.write(localizedCliHelp());
      return 0;
    }
    if (command === "guide") {
      if (rest.length > 0) {
        process.stderr.write(`${translate("cli.error.noArguments", { command: "guide" })}\n`);
        return 64;
      }
      process.stdout.write(localizedCliGuide());
      return 0;
    }
    if (command === undefined || command === "config") return launchTui();
    if (command === "selftest") return runSelftest(rest);

    const pipelineContext = { cwd: env.cwd, homeDir, frameworkRoot: FRAMEWORK_ROOT, sessionId: env.agentSessionId };
    let result: CliExecution;
    switch (command) {
      case "project":
      case "depot":
      case "feature":
        result = await runManagementCommand([command, ...rest], { homeDir, cwd: env.cwd, frameworkRoot: FRAMEWORK_ROOT });
        break;
      case "agent":
        result = await runAgentCommand(rest, { homeDir, cwd: env.cwd, frameworkRoot: FRAMEWORK_ROOT, sessionId: env.agentSessionId });
        break;
      case "orchestration":
        result = await runOrchestrationCommand(rest, { homeDir, cwd: env.cwd, frameworkRoot: FRAMEWORK_ROOT, environment: process.env });
        break;
      case "pipeline":
        result = await runPipelineCommand(rest, pipelineContext);
        break;
      case "workflow":
        result = await runWorkflowCommand(rest, FRAMEWORK_ROOT);
        break;
      case "fastdev":
        result = await runFastDevCommand(rest, pipelineContext);
        break;
      case "essential":
        result = await runEssentialCommand(rest, pipelineContext);
        break;
      case "essentiel":
        result = await runEssentialCommand(rest, pipelineContext);
        compatibilityWarnings.push("'essentiel' is deprecated; use 'essential'.");
        break;
      case "audit":
        result = await runAuditCommand(rest, { homeDir, cwd: env.cwd });
        break;
      case "locale":
        result = await runLocaleCommand(rest, localeCommandContext(homeDir, localeOverride));
        break;
      case "status":
        result = await runStatusCommand(rest, pipelineContext);
        break;
      case "scaffold":
        result = await runScaffoldCommand(rest, pipelineContext);
        break;
      case "validate":
        result = await runValidateCommand(rest, pipelineContext);
        break;
      case "doctor":
        result = await runDoctorCommand(rest, { cwd: env.cwd, homeDir });
        break;
      case "install":
        result = runSkillsCommand(["install", ...rest], { cwd: env.cwd, homeDir, frameworkRoot: FRAMEWORK_ROOT });
        break;
      case "skills":
        result = runSkillsCommand(rest, { cwd: env.cwd, homeDir, frameworkRoot: FRAMEWORK_ROOT });
        break;
      case "migrate":
        result = await runMigrateCommand(rest, { cwd: env.cwd, frameworkRoot: FRAMEWORK_ROOT });
        break;
      default:
        process.stderr.write(`${translate("common.unknownCommand", { command })}\n\n${localizedCliHelp()}`);
        return 64;
    }
    const publicResult = wantsJson ? normalizePublicJson(result, command ?? "unknown", compatibilityWarnings) : {
      ...result,
      stderr: `${compatibilityWarnings.map((warning) => `WARNING: ${warning}\n`).join("")}${result.stderr}`,
    };
    process.stdout.write(publicResult.stdout);
    process.stderr.write(publicResult.stderr);
    return result.code;
  } catch (error) {
    process.stderr.write(`${translate("common.error", { message: error instanceof Error ? error.message : String(error) })}\n`);
    return 70;
  }
}

function normalizePublicJson(result: CliExecution, command: string, extraWarnings: readonly string[]): CliExecution {
  let parsed: unknown;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    return result;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return result;
  const envelope = parsed as Readonly<Record<string, unknown>>;
  if (envelope["schemaVersion"] === 2) {
    const display = objectRecord(envelope["display"]);
    const diagnostics = objectRecord(envelope["diagnostics"]);
    const aliasDiagnostics: readonly CliDiagnostic[] = extraWarnings.map((_warning, index) => ({ code: "deprecated_alias", params: { index } }));
    const normalized = {
      ...envelope,
      warnings: [...stringArray(envelope["warnings"]), ...extraWarnings.map(() => "deprecated_alias")],
      diagnostics: {
        ...diagnostics,
        warnings: [...diagnosticArray(diagnostics["warnings"]), ...aliasDiagnostics],
      },
      display: {
        ...display,
        warnings: [...stringArray(display["warnings"]), ...extraWarnings],
      },
    };
    return { ...result, stdout: `${JSON.stringify(normalized)}\n` };
  }
  return {
    ...result,
    stdout: jsonEnvelope({
      command: typeof envelope["command"] === "string" ? envelope["command"] : command,
      ok: envelope["ok"] === true,
      data: envelope["data"] ?? null,
      errors: stringArray(envelope["errors"]),
      warnings: [...stringArray(envelope["warnings"]), ...extraWarnings],
      errorCode: result.code === 64 ? "invalid_arguments" : "command_error",
      warningCode: extraWarnings.length > 0 ? "deprecated_alias" : "command_warning",
    }),
  };
}

function stringArray(value: unknown): readonly string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function diagnosticArray(value: unknown): readonly CliDiagnostic[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is CliDiagnostic => {
    const record = objectRecord(item);
    return typeof record["code"] === "string" && typeof record["params"] === "object" && record["params"] !== null;
  });
}

function objectRecord(value: unknown): Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Readonly<Record<string, unknown>> : {};
}

function localeCommandContext(homeDir: string, override: "en" | "fr" | undefined) {
  return { homeDir, environment: process.env, ...(override === undefined ? {} : { override }) };
}

function deprecatedAliasWarnings(argv: readonly string[]): string[] {
  const values = argv.flatMap((value, index) => value === "--workflow" ? [argv[index + 1]] : []);
  if (argv[0] === "workflow" && argv[1] === "show") values.push(argv[2]);
  return values.flatMap((value) => value === "standard"
    ? ["'standard' is deprecated; use 'complete'."]
    : value === "essentiel" ? ["'essentiel' is deprecated; use 'essential'."] : []);
}

async function launchTui(): Promise<number> {
  if (process.stdin.isTTY !== true || process.stdout.isTTY !== true) {
    process.stderr.write(`${translate("cli.error.ttyRequired")}\n`);
    return 1;
  }
  await bootstrap();
  return 0;
}

async function runSelftest(argv: readonly string[]): Promise<number> {
  if (argv.length > 0) {
    process.stderr.write(`${translate("cli.error.noArguments", { command: "selftest" })}\n`);
    return 64;
  }
  const loaded: unknown = await import(pathToFileURL(resolve(FRAMEWORK_ROOT, "scripts", "selftest.mjs")).href);
  if (!isSelftestModule(loaded)) throw new Error(translate("cli.error.invalidSelftest"));
  await loaded.runSelftest();
  return process.exitCode === undefined ? 0 : Number(process.exitCode);
}

function isSelftestModule(value: unknown): value is { readonly runSelftest: () => Promise<void> } {
  return typeof value === "object" && value !== null && "runSelftest" in value && typeof value.runSelftest === "function";
}
