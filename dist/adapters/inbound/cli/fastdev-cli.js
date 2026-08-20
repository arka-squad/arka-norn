import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { createManagementRuntime } from "../../../composition/management-runtime.js";
import { createPipelineRuntime } from "../../../composition/pipeline-runtime.js";
import { AgentSessionId } from "../../../domain/agent/agent-session-id.js";
import { FeatureId } from "../../../domain/feature/feature-id.js";
import { ProjectId } from "../../../domain/project/project-id.js";
import { pipelineExitCode, pipelineReportEnvelope, presentPipelineReport } from "./presenters/pipeline-report-presenter.js";
import { CliUsageError, parseStrictArguments } from "./strict-arguments.js";
export async function runFastDevCommand(argv, context) {
    const action = argv[0];
    const rest = argv.slice(1);
    const json = rest.includes("--json");
    try {
        if (action === "start")
            return start(rest, context, json);
        if (action === "status" || action === "next")
            return inspect(action, rest, context, json);
        throw new CliUsageError("fastdev action must be start, status or next");
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const code = error instanceof CliUsageError ? 64 : 3;
        return json
            ? { code, stdout: `${JSON.stringify({ schemaVersion: 1, command: `fastdev.${action ?? "unknown"}`, ok: false, data: null, errors: [message], warnings: [] })}\n`, stderr: "" }
            : { code, stdout: "", stderr: `ERREUR — ${message}\n` };
    }
}
async function start(argv, context, json) {
    const parsed = parseStrictArguments(argv, { options: { project: "string", path: "string", json: "boolean" }, minPositionals: 1, maxPositionals: 1 });
    const projectValue = parsed.values.get("project");
    if (projectValue === undefined)
        throw new CliUsageError("fastdev start requires --project <id>");
    const management = createManagementRuntime({ homeDir: context.homeDir });
    const projectId = ProjectId.of(projectValue);
    const project = await management.projects.show(projectId);
    const name = parsed.positionals[0];
    const root = resolve(context.cwd, parsed.values.get("path") ?? resolve(project.root, slugify(name)));
    const id = FeatureId.of(`${slugify(name).slice(0, 54)}-${createHash("sha256").update(root).digest("hex").slice(0, 8)}`);
    const pipelineId = (await createPipelineRuntime(context.frameworkRoot).showWorkflow("fastdev")).id;
    const feature = await management.features.create({ id, projectId, name, root, pipelineId });
    const data = serializeFeature(feature);
    const human = [
        `FASTDEV créé — ${feature.name}`,
        `Feature : ${feature.id.value}`,
        "Parcours : cadrage → développement → audit → correction conditionnelle → validation",
        `Suite : arka-norn fastdev next ${feature.id.value}`,
    ].join("\n");
    return json ? envelope("fastdev.start", data) : { code: 0, stdout: `${human}\n`, stderr: "" };
}
async function inspect(action, argv, context, json) {
    const parsed = parseStrictArguments(argv, { options: { json: "boolean", session: "string" }, minPositionals: 1, maxPositionals: 1 });
    const sessionId = parsed.values.get("session") === undefined ? context.sessionId : AgentSessionId.of(parsed.values.get("session"));
    const management = createManagementRuntime({ homeDir: context.homeDir });
    const feature = await management.features.show(FeatureId.of(parsed.positionals[0]));
    if (feature.pipelineId !== "arka-norn-fastdev")
        throw new CliUsageError(`Feature ${feature.id.value} uses ${feature.pipelineId}, not FastDev.`);
    const project = await management.projects.show(feature.projectId);
    const agents = await management.agents.list(project);
    const report = await createPipelineRuntime(context.frameworkRoot).inspect({
        featureRoot: feature.root,
        featureId: feature.id.value,
        pipelineId: feature.pipelineId,
        authorRegistry: agents.map((agent) => ({ id: agent.id.value, active: agent.active, authorized: agent.coversFeature(feature.id) })),
    });
    if (action === "status") {
        return { code: pipelineExitCode(report), stdout: json ? `${JSON.stringify(pipelineReportEnvelope(report))}\n` : presentPipelineReport(report), stderr: "" };
    }
    const data = nextData(report, feature.id.value, sessionId.value);
    if (json) {
        return {
            code: pipelineExitCode(report),
            stdout: `${JSON.stringify({ schemaVersion: 1, command: "fastdev.next", ok: report.errors.length === 0, data, errors: report.errors, warnings: report.warnings })}\n`,
            stderr: "",
        };
    }
    if (data.action === null)
        return { code: pipelineExitCode(report), stdout: "FastDev terminé — validation pass sur le dernier CR.\n", stderr: "" };
    return {
        code: pipelineExitCode(report),
        stdout: [
            `Phase : ${data.phase} · itération ${data.iteration}`,
            `À faire : ${data.instructions.join(" ")}`,
            `Pourquoi : ${data.reason}`,
            `Prérequis : ${data.prerequisites.join(", ") || "aucun"}`,
            `Livrable : ${data.expectedArtifact}`,
            `Commande : ${data.suggestedCommand}`,
        ].join("\n") + "\n",
        stderr: "",
    };
}
function nextData(report, featureId, sessionId) {
    const action = report.nextActions[0];
    const crRuns = report.steps.find((step) => step.id === "cr_dev")?.documents.length ?? 0;
    if (action === undefined) {
        return { featureId, pipelineId: report.pipelineId, phase: "Terminé", iteration: Math.max(1, crRuns), action: null, prerequisites: report.steps.map((step) => step.id), reason: "Validation FastDev pass sur le dernier CR.", instructions: [], expectedArtifact: null, suggestedCommand: null };
    }
    const target = report.steps.find((step) => step.id === action.stepId);
    return {
        featureId,
        pipelineId: report.pipelineId,
        phase: action.phase ?? action.stepId,
        iteration: action.stepId === "cr_dev" ? crRuns + 1 : Math.max(1, crRuns),
        action: action.kind,
        prerequisites: report.steps.filter((step) => step.order < (target?.order ?? 0) && step.completionStatus === "completed").map((step) => step.id),
        reason: action.reason,
        instructions: action.instructions ?? [],
        expectedArtifact: `${action.stepId}.json`,
        suggestedCommand: withSession(action.suggestedCommand ?? `arka-norn pipeline scaffold ${action.stepId} --feature ${featureId}`, sessionId),
    };
}
function withSession(command, sessionId) {
    return command.includes(" --session ") ? command : `${command} --session ${sessionId}`;
}
function slugify(value) {
    const slug = value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    if (slug.length === 0)
        throw new CliUsageError("name cannot produce a valid identifier");
    return slug;
}
function serializeFeature(feature) {
    return { id: feature.id.value, projectId: feature.projectId.value, name: feature.name, root: feature.root, pipelineId: feature.pipelineId };
}
function envelope(command, data) {
    return { code: 0, stdout: `${JSON.stringify({ schemaVersion: 1, command, ok: true, data, errors: [], warnings: [] })}\n`, stderr: "" };
}
//# sourceMappingURL=fastdev-cli.js.map