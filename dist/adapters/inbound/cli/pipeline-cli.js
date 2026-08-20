import { existsSync } from "node:fs";
import { dirname, parse, relative, resolve } from "node:path";
import { createManagementRuntime } from "../../../composition/management-runtime.js";
import { createPipelineRuntime } from "../../../composition/pipeline-runtime.js";
import { FeatureId } from "../../../domain/feature/feature-id.js";
import { AgentId } from "../../../domain/agent/agent-id.js";
import { AgentSessionId } from "../../../domain/agent/agent-session-id.js";
import { AgentInactiveError, AgentScopeViolationError } from "../../../domain/errors.js";
import { FsFeatureStore } from "../../outbound/filesystem/fs-feature-store.js";
import { pipelineExitCode, pipelineReportEnvelope, presentPipelineReport } from "./presenters/pipeline-report-presenter.js";
import { CliUsageError, parseStrictArguments } from "./strict-arguments.js";
export async function runStatusCommand(argv, context) {
    const json = argv.includes("--json");
    try {
        const parsed = parseStrictArguments(argv, { options: { json: "boolean" }, minPositionals: 0, maxPositionals: 1 });
        const target = await resolveFeatureTarget(parsed.positionals[0] ?? context.cwd, context.cwd, createManagementRuntime({ homeDir: context.homeDir, sessionId: context.sessionId }));
        const report = withTargetWarnings(await createPipelineRuntime(context.frameworkRoot).inspect(inspectInput(target)), target.warnings);
        return {
            code: pipelineExitCode(report),
            stdout: json ? `${JSON.stringify(pipelineReportEnvelope(report))}\n` : presentPipelineReport(report),
            stderr: "",
        };
    }
    catch (error) {
        return pipelineFailure("status", error, json, error instanceof CliUsageError ? 64 : 70);
    }
}
export async function runScaffoldCommand(argv, context) {
    const json = argv.includes("--json");
    try {
        const parsed = parseStrictArguments(argv, { options: { force: "boolean", json: "boolean", agent: "string", "feature-id": "string" }, minPositionals: 2, maxPositionals: 2 });
        const authorAgentId = parsed.values.get("agent");
        if (authorAgentId === undefined)
            throw new CliUsageError("scaffold requires --agent <Provider_role_YYYYMMDD>");
        const stepId = parsed.positionals[0];
        const outputPath = resolve(context.cwd, parsed.positionals[1]);
        const managed = await managedScaffoldContext(outputPath, authorAgentId, context);
        const result = await createPipelineRuntime(context.frameworkRoot).scaffold({
            stepId,
            outputPath,
            authorAgentId: AgentId.of(authorAgentId).value,
            ...(managed?.featureId === undefined && parsed.values.get("feature-id") === undefined ? {} : { featureId: managed?.featureId ?? parsed.values.get("feature-id") }),
            ...(managed === undefined ? {} : { pipelineId: managed.pipelineId, allowedRoot: managed.featureRoot }),
            force: parsed.booleans.has("force"),
        });
        return {
            code: 0,
            stdout: json
                ? `${JSON.stringify({ schemaVersion: 1, command: "scaffold", ok: true, data: result, errors: [], warnings: [] })}\n`
                : `Squelette écrit : ${result.outputPath}\nValeurs à remplacer : ${result.sentinelPaths.length}\n`,
            stderr: "",
        };
    }
    catch (error) {
        const conflict = hasCode(error, "EEXIST");
        const message = conflict && argv.length > 0
            ? `Le fichier existe déjà. Utilise --force pour confirmer l'écrasement.`
            : error instanceof Error ? error.message : String(error);
        return pipelineFailure("scaffold", message, json, error instanceof CliUsageError ? 64 : conflict ? 5 : 70);
    }
}
async function managedScaffoldContext(outputPath, authorAgentId, context) {
    const featureRoot = findFeatureRoot(dirname(outputPath));
    if (featureRoot === undefined)
        return undefined;
    const feature = await new FsFeatureStore().load(featureRoot);
    const management = createManagementRuntime({ homeDir: context.homeDir, sessionId: context.sessionId });
    const project = await management.projects.show(feature.projectId);
    const agent = await management.agents.show(project, AgentId.of(authorAgentId));
    if (!agent.active)
        throw new AgentInactiveError(agent.id.value);
    if (!agent.coversFeature(feature.id))
        throw new AgentScopeViolationError(agent.id.value, `feature:${feature.id.value}`);
    const projectRelativeOutput = relative(project.root, outputPath);
    if (!agent.coversProjectPath(projectRelativeOutput))
        throw new AgentScopeViolationError(agent.id.value, `path:${projectRelativeOutput}`);
    return { featureRoot, featureId: feature.id.value, pipelineId: feature.pipelineId };
}
function findFeatureRoot(start) {
    let current = resolve(start);
    const filesystemRoot = parse(current).root;
    while (true) {
        if (existsSync(resolve(current, ".arka-norn", "feature.json")))
            return current;
        if (current === filesystemRoot)
            return undefined;
        current = dirname(current);
    }
}
export async function runValidateCommand(argv, context) {
    const json = argv.includes("--json");
    try {
        const parsed = parseStrictArguments(argv, { options: { json: "boolean" }, minPositionals: 1, maxPositionals: 1 });
        const filePath = resolve(context.cwd, parsed.positionals[0]);
        const result = await createPipelineRuntime(context.frameworkRoot).validate({ filePath });
        const human = result.valid
            ? `VALIDE — ${relative(context.cwd, filePath)} (type: ${result.type}, schema: ${result.schemaPath})\n`
            : `INVALIDE — ${relative(context.cwd, filePath)}${result.type === undefined ? "" : ` (type: ${result.type})`}\n${result.errors.map((error) => `  - ${error}`).join("\n")}\n`;
        return {
            code: result.valid ? 0 : 3,
            stdout: json ? `${JSON.stringify({ schemaVersion: 1, command: "validate", ok: result.valid, data: result, errors: result.errors, warnings: [] })}\n` : human,
            stderr: "",
        };
    }
    catch (error) {
        return pipelineFailure("validate", error, json, error instanceof CliUsageError ? 64 : 70);
    }
}
export async function runPipelineCommand(argv, context) {
    const action = argv[0];
    const rest = argv.slice(1);
    const json = rest.includes("--json");
    try {
        const management = createManagementRuntime({ homeDir: context.homeDir, sessionId: context.sessionId });
        const pipeline = createPipelineRuntime(context.frameworkRoot);
        if (action === "status" || action === "next") {
            const parsed = parseStrictArguments(rest, { options: { json: "boolean" }, minPositionals: 1, maxPositionals: 1 });
            const target = await resolveFeatureTarget(parsed.positionals[0], context.cwd, management);
            const report = withTargetWarnings(await pipeline.inspect(inspectInput(target)), target.warnings);
            if (action === "status") {
                return { code: pipelineExitCode(report), stdout: json ? `${JSON.stringify(pipelineReportEnvelope(report))}\n` : presentPipelineReport(report), stderr: "" };
            }
            const data = { overallStatus: report.overallStatus, nextAction: report.nextActions[0] ?? null };
            const human = data.nextAction === null ? "Pipeline complet.\n" : `${data.nextAction.kind} -> ${data.nextAction.stepId}: ${data.nextAction.reason}\n`;
            return { code: pipelineExitCode(report), stdout: json ? `${JSON.stringify({ schemaVersion: 1, command: "pipeline.next", ok: report.overallStatus === "completed", data, errors: report.errors, warnings: report.warnings })}\n` : human, stderr: "" };
        }
        if (action === "scaffold") {
            return await runManagedScaffold(rest, context, management, pipeline, json);
        }
        if (action === "validate") {
            const parsed = parseStrictArguments(rest, { options: { document: "string", json: "boolean" }, minPositionals: 1, maxPositionals: 1 });
            const target = await resolveFeatureTarget(parsed.positionals[0], context.cwd, management);
            const document = parsed.values.get("document");
            if (document !== undefined) {
                const result = await pipeline.validate({ filePath: resolve(target.root, document), pipelineId: target.pipelineId });
                const human = `${result.valid ? "VALIDE" : "INVALIDE"} — ${document}\n${result.errors.join("\n")}${result.errors.length === 0 ? "" : "\n"}`;
                return { code: result.valid ? 0 : 3, stdout: json ? `${JSON.stringify({ schemaVersion: 1, command: "pipeline.validate", ok: result.valid, data: result, errors: result.errors, warnings: [] })}\n` : human, stderr: "" };
            }
            const report = withTargetWarnings(await pipeline.inspect(inspectInput(target)), target.warnings);
            return { code: pipelineExitCode(report), stdout: json ? `${JSON.stringify(pipelineReportEnvelope(report))}\n` : presentPipelineReport(report), stderr: "" };
        }
        throw new CliUsageError("pipeline action must be status, next, scaffold or validate");
    }
    catch (error) {
        const code = error instanceof CliUsageError ? 64 : hasCode(error, "EEXIST") || hasCode(error, "LOCK_CONFLICT") ? 5 : hasCode(error, "FEATURE_NOT_FOUND") || hasCode(error, "FILE_NOT_FOUND") ? 4 : 3;
        return pipelineFailure(`pipeline.${action ?? "unknown"}`, error, json, code);
    }
}
async function runManagedScaffold(argv, context, management, pipeline, json) {
    const parsed = parseStrictArguments(argv, { options: { feature: "string", output: "string", agent: "string", session: "string", json: "boolean", force: "boolean" }, minPositionals: 1, maxPositionals: 1 });
    const selectedManagement = parsed.values.get("session") === undefined
        ? management
        : createManagementRuntime({ homeDir: context.homeDir, sessionId: AgentSessionId.of(parsed.values.get("session")) });
    const featureId = parsed.values.get("feature");
    if (featureId === undefined)
        throw new CliUsageError("pipeline scaffold requires --feature <id>");
    const feature = await selectedManagement.features.show(FeatureId.of(featureId));
    const project = await selectedManagement.projects.show(feature.projectId);
    const explicitAgentId = parsed.values.get("agent");
    const agent = explicitAgentId === undefined
        ? await selectedManagement.agents.current(project)
        : await selectedManagement.agents.show(project, AgentId.of(explicitAgentId));
    if (agent === undefined)
        throw new CliUsageError(`no active agent selected for project ${project.id.value}; use agent register/use or --agent`);
    if (!agent.active)
        throw new AgentInactiveError(agent.id.value);
    if (!agent.coversFeature(feature.id))
        throw new AgentScopeViolationError(agent.id.value, `feature:${feature.id.value}`);
    const outputPath = resolve(context.cwd, parsed.values.get("output") ?? resolve(feature.root, `${parsed.positionals[0]}.json`));
    const projectRelativeOutput = relative(project.root, outputPath);
    if (!agent.coversProjectPath(projectRelativeOutput))
        throw new AgentScopeViolationError(agent.id.value, `path:${projectRelativeOutput}`);
    const result = await pipeline.scaffold({
        stepId: parsed.positionals[0], outputPath, allowedRoot: feature.root,
        authorAgentId: agent.id.value, featureId: feature.id.value, pipelineId: feature.pipelineId, force: parsed.booleans.has("force"),
    });
    return { code: 0, stdout: json ? `${JSON.stringify({ schemaVersion: 1, command: "pipeline.scaffold", ok: true, data: result, errors: [], warnings: [] })}\n` : `Squelette écrit : ${result.outputPath}\n`, stderr: "" };
}
async function resolveFeatureTarget(value, cwd, management) {
    const candidate = resolve(cwd, value);
    if (existsSync(candidate)) {
        if (!existsSync(resolve(candidate, ".arka-norn", "feature.json"))) {
            return { root: candidate, pipelineId: "arka-norn-default", warnings: ["Dossier sans marqueur Feature : pipeline standard utilisé par compatibilité."] };
        }
        const feature = await new FsFeatureStore().load(candidate);
        try {
            return await targetFromManagedFeature(feature, management);
        }
        catch {
            return { root: feature.root, id: feature.id.value, pipelineId: feature.pipelineId, warnings: ["Registre Agent indisponible pour ce chemin non indexé ; les auteurs ne sont pas vérifiés."] };
        }
    }
    const feature = await management.features.show(FeatureId.of(value));
    return targetFromManagedFeature(feature, management);
}
async function targetFromManagedFeature(feature, management) {
    const project = await management.projects.show(feature.projectId);
    const agents = await management.agents.list(project);
    return {
        root: feature.root,
        id: feature.id.value,
        pipelineId: feature.pipelineId,
        authorRegistry: agents.map((agent) => ({ id: agent.id.value, active: agent.active, authorized: agent.coversFeature(feature.id) })),
        warnings: [],
    };
}
function inspectInput(target) {
    return {
        featureRoot: target.root,
        pipelineId: target.pipelineId,
        ...(target.id === undefined ? {} : { featureId: target.id }),
        ...(target.authorRegistry === undefined ? {} : { authorRegistry: target.authorRegistry }),
    };
}
function withTargetWarnings(report, warnings) {
    return warnings.length === 0 ? report : { ...report, warnings: [...report.warnings, ...warnings] };
}
function pipelineFailure(command, error, json, code) {
    const message = error instanceof Error ? error.message : String(error);
    return json
        ? { code, stdout: `${JSON.stringify({ schemaVersion: 1, command, ok: false, data: null, errors: [message], warnings: [] })}\n`, stderr: "" }
        : { code, stdout: "", stderr: `ERREUR — ${message}\n` };
}
function hasCode(error, expected) {
    return error instanceof Error && "code" in error && error.code === expected;
}
//# sourceMappingURL=pipeline-cli.js.map