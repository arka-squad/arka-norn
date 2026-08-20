import { AgentId } from "../../../domain/agent/agent-id.js";
import { AgentSessionId } from "../../../domain/agent/agent-session-id.js";
import type { AgentRegistration } from "../../../domain/agent/agent.js";
import { parseOrchestratedRole } from "../../../application/agents/agent-orchestration.js";
import { DomainError } from "../../../domain/errors.js";
import { FeatureId } from "../../../domain/feature/feature-id.js";
import { ProjectId } from "../../../domain/project/project-id.js";
import { createManagementRuntime } from "../../../composition/management-runtime.js";
import { createPipelineRuntime } from "../../../composition/pipeline-runtime.js";
import { createAgentOrchestrationRuntime } from "../../../composition/agent-orchestration-runtime.js";
import type { AgentWorkMode } from "../../../ports/inbound/for-agent-orchestration.js";
import type { CliExecution } from "./cli-execution.js";
import { CliUsageError, parseStrictArguments, type StrictArgumentSpec } from "./strict-arguments.js";

export interface AgentCliContext {
  readonly homeDir: string;
  readonly cwd: string;
  readonly frameworkRoot: string;
  readonly sessionId: AgentSessionId;
}

export const AGENT_HELP = `Gestion des agents d'un Project

  agent list --project <id> [--active]
  agent register --project <id> --provider <nom> --role <rôle>
                 [--features id1,id2] [--paths chemin1,chemin2]
                 [--responsibilities "mission 1;mission 2"] [--session <id>]
  agent show <agent-id> --project <id>
  agent current --project <id> [--session <id>]
  agent use <agent-id> --project <id> [--session <id>]
  agent sessions --project <id>
  agent replace <ancien-id> --project <id> --provider <nom> --role <rôle>
  agent deactivate <agent-id> --project <id> --yes

Pilotage Product et sessions parallèles :
  agent advise --project <id> [--feature <id>]
  agent prompt <product|architecte|audit|dev|qa> --project <id>
               [--feature <id>] [--provider <nom>] [--session <id>]
               [--mode execute|prepare]
  agent handoff-prompt --project <id> [--feature <id>] [--agent <product-id>]

`;

export async function runAgentCommand(argv: readonly string[], context: AgentCliContext): Promise<CliExecution> {
  const action = argv[0];
  const rest = argv.slice(1);
  const json = rest.includes("--json");
  const command = `agent.${action ?? "unknown"}`;
  try {
    if (action === "help" || action === "--help" || action === "-h") return { code: 0, stdout: AGENT_HELP, stderr: "" };
    if (action === undefined) throw new CliUsageError(`missing agent action\n\n${AGENT_HELP}`);
    const args = parseStrictArguments(rest, specFor(action));
    const sessionId = parseSession(args.values.get("session"), context.sessionId);
    const runtime = createManagementRuntime({ homeDir: context.homeDir, sessionId });
    const project = await runtime.projects.show(ProjectId.of(required(args.values, "project")));
    let data: unknown;
    switch (action) {
      case "list": {
        const agents = await runtime.agents.list(project);
        data = agents.filter((agent) => !args.booleans.has("active") || agent.active).map((agent) => serializeAgent(agent));
        break;
      }
      case "show":
        data = serializeAgent(await runtime.agents.show(project, AgentId.of(args.positionals[0]!)), sessionId.value);
        break;
      case "current": {
        const current = await runtime.agents.current(project);
        data = current === undefined ? null : serializeAgent(current, sessionId.value);
        break;
      }
      case "sessions":
        data = (await runtime.agents.sessions(project)).map((binding) => ({ sessionId: binding.sessionId.value, agent: serializeAgent(binding.agent) }));
        break;
      case "register":
        data = serializeAgent(await runtime.agents.register({
          project,
          provider: required(args.values, "provider"),
          role: required(args.values, "role"),
          ...(args.values.get("id") === undefined ? {} : { id: AgentId.of(args.values.get("id")!) }),
          ...scopeArgs(args.values),
        }), sessionId.value);
        break;
      case "use":
        data = serializeAgent(await runtime.agents.select(project, AgentId.of(args.positionals[0]!)), sessionId.value);
        break;
      case "deactivate":
        if (!args.booleans.has("yes")) throw new CliUsageError("agent deactivate requires --yes confirmation");
        data = serializeAgent(await runtime.agents.deactivate(project, AgentId.of(args.positionals[0]!)), sessionId.value);
        break;
      case "replace":
        data = serializeAgent(await runtime.agents.replace({
          project,
          replacedAgentId: AgentId.of(args.positionals[0]!),
          provider: required(args.values, "provider"),
          role: required(args.values, "role"),
          ...(args.values.get("id") === undefined ? {} : { id: AgentId.of(args.values.get("id")!) }),
          ...scopeArgs(args.values),
        }), sessionId.value);
        break;
      case "advise": {
        const orchestration = orchestrationRuntime(runtime, context);
        data = await orchestration.advise({
          projectId: project.id,
          ...(args.values.get("feature") === undefined ? {} : { featureId: FeatureId.of(args.values.get("feature")!) }),
        });
        break;
      }
      case "prompt": {
        const role = parseRole(args.positionals[0]!);
        const featureId = args.values.get("feature");
        if (role !== "product" && featureId === undefined) throw new CliUsageError(`agent prompt ${role} requires --feature <id>`);
        data = await orchestrationRuntime(runtime, context).initializationPrompt({
          projectId: project.id,
          role,
          ...(featureId === undefined ? {} : { featureId: FeatureId.of(featureId) }),
          ...(args.values.get("provider") === undefined ? {} : { provider: args.values.get("provider")! }),
          ...(args.values.get("session") === undefined ? {} : { sessionId }),
          ...(args.values.get("mode") === undefined ? {} : { mode: parseMode(args.values.get("mode")!) }),
        });
        break;
      }
      case "handoff-prompt":
      case "resume-prompt":
        data = await orchestrationRuntime(runtime, context).productHandoffPrompt({
          projectId: project.id,
          ...(args.values.get("feature") === undefined ? {} : { featureId: FeatureId.of(args.values.get("feature")!) }),
          ...(args.values.get("agent") === undefined ? {} : { agentId: args.values.get("agent")! }),
        });
        break;
      default:
        throw new CliUsageError(`unknown agent action: ${action}`);
    }
    return output(command, data, json, action, sessionId.value);
  } catch (error) {
    return failure(command, error, json);
  }
}

function specFor(action: string): StrictArgumentSpec {
  const jsonProject = { json: "boolean" as const, project: "string" as const, session: "string" as const };
  const identity = {
    ...jsonProject,
    provider: "string" as const,
    role: "string" as const,
    id: "string" as const,
    features: "string" as const,
    paths: "string" as const,
    responsibilities: "string" as const,
  };
  const specs: Readonly<Record<string, StrictArgumentSpec>> = {
    list: { options: { ...jsonProject, active: "boolean" }, minPositionals: 0, maxPositionals: 0 },
    show: { options: jsonProject, minPositionals: 1, maxPositionals: 1 },
    current: { options: jsonProject, minPositionals: 0, maxPositionals: 0 },
    sessions: { options: jsonProject, minPositionals: 0, maxPositionals: 0 },
    register: { options: identity, minPositionals: 0, maxPositionals: 0 },
    use: { options: jsonProject, minPositionals: 1, maxPositionals: 1 },
    deactivate: { options: { ...jsonProject, yes: "boolean" }, minPositionals: 1, maxPositionals: 1 },
    replace: { options: identity, minPositionals: 1, maxPositionals: 1 },
    advise: { options: { ...jsonProject, feature: "string" }, minPositionals: 0, maxPositionals: 0 },
    prompt: { options: { ...jsonProject, feature: "string", provider: "string", mode: "string" }, minPositionals: 1, maxPositionals: 1 },
    "handoff-prompt": { options: { ...jsonProject, feature: "string", agent: "string" }, minPositionals: 0, maxPositionals: 0 },
    "resume-prompt": { options: { ...jsonProject, feature: "string", agent: "string" }, minPositionals: 0, maxPositionals: 0 },
  };
  return specs[action] ?? { options: jsonProject };
}

function scopeArgs(values: ReadonlyMap<string, string>) {
  return {
    ...(values.get("features") === undefined ? {} : { featureIds: split(values.get("features")!).map((value) => FeatureId.of(value)) }),
    ...(values.get("paths") === undefined ? {} : { paths: split(values.get("paths")!) }),
    ...(values.get("responsibilities") === undefined ? {} : { responsibilities: split(values.get("responsibilities")!, ";") }),
  };
}

function split(value: string, separator = ","): readonly string[] {
  const values = value.split(separator).map((item) => item.trim()).filter(Boolean);
  if (values.length === 0) throw new CliUsageError("scope option must contain at least one value");
  return values;
}

function required(values: ReadonlyMap<string, string>, name: string): string {
  const value = values.get(name);
  if (value === undefined) throw new CliUsageError(`--${name} is required`);
  return value;
}

export function serializeAgent(agent: AgentRegistration, sessionId?: string) {
  return {
    schemaVersion: 1,
    id: agent.id.value,
    provider: agent.provider,
    role: agent.role,
    active: agent.active,
    ...(sessionId === undefined ? {} : { sessionId }),
    scope: {
      projectId: agent.scope.projectId.value,
      featureIds: agent.scope.featureIds.map((id) => id.value),
      paths: agent.scope.paths,
      responsibilities: agent.scope.responsibilities,
    },
    registeredAt: agent.registeredAt.toISOString(),
    updatedAt: agent.updatedAt.toISOString(),
    ...(agent.deactivatedAt === undefined ? {} : { deactivatedAt: agent.deactivatedAt.toISOString() }),
    ...(agent.replacedByAgentId === undefined ? {} : { replacedByAgentId: agent.replacedByAgentId.value }),
    ...(agent.replacesAgentId === undefined ? {} : { replacesAgentId: agent.replacesAgentId.value }),
  };
}

function output(command: string, data: unknown, json: boolean, action: string, sessionId: string): CliExecution {
  if (json) return { code: 0, stdout: `${JSON.stringify({ schemaVersion: 1, command, ok: true, data, errors: [], warnings: [] })}\n`, stderr: "" };
  if (data === null) return { code: 0, stdout: `Aucun agent actif dans la session ${sessionId}. Utilise \`arka-norn agent use <id> --project <id> --session ${sessionId}\`.\n`, stderr: "" };
  if (action === "advise") return { code: 0, stdout: humanAdvice(data), stderr: "" };
  if (action === "prompt") {
    const prompt = data as { readonly preflightCommand: string; readonly prompt: string };
    return { code: 0, stdout: `PRÉREQUIS À EXÉCUTER AVANT D'OUVRIR LA SESSION PROVIDER\n${prompt.preflightCommand}\n\nPROMPT À TRANSMETTRE\n${prompt.prompt}\n`, stderr: "" };
  }
  if (action === "handoff-prompt" || action === "resume-prompt") {
    return { code: 0, stdout: `${(data as { readonly prompt: string }).prompt}\n`, stderr: "" };
  }
  if (action === "sessions") {
    const sessions = data as readonly { readonly sessionId: string; readonly agent: ReturnType<typeof serializeAgent> }[];
    return { code: 0, stdout: sessions.length === 0 ? "Aucune session Agent liée à ce Project.\n" : `${sessions.map((item) => `${item.sessionId}\t${humanAgent(item.agent)}`).join("\n")}\n`, stderr: "" };
  }
  const rows = Array.isArray(data) ? data : [data];
  return {
    code: 0,
    stdout: rows.length === 0 ? "Aucun agent enregistré. Commence avec `arka-norn agent register`.\n" : `${rows.map(humanAgent).join("\n")}\n`,
    stderr: "",
  };
}

function humanAgent(value: unknown): string {
  const agent = value as ReturnType<typeof serializeAgent>;
  const scope = [
    agent.scope.featureIds.length === 0 ? "features=toutes" : `features=${agent.scope.featureIds.join(",")}`,
    agent.scope.paths.length === 0 ? "chemins=tous" : `chemins=${agent.scope.paths.join(",")}`,
    agent.scope.responsibilities.length === 0 ? "responsabilités=non précisées" : `responsabilités=${agent.scope.responsibilities.join(";")}`,
  ].join(" · ");
  const replacement = "replacedByAgentId" in agent ? ` → remplacé par ${agent.replacedByAgentId}` : "";
  const session = "sessionId" in agent ? `\tsession=${String(agent.sessionId)}` : "";
  return `${agent.active ? "ACTIF" : "INACTIF"}\t${agent.id}\t${agent.provider}/${agent.role}\t${scope}${session}${replacement}`;
}

function humanAdvice(value: unknown): string {
  const advice = value as Awaited<ReturnType<ReturnType<typeof orchestrationRuntime>["advise"]>>;
  const recommendations = advice.recommendations.length === 0
    ? ["  Aucun profil secondaire à lancer maintenant."]
    : advice.recommendations.map((item) => `  ${item.mode === "execute" ? "MAINTENANT" : "PRÉPARATION"} · ${item.role} · session ${item.sessionId}\n    ${item.reason}\n    ${item.command}`);
  return [
    `Pilotage Product — Project ${advice.projectId}${advice.featureId === undefined ? "" : ` · Feature ${advice.featureId}`}`,
    `Phase : ${advice.phase}${advice.nextStepId === undefined ? "" : ` · prochaine étape ${advice.nextStepId}`}`,
    `Product principal : ${advice.productPrincipal.status}${advice.productPrincipal.agentId === undefined ? "" : ` · ${advice.productPrincipal.agentId}`} · session main`,
    `Conseil : ${advice.productNextAction}`,
    "Agents proposés :",
    ...recommendations,
    `Reprise Product : ${advice.handoffPromptCommand}`,
    ...advice.warnings.map((warning) => `AVERTISSEMENT — ${warning}`),
  ].join("\n") + "\n";
}

function orchestrationRuntime(runtime: ReturnType<typeof createManagementRuntime>, context: AgentCliContext) {
  return createAgentOrchestrationRuntime({ ...runtime, pipeline: createPipelineRuntime(context.frameworkRoot) });
}

function parseSession(value: string | undefined, fallback: AgentSessionId): AgentSessionId {
  return value === undefined ? fallback : AgentSessionId.of(value);
}

function parseRole(value: string) {
  try {
    return parseOrchestratedRole(value);
  } catch (error) {
    throw new CliUsageError(error instanceof Error ? error.message : String(error));
  }
}

function parseMode(value: string): AgentWorkMode {
  if (value === "execute" || value === "prepare") return value;
  throw new CliUsageError("--mode must be execute or prepare");
}

function failure(command: string, error: unknown, json: boolean): CliExecution {
  const message = error instanceof Error ? error.message : String(error);
  const code = error instanceof CliUsageError ? 64
    : error instanceof DomainError && ["AGENT_NOT_FOUND", "PROJECT_NOT_FOUND"].includes(error.code) ? 4
      : error instanceof DomainError && error.code === "AGENT_ALREADY_EXISTS" ? 5
        : error instanceof DomainError ? 3 : 70;
  return json
    ? { code, stdout: `${JSON.stringify({ schemaVersion: 1, command, ok: false, data: null, errors: [message], warnings: [] })}\n`, stderr: "" }
    : { code, stdout: "", stderr: `ERREUR — ${message}\n` };
}
