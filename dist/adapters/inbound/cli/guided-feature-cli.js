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
import { createManagementRuntime } from "../../../composition/management-runtime.js";
import { createPipelineRuntime } from "../../../composition/pipeline-runtime.js";
import { loadVerifiedFeatureContext } from "../../../composition/verified-feature-context.js";
import { AgentSessionId } from "../../../domain/agent/agent-session-id.js";
import { FeatureId } from "../../../domain/feature/feature-id.js";
import { ProjectId } from "../../../domain/project/project-id.js";
import { guidedNext } from "../../../application/guided/guided-next.js";
import { pipelineExitCode, pipelineReportEnvelope, presentPipelineReport } from "./presenters/pipeline-report-presenter.js";
import { CliUsageError, parseStrictArguments } from "./strict-arguments.js";
import { jsonEnvelope } from "./cli-envelope.js";
export async function runGuidedFeatureCommand(argv, context, config) {
    const action = argv[0];
    const rest = argv.slice(1);
    const json = rest.includes("--json");
    try {
        if (action === "start")
            return await start(rest, context, config, json);
        if (action === "status" || action === "next")
            return await inspect(action, rest, context, config, json);
        throw new CliUsageError(`${config.commandName} action must be start, status or next`);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const code = error instanceof CliUsageError ? 64 : 3;
        return json
            ? { code, stdout: jsonEnvelope({ command: `${config.commandName}.${action ?? "unknown"}`, ok: false, data: null, errors: [message], errorCode: error instanceof CliUsageError ? "invalid_arguments" : "guided_feature_failed" }), stderr: "" }
            : { code, stdout: "", stderr: `ERROR: ${message}\n` };
    }
}
async function start(argv, context, config, json) {
    const parsed = parseStrictArguments(argv, { options: { project: "string", json: "boolean" }, minPositionals: 1, maxPositionals: 1 });
    const projectValue = parsed.values.get("project");
    if (projectValue === undefined)
        throw new CliUsageError(`${config.commandName} start requires --project <id>`);
    const management = createManagementRuntime({ homeDir: context.homeDir });
    const projectId = ProjectId.of(projectValue);
    const featureId = FeatureId.of(parsed.positionals[0]);
    const feature = await management.features.show(featureId);
    if (!feature.projectId.equals(projectId))
        throw new CliUsageError(`Feature ${feature.id.value} does not belong to Project ${projectId.value}.`);
    const pipeline = createPipelineRuntime(context.frameworkRoot, { homeDir: context.homeDir });
    const selected = await pipeline.showWorkflow(config.workflowAlias);
    if (selected.id !== config.pipelineId)
        throw new Error(`Workflow ${config.workflowAlias} resolved to ${selected.id}, expected ${config.pipelineId}.`);
    const workflows = await pipeline.listWorkflows();
    const updated = await management.features.setWorkflow({
        id: featureId,
        pipelineId: selected.id,
        recognizedDocumentTypes: [...new Set([...workflows.flatMap((item) => item.steps.map((step) => step.id)), "handoff"])],
    });
    const data = serializeFeature(updated);
    const human = [
        `${config.displayName.toUpperCase()} rework started: ${updated.name}`,
        `Feature: ${updated.id.value}`,
        `Journey: ${config.journey}`,
        `Next: arka-norn ${config.commandName} next ${updated.id.value}`,
    ].join("\n");
    return json ? envelope(`${config.commandName}.start`, data) : { code: 0, stdout: `${human}\n`, stderr: "" };
}
async function inspect(action, argv, context, config, json) {
    const parsed = parseStrictArguments(argv, { options: { json: "boolean", session: "string" }, minPositionals: 1, maxPositionals: 1 });
    const sessionId = parsed.values.get("session") === undefined ? context.sessionId : AgentSessionId.of(parsed.values.get("session"));
    const management = createManagementRuntime({ homeDir: context.homeDir });
    const feature = await management.features.show(FeatureId.of(parsed.positionals[0]));
    if (feature.pipelineId !== config.pipelineId)
        throw new CliUsageError(`Feature ${feature.id.value} uses ${feature.pipelineId}, not ${config.displayName}.`);
    const { authorRegistry } = await loadVerifiedFeatureContext(feature, management);
    const report = await createPipelineRuntime(context.frameworkRoot, { homeDir: context.homeDir }).inspect({
        featureRoot: feature.root,
        featureId: feature.id.value,
        pipelineId: feature.pipelineId,
        documentContractVersion: feature.documentContractVersion,
        authorRegistry,
    });
    if (action === "status") {
        return { code: pipelineExitCode(report), stdout: json ? `${JSON.stringify(pipelineReportEnvelope(report))}\n` : presentPipelineReport(report), stderr: "" };
    }
    const data = guidedNext(report, feature.id.value, sessionId.value, config);
    if (json) {
        return {
            code: pipelineExitCode(report),
            stdout: jsonEnvelope({ command: `${config.commandName}.next`, ok: report.errors.length === 0, data, errors: report.errors, warnings: report.warnings, errorCode: "pipeline_error", warningCode: "pipeline_warning" }),
            stderr: "",
        };
    }
    if (data.action === null)
        return { code: pipelineExitCode(report), stdout: `${config.displayName} completed: the latest development report passed validation.\n`, stderr: "" };
    return {
        code: pipelineExitCode(report),
        stdout: [
            `Phase: ${data.phase} · iteration ${data.iteration}`,
            `Action: ${data.instructions.join(" ")}`,
            `Reason: ${data.reason}`,
            `Prerequisites: ${data.prerequisites.join(", ") || "none"}`,
            `Deliverable: ${data.expectedArtifact}`,
            `Command: ${data.suggestedCommand}`,
        ].join("\n") + "\n",
        stderr: "",
    };
}
function serializeFeature(feature) {
    return { id: feature.id.value, projectId: feature.projectId.value, name: feature.name, root: feature.root, pipelineId: feature.pipelineId };
}
function envelope(command, data) {
    return { code: 0, stdout: jsonEnvelope({ command, ok: true, data }), stderr: "" };
}
//# sourceMappingURL=guided-feature-cli.js.map