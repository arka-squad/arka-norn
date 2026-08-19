import { AgentId } from "../../../domain/agent/agent-id.js";
import { DomainError } from "../../../domain/errors.js";
import { FeatureId } from "../../../domain/feature/feature-id.js";
import { ProjectId } from "../../../domain/project/project-id.js";
import { createManagementRuntime } from "../../../composition/management-runtime.js";
import { CliUsageError, parseStrictArguments } from "./strict-arguments.js";
export const AGENT_HELP = `Gestion des agents d'un Project

  agent list --project <id> [--active]
  agent register --project <id> --provider <nom> --role <rôle>
                 [--features id1,id2] [--paths chemin1,chemin2]
                 [--responsibilities "mission 1;mission 2"]
  agent show <agent-id> --project <id>
  agent current --project <id>
  agent use <agent-id> --project <id>
  agent replace <ancien-id> --project <id> --provider <nom> --role <rôle>
  agent deactivate <agent-id> --project <id> --yes

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
        const runtime = createManagementRuntime({ homeDir: context.homeDir });
        const project = await runtime.projects.show(ProjectId.of(required(args.values, "project")));
        let data;
        switch (action) {
            case "list": {
                const agents = await runtime.agents.list(project);
                data = agents.filter((agent) => !args.booleans.has("active") || agent.active).map(serializeAgent);
                break;
            }
            case "show":
                data = serializeAgent(await runtime.agents.show(project, AgentId.of(args.positionals[0])));
                break;
            case "current": {
                const current = await runtime.agents.current(project);
                data = current === undefined ? null : serializeAgent(current);
                break;
            }
            case "register":
                data = serializeAgent(await runtime.agents.register({
                    project,
                    provider: required(args.values, "provider"),
                    role: required(args.values, "role"),
                    ...(args.values.get("id") === undefined ? {} : { id: AgentId.of(args.values.get("id")) }),
                    ...scopeArgs(args.values),
                }));
                break;
            case "use":
                data = serializeAgent(await runtime.agents.select(project, AgentId.of(args.positionals[0])));
                break;
            case "deactivate":
                if (!args.booleans.has("yes"))
                    throw new CliUsageError("agent deactivate requires --yes confirmation");
                data = serializeAgent(await runtime.agents.deactivate(project, AgentId.of(args.positionals[0])));
                break;
            case "replace":
                data = serializeAgent(await runtime.agents.replace({
                    project,
                    replacedAgentId: AgentId.of(args.positionals[0]),
                    provider: required(args.values, "provider"),
                    role: required(args.values, "role"),
                    ...(args.values.get("id") === undefined ? {} : { id: AgentId.of(args.values.get("id")) }),
                    ...scopeArgs(args.values),
                }));
                break;
            default:
                throw new CliUsageError(`unknown agent action: ${action}`);
        }
        return output(command, data, json);
    }
    catch (error) {
        return failure(command, error, json);
    }
}
function specFor(action) {
    const jsonProject = { json: "boolean", project: "string" };
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
        register: { options: identity, minPositionals: 0, maxPositionals: 0 },
        use: { options: jsonProject, minPositionals: 1, maxPositionals: 1 },
        deactivate: { options: { ...jsonProject, yes: "boolean" }, minPositionals: 1, maxPositionals: 1 },
        replace: { options: identity, minPositionals: 1, maxPositionals: 1 },
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
export function serializeAgent(agent) {
    return {
        schemaVersion: 1,
        id: agent.id.value,
        provider: agent.provider,
        role: agent.role,
        active: agent.active,
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
function output(command, data, json) {
    if (json)
        return { code: 0, stdout: `${JSON.stringify({ schemaVersion: 1, command, ok: true, data, errors: [], warnings: [] })}\n`, stderr: "" };
    if (data === null)
        return { code: 0, stdout: "Aucun agent actif sélectionné. Utilise `arka-norn agent use <id> --project <id>`.\n", stderr: "" };
    const rows = Array.isArray(data) ? data : [data];
    return {
        code: 0,
        stdout: rows.length === 0 ? "Aucun agent enregistré. Commence avec `arka-norn agent register`.\n" : `${rows.map(humanAgent).join("\n")}\n`,
        stderr: "",
    };
}
function humanAgent(value) {
    const agent = value;
    const features = agent.scope.featureIds.length === 0 ? "tout le projet" : `features=${agent.scope.featureIds.join(",")}`;
    const replacement = "replacedByAgentId" in agent ? ` → remplacé par ${agent.replacedByAgentId}` : "";
    return `${agent.active ? "ACTIF" : "INACTIF"}\t${agent.id}\t${agent.provider}/${agent.role}\t${features}${replacement}`;
}
function failure(command, error, json) {
    const message = error instanceof Error ? error.message : String(error);
    const code = error instanceof CliUsageError ? 64
        : error instanceof DomainError && ["AGENT_NOT_FOUND", "PROJECT_NOT_FOUND"].includes(error.code) ? 4
            : error instanceof DomainError && error.code === "AGENT_ALREADY_EXISTS" ? 5
                : error instanceof DomainError ? 3 : 70;
    return json
        ? { code, stdout: `${JSON.stringify({ schemaVersion: 1, command, ok: false, data: null, errors: [message], warnings: [] })}\n`, stderr: "" }
        : { code, stdout: "", stderr: `ERREUR — ${message}\n` };
}
//# sourceMappingURL=agent-cli.js.map