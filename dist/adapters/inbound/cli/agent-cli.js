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
import { AgentId } from "../../../domain/agent/agent-id.js";
import { AgentSessionId } from "../../../domain/agent/agent-session-id.js";
import { parseOrchestratedRole } from "../../../application/agents/agent-orchestration.js";
import { DomainError } from "../../../domain/errors.js";
import { FeatureId } from "../../../domain/feature/feature-id.js";
import { ProjectId } from "../../../domain/project/project-id.js";
import { createManagementRuntime } from "../../../composition/management-runtime.js";
import { createPipelineRuntime } from "../../../composition/pipeline-runtime.js";
import { createAgentOrchestrationRuntime } from "../../../composition/agent-orchestration-runtime.js";
import { CliUsageError, parseStrictArguments } from "./strict-arguments.js";
import { jsonEnvelope } from "./cli-envelope.js";
import { translate } from "../../../application/localization/locale.js";
import { FsLocalePreferenceStore } from "../../outbound/filesystem/fs-locale-preference-store.js";
export const AGENT_HELP = `Manage Agents for a Project

  agent list --project <id> [--active]
  agent register --project <id> --provider <name> --role <role>
                 [--features id1,id2] [--paths path1,path2]
                 [--responsibilities "mission 1;mission 2"] [--session <id>]
  agent show <agent-id> --project <id>
  agent current --project <id> [--session <id>]
  agent use <agent-id> --project <id> [--session <id>]
  agent sessions --project <id>
  agent replace <old-id> --project <id> --provider <name> --role <role>
  agent deactivate <agent-id> --project <id> --yes

Product control and parallel sessions:
  agent advise --project <id> [--feature <id>]
  agent prompt <product|architecte|audit|dev|qa> --project <id>
               [--feature <id>] [--provider <name>] [--session <id>]
               [--mode execute|prepare]
  agent handoff-prompt --project <id> [--feature <id>] [--agent <product-id>]

`;
export async function runAgentCommand(argv, context) {
    const action = argv[0];
    const rest = argv.slice(1);
    const json = rest.includes("--json");
    const command = `agent.${action ?? "unknown"}`;
    try {
        if (action === "help" || action === "--help" || action === "-h")
            return { code: 0, stdout: AGENT_HELP, stderr: "" };
        if (action === undefined)
            throw new CliUsageError(`missing agent action\n\n${AGENT_HELP}`);
        const args = parseStrictArguments(rest, specFor(action));
        const sessionId = parseSession(args.values.get("session"), context.sessionId);
        const runtime = createManagementRuntime({ homeDir: context.homeDir, sessionId });
        const project = await runtime.projects.show(ProjectId.of(required(args.values, "project")));
        assertPublicPromptAllowed(action, project.orchestrationMode, args.positionals[0]);
        let data;
        switch (action) {
            case "list": {
                const agents = await runtime.agents.list(project);
                data = agents.filter((agent) => !args.booleans.has("active") || agent.active).map((agent) => serializeAgent(agent));
                break;
            }
            case "show":
                data = serializeAgent(await runtime.agents.show(project, AgentId.of(args.positionals[0])), sessionId.value);
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
                    ...(args.values.get("id") === undefined ? {} : { id: AgentId.of(args.values.get("id")) }),
                    ...scopeArgs(args.values),
                }), sessionId.value);
                break;
            case "use":
                data = serializeAgent(await runtime.agents.select(project, AgentId.of(args.positionals[0])), sessionId.value);
                break;
            case "deactivate":
                if (!args.booleans.has("yes"))
                    throw new CliUsageError("agent deactivate requires --yes confirmation");
                data = serializeAgent(await runtime.agents.deactivate(project, AgentId.of(args.positionals[0])), sessionId.value);
                break;
            case "replace":
                data = serializeAgent(await runtime.agents.replace({
                    project,
                    replacedAgentId: AgentId.of(args.positionals[0]),
                    provider: required(args.values, "provider"),
                    role: required(args.values, "role"),
                    ...(args.values.get("id") === undefined ? {} : { id: AgentId.of(args.values.get("id")) }),
                    ...scopeArgs(args.values),
                }), sessionId.value);
                break;
            case "advise": {
                const orchestration = orchestrationRuntime(runtime, context);
                data = await orchestration.advise({
                    projectId: project.id,
                    ...(args.values.get("feature") === undefined ? {} : { featureId: FeatureId.of(args.values.get("feature")) }),
                });
                break;
            }
            case "prompt": {
                const role = parseRole(args.positionals[0]);
                const featureId = args.values.get("feature");
                if (role !== "product" && featureId === undefined)
                    throw new CliUsageError(`agent prompt ${role} requires --feature <id>`);
                data = await orchestrationRuntime(runtime, context).initializationPrompt({
                    projectId: project.id,
                    role,
                    ...(featureId === undefined ? {} : { featureId: FeatureId.of(featureId) }),
                    ...(args.values.get("provider") === undefined ? {} : { provider: args.values.get("provider") }),
                    ...(args.values.get("session") === undefined ? {} : { sessionId }),
                    ...(args.values.get("mode") === undefined ? {} : { mode: parseMode(args.values.get("mode")) }),
                });
                break;
            }
            case "handoff-prompt":
            case "resume-prompt":
                data = await orchestrationRuntime(runtime, context).productHandoffPrompt({
                    projectId: project.id,
                    ...(args.values.get("feature") === undefined ? {} : { featureId: FeatureId.of(args.values.get("feature")) }),
                    ...(args.values.get("agent") === undefined ? {} : { agentId: args.values.get("agent") }),
                });
                break;
            default:
                throw new CliUsageError(`unknown agent action: ${action}`);
        }
        return output(command, data, json, action, sessionId.value);
    }
    catch (error) {
        return failure(command, error, json);
    }
}
function assertPublicPromptAllowed(action, orchestrationMode, requestedRole) {
    if (orchestrationMode !== "automatic")
        return;
    if (action === "handoff-prompt" || action === "resume-prompt")
        return;
    if (action === "prompt" && requestedRole?.trim().toLowerCase() === "product")
        return;
    if (action === "prompt")
        throw new CliUsageError("specialist prompts are unavailable in automatic mode; use the verified orchestration campaign after Product framing.");
}
function specFor(action) {
    const jsonProject = { json: "boolean", project: "string", session: "string" };
    const identity = {
        ...jsonProject,
        provider: "string",
        role: "string",
        id: "string",
        features: "string",
        paths: "string",
        responsibilities: "string",
    };
    const specs = {
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
function scopeArgs(values) {
    return {
        ...(values.get("features") === undefined ? {} : { featureIds: split(values.get("features")).map((value) => FeatureId.of(value)) }),
        ...(values.get("paths") === undefined ? {} : { paths: split(values.get("paths")) }),
        ...(values.get("responsibilities") === undefined ? {} : { responsibilities: split(values.get("responsibilities"), ";") }),
    };
}
function split(value, separator = ",") {
    const values = value.split(separator).map((item) => item.trim()).filter(Boolean);
    if (values.length === 0)
        throw new CliUsageError("scope option must contain at least one value");
    return values;
}
function required(values, name) {
    const value = values.get(name);
    if (value === undefined)
        throw new CliUsageError(`--${name} is required`);
    return value;
}
export function serializeAgent(agent, sessionId) {
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
function output(command, data, json, action, sessionId) {
    if (json)
        return { code: 0, stdout: jsonEnvelope({ command, ok: true, data }), stderr: "" };
    if (data === null)
        return { code: 0, stdout: `${translate("cli.agent.none", { session: sessionId })}\n`, stderr: "" };
    if (action === "advise")
        return { code: 0, stdout: humanAdvice(data), stderr: "" };
    if (action === "prompt") {
        const prompt = data;
        return { code: 0, stdout: `PREREQUISITE TO RUN BEFORE OPENING THE PROVIDER SESSION\n${prompt.preflightCommand}\n\nPROMPT TO SEND\n${prompt.prompt}\n`, stderr: "" };
    }
    if (action === "handoff-prompt" || action === "resume-prompt") {
        return { code: 0, stdout: `${data.prompt}\n`, stderr: "" };
    }
    if (action === "sessions") {
        const sessions = data;
        return { code: 0, stdout: sessions.length === 0 ? "No Agent session is bound to this Project.\n" : `${sessions.map((item) => `${item.sessionId}\t${humanAgent(item.agent)}`).join("\n")}\n`, stderr: "" };
    }
    const rows = Array.isArray(data) ? data : [data];
    return {
        code: 0,
        stdout: rows.length === 0 ? "No Agent is registered. Start with `arka-norn agent register`.\n" : `${rows.map(humanAgent).join("\n")}\n`,
        stderr: "",
    };
}
function humanAgent(value) {
    const agent = value;
    const scope = [
        agent.scope.featureIds.length === 0 ? "features=toutes" : `features=${agent.scope.featureIds.join(",")}`,
        agent.scope.paths.length === 0 ? "chemins=tous" : `chemins=${agent.scope.paths.join(",")}`,
        agent.scope.responsibilities.length === 0 ? "responsibilities=unspecified" : `responsibilities=${agent.scope.responsibilities.join(";")}`,
    ].join(" · ");
    const replacement = "replacedByAgentId" in agent ? ` -> replaced by ${agent.replacedByAgentId}` : "";
    const session = "sessionId" in agent ? `\tsession=${String(agent.sessionId)}` : "";
    return `${agent.active ? "ACTIF" : "INACTIF"}\t${agent.id}\t${agent.provider}/${agent.role}\t${scope}${session}${replacement}`;
}
function humanAdvice(value) {
    const advice = value;
    const recommendations = advice.recommendations.length === 0
        ? ["  No secondary profile to start now."]
        : advice.recommendations.map((item) => `  ${item.mode === "execute" ? "NOW" : "PREPARE"} - ${item.role} - session ${item.sessionId}\n    ${item.reason}\n    ${item.command}`);
    return [
        `Pilotage Product — Project ${advice.projectId}${advice.featureId === undefined ? "" : ` · Feature ${advice.featureId}`}`,
        `Mode d'orchestration : ${advice.orchestrationMode}`,
        `Phase: ${advice.phase}${advice.nextStepId === undefined ? "" : ` - next step ${advice.nextStepId}`}`,
        `Product principal : ${advice.productPrincipal.status}${advice.productPrincipal.agentId === undefined ? "" : ` · ${advice.productPrincipal.agentId}`} · session main`,
        `Conseil : ${advice.productNextAction}`,
        "Suggested Agents:",
        ...recommendations,
        `Reprise Product : ${advice.handoffPromptCommand}`,
        ...advice.warnings.map((warning) => translate("common.warning", { message: warning })),
    ].join("\n") + "\n";
}
function orchestrationRuntime(runtime, context) {
    const preferences = new FsLocalePreferenceStore(context.homeDir);
    return createAgentOrchestrationRuntime({ ...runtime, pipeline: createPipelineRuntime(context.frameworkRoot, { homeDir: context.homeDir }), preferredSurface: async () => (await preferences.loadPreferences()).preferredSurface });
}
function parseSession(value, fallback) {
    return value === undefined ? fallback : AgentSessionId.of(value);
}
function parseRole(value) {
    try {
        return parseOrchestratedRole(value);
    }
    catch (error) {
        throw new CliUsageError(error instanceof Error ? error.message : String(error));
    }
}
function parseMode(value) {
    if (value === "execute" || value === "prepare")
        return value;
    throw new CliUsageError("--mode must be execute or prepare");
}
function failure(command, error, json) {
    const message = error instanceof Error ? error.message : String(error);
    const code = error instanceof CliUsageError ? 64
        : hasDomainCode(error, "AGENT_NOT_FOUND", "PROJECT_NOT_FOUND") ? 4
            : hasDomainCode(error, "AGENT_ALREADY_EXISTS") ? 5
                : hasDomainCode(error) || error instanceof DomainError ? 3 : 70;
    return json
        ? { code, stdout: jsonEnvelope({ command, ok: false, data: null, errors: [message], errorCode: "agent_command_failed" }), stderr: "" }
        : { code, stdout: "", stderr: `${translate("common.error", { message })}\n` };
}
function hasDomainCode(error, ...expected) {
    if (typeof error !== "object" || error === null || !("code" in error) || typeof error.code !== "string")
        return false;
    return expected.length === 0 || expected.includes(error.code);
}
//# sourceMappingURL=agent-cli.js.map