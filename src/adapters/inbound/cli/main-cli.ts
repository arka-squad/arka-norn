import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { bootstrap } from "../../../composition/bootstrap.js";
import { readEnv } from "../../../composition/env.js";
import type { CliExecution } from "./cli-execution.js";
import { runDoctorCommand } from "./doctor-cli.js";
import { runManagementCommand } from "./management-cli.js";
import { runMigrateCommand } from "./migrate-cli.js";
import { runPipelineCommand, runScaffoldCommand, runStatusCommand, runValidateCommand } from "./pipeline-cli.js";
import { runSkillsCommand } from "./skills-cli.js";

const FRAMEWORK_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");

export const CLI_HELP = `arka-norn — espace local de gestion Project/Feature et pipeline documentaire multiprovider

Sans commande, arka-norn lance la TUI interactive.

Gestion :
  project <list|add|import|scan|show|use|forget|reconcile>
  feature <list|create|import|scan|show|use|forget|reconcile>
  pipeline <status|next|scaffold|validate>

Documents et santé :
  status [feature-root]                 État complet et prochaine action.
  scaffold <step-id> <output.json>     Génère un document sans écraser par défaut.
  validate <document.json>             Valide structure, identité et relations.
  doctor [--json] [--repair [--apply]] Santé index, markers, locks, audit et skills.
  migrate [--target <path>] [--dry-run|--apply]

Skills et maintenance :
  install [--target <repo>] [--global] [--profile <profil>]
  skills <list|install|doctor>
  selftest
  config                               Lance explicitement la TUI.
  help | --help | -h
`;

export async function runCli(argv: readonly string[]): Promise<number> {
  const command = argv[0];
  const rest = argv.slice(1);
  try {
    if (command === "help" || command === "--help" || command === "-h") {
      process.stdout.write(CLI_HELP);
      return 0;
    }
    if (command === undefined || command === "config") return launchTui();
    if (command === "selftest") return runSelftest(rest);

    const env = readEnv(process.env, process.cwd());
    const homeDir = env.homeDir ?? homedir();
    const pipelineContext = { cwd: env.cwd, homeDir, frameworkRoot: FRAMEWORK_ROOT };
    let result: CliExecution;
    switch (command) {
      case "project":
      case "depot":
      case "feature":
        result = await runManagementCommand([command, ...rest], { homeDir, cwd: env.cwd });
        break;
      case "pipeline":
        result = await runPipelineCommand(rest, pipelineContext);
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
        result = await runMigrateCommand(rest, { cwd: env.cwd });
        break;
      default:
        process.stderr.write(`Commande inconnue : "${command}"\n\n${CLI_HELP}`);
        return 64;
    }
    process.stdout.write(result.stdout);
    process.stderr.write(result.stderr);
    return result.code;
  } catch (error) {
    process.stderr.write(`ERREUR — ${error instanceof Error ? error.message : String(error)}\n`);
    return 70;
  }
}

async function launchTui(): Promise<number> {
  if (process.stdin.isTTY !== true || process.stdout.isTTY !== true) {
    process.stderr.write("arka-norn (TUI) nécessite un terminal interactif (TTY). Utilise une sous-commande CLI en mode script.\n");
    return 1;
  }
  await bootstrap();
  return 0;
}

async function runSelftest(argv: readonly string[]): Promise<number> {
  if (argv.length > 0) {
    process.stderr.write("ERREUR — selftest n'accepte aucun argument.\n");
    return 64;
  }
  const loaded: unknown = await import(pathToFileURL(resolve(FRAMEWORK_ROOT, "scripts", "selftest.mjs")).href);
  if (!isSelftestModule(loaded)) throw new Error("Module selftest invalide");
  await loaded.runSelftest();
  return process.exitCode === undefined ? 0 : Number(process.exitCode);
}

function isSelftestModule(value: unknown): value is { readonly runSelftest: () => Promise<void> } {
  return typeof value === "object" && value !== null && "runSelftest" in value && typeof value.runSelftest === "function";
}
