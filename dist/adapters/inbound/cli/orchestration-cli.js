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
import { DomainError } from "../../../domain/errors.js";
import { FeatureId } from "../../../domain/feature/feature-id.js";
import { ProjectId } from "../../../domain/project/project-id.js";
import { createManagementRuntime } from "../../../composition/management-runtime.js";
import { createOrchestrationRuntime } from "../../../composition/orchestration-runtime.js";
import { createPipelineRuntime } from "../../../composition/pipeline-runtime.js";
import { isOrchestrationWorkspaceMode } from "../../../domain/orchestration/execution-policy.js";
import { isExecutionProvider } from "../../../domain/orchestration/types.js";
import { CliUsageError, parseStrictArguments } from "./strict-arguments.js";
import { jsonEnvelope } from "./cli-envelope.js";
import { translate } from "../../../application/localization/locale.js";
export function orchestrationHelp() {
    return translate("cli.orchestration.help");
}
/** Public CLI surface. `_worker` is intentionally accepted but undocumented. */
export async function runOrchestrationCommand(argv, context) {
    const action = argv[0];
    const rest = argv.slice(1);
    const json = rest.includes("--json");
    const command = `orchestration.${action ?? "unknown"}`;
    try {
        if (action === "help" || action === "--help" || action === "-h")
            return { code: 0, stdout: orchestrationHelp(), stderr: "" };
        if (action === undefined)
            throw new CliUsageError(`missing orchestration action\n\n${orchestrationHelp()}`);
        const args = parseStrictArguments(rest, argumentSpec(action));
        const management = createManagementRuntime({ homeDir: context.homeDir });
        const pipeline = createPipelineRuntime(context.frameworkRoot, { homeDir: context.homeDir });
        const runtime = createOrchestrationRuntime({
            ...management,
            pipeline,
            homeDir: context.homeDir,
            frameworkRoot: context.frameworkRoot,
            ...(context.environment === undefined ? {} : { environment: context.environment }),
        });
        if (action === "_worker") {
            await runtime.runWorker({ projectId: required(args.values, "project"), executionId: required(args.values, "execution") });
            return { code: 0, stdout: "", stderr: "" };
        }
        const projectId = ProjectId.of(required(args.values, "project"));
        let data;
        switch (action) {
            case "configure":
                data = serializePolicy(await runtime.configure({
                    projectId,
                    selection: selectionFrom(args.values),
                    ...(args.values.get("workspace") === undefined ? {} : { workspaceMode: workspaceModeFrom(args.values) }),
                }));
                break;
            case "preview":
                data = serializePreview(await runtime.preview({
                    projectId,
                    featureId: FeatureId.of(required(args.values, "feature")),
                }));
                break;
            case "start":
                data = serializeExecution(await runtime.start({
                    projectId,
                    featureId: FeatureId.of(required(args.values, "feature")),
                    selection: selectionFrom(args.values),
                    previewFingerprint: required(args.values, "preview"),
                }));
                break;
            case "status":
                data = serializeStatus(await runtime.status({ projectId }));
                break;
            case "cancel":
                data = args.positionals[0].startsWith("campaign-")
                    ? serializeCampaign(await runtime.cancelCampaign({ projectId, campaignId: args.positionals[0], expectedRevision: requiredInteger(args.values, "revision") }))
                    : serializeExecution(await runtime.cancel({ projectId, executionId: args.positionals[0] }));
                break;
            case "approve":
                data = serializeExecution(await runtime.approve({ projectId, executionId: args.positionals[0] }));
                break;
            case "retry":
                data = args.positionals[0].startsWith("campaign-")
                    ? serializeCampaign(await runtime.retryCampaign({ projectId, campaignId: args.positionals[0], expectedRevision: requiredInteger(args.values, "revision"), fingerprint: required(args.values, "confirm") }))
                    : serializeExecution(await runtime.retry({ projectId, executionId: args.positionals[0] }));
                break;
            case "pause":
                data = serializeCampaign(await runtime.pause({ projectId, campaignId: args.positionals[0], expectedRevision: requiredInteger(args.values, "revision") }));
                break;
            case "resume":
                data = serializeCampaign(await runtime.resume({ projectId, campaignId: args.positionals[0], expectedRevision: requiredInteger(args.values, "revision") }));
                break;
            case "decide":
                data = serializeCampaign(await runtime.decide({
                    projectId,
                    campaignId: args.positionals[0],
                    expectedRevision: requiredInteger(args.values, "revision"),
                    fingerprint: required(args.values, "confirm"),
                    actor: required(args.values, "actor"),
                    choice: required(args.values, "choice"),
                    ...(args.values.get("reason") === undefined ? {} : { reason: args.values.get("reason") }),
                }));
                break;
            case "changes":
                data = await runtime.changes({ projectId, campaignId: args.positionals[0] });
                break;
            case "apply":
                data = serializeCampaign(await runtime.apply({ projectId, campaignId: args.positionals[0], expectedRevision: requiredInteger(args.values, "revision"), fingerprint: required(args.values, "confirm") }));
                break;
            case "abandon":
                data = serializeCampaign(await runtime.abandon({ projectId, campaignId: args.positionals[0], expectedRevision: requiredInteger(args.values, "revision") }));
                break;
            default:
                throw new CliUsageError(`unknown orchestration action: ${action}`);
        }
        return output(command, data, json, action);
    }
    catch (error) {
        return failure(command, error, json);
    }
}
function argumentSpec(action) {
    const project = { project: "string", json: "boolean" };
    const specs = {
        configure: { options: { ...project, provider: "string", model: "string", workspace: "string" }, minPositionals: 0, maxPositionals: 0 },
        preview: { options: { ...project, feature: "string" }, minPositionals: 0, maxPositionals: 0 },
        start: { options: { ...project, feature: "string", provider: "string", model: "string", preview: "string" }, minPositionals: 0, maxPositionals: 0 },
        status: { options: project, minPositionals: 0, maxPositionals: 0 },
        cancel: { options: { ...project, revision: "string" }, minPositionals: 1, maxPositionals: 1 },
        approve: { options: project, minPositionals: 1, maxPositionals: 1 },
        retry: { options: { ...project, revision: "string", confirm: "string" }, minPositionals: 1, maxPositionals: 1 },
        pause: { options: { ...project, revision: "string" }, minPositionals: 1, maxPositionals: 1 },
        resume: { options: { ...project, revision: "string" }, minPositionals: 1, maxPositionals: 1 },
        decide: { options: { ...project, revision: "string", confirm: "string", actor: "string", choice: "string", reason: "string" }, minPositionals: 1, maxPositionals: 1 },
        changes: { options: project, minPositionals: 1, maxPositionals: 1 },
        apply: { options: { ...project, revision: "string", confirm: "string" }, minPositionals: 1, maxPositionals: 1 },
        abandon: { options: { ...project, revision: "string" }, minPositionals: 1, maxPositionals: 1 },
        _worker: { options: { project: "string", execution: "string" }, minPositionals: 0, maxPositionals: 0 },
    };
    return specs[action] ?? { options: project };
}
function requiredInteger(values, name) {
    const parsed = Number(required(values, name));
    if (!Number.isInteger(parsed) || parsed < 1)
        throw new CliUsageError(`--${name} must be a positive integer`);
    return parsed;
}
function workspaceModeFrom(values) {
    const value = required(values, "workspace");
    if (!isOrchestrationWorkspaceMode(value) || value === "unconfigured")
        throw new CliUsageError("--workspace must be isolated or direct");
    return value;
}
function required(values, name) {
    const value = values.get(name);
    if (value === undefined)
        throw new CliUsageError(`--${name} is required`);
    return value;
}
function selectionFrom(values) {
    const provider = required(values, "provider");
    if (!isExecutionProvider(provider)) {
        throw new CliUsageError("--provider must be one of: claude, codex, kimi, zai");
    }
    return { provider, model: required(values, "model") };
}
function output(command, data, json, action) {
    if (json)
        return { code: 0, stdout: jsonEnvelope({ command, ok: true, data }), stderr: "" };
    if (action === "status")
        return { code: 0, stdout: `${humanStatus(data)}\n`, stderr: "" };
    if (action === "configure")
        return { code: 0, stdout: `${humanPolicy(data)}\n`, stderr: "" };
    if (action === "preview")
        return { code: 0, stdout: `${humanPreview(data)}\n`, stderr: "" };
    if (["pause", "resume", "decide", "apply", "abandon"].includes(action) || (["cancel", "retry"].includes(action) && "revision" in data)) {
        const campaign = data;
        return { code: 0, stdout: `Campaign ${campaign.id}: ${campaign.status} (revision ${campaign.revision})\n`, stderr: "" };
    }
    if (action === "changes")
        return { code: 0, stdout: `${JSON.stringify(data, null, 2)}\n`, stderr: "" };
    const execution = data;
    return { code: 0, stdout: `${translate("cli.orchestration.execution", { id: execution.id, status: execution.status, assistant: assistantLabel(execution.target.provider), model: execution.target.model ?? translate("cli.orchestration.legacyModel") })}\n`, stderr: "" };
}
function failure(command, error, json) {
    const message = error instanceof Error ? error.message : String(error);
    const code = errorCode(error);
    if (json)
        return { code, stdout: jsonEnvelope({ command, ok: false, data: null, errors: [message], errorCode: "orchestration_command_failed" }), stderr: "" };
    return { code, stdout: "", stderr: `${translate("common.error", { message })}\n` };
}
function errorCode(error) {
    if (error instanceof CliUsageError)
        return 64;
    if (error instanceof DomainError) {
        if (["PROJECT_NOT_FOUND", "PROJECT_MARKER_NOT_FOUND", "FEATURE_NOT_FOUND", "FEATURE_MARKER_NOT_FOUND", "FILE_NOT_FOUND"].includes(error.code))
            return 4;
        if (["PROJECT_ALREADY_EXISTS", "FEATURE_ALREADY_EXISTS", "LOCK_CONFLICT"].includes(error.code))
            return 5;
        if (["INVALID_PROJECT_ID", "INVALID_FEATURE_ID", "INVALID_PROJECT_OPTION", "INVALID_FEATURE_OPTION"].includes(error.code))
            return 64;
        return 3;
    }
    return 3;
}
function serializeStatus(status) {
    return {
        schemaVersion: status.schemaVersion,
        projectId: status.projectId,
        orchestrationMode: status.orchestrationMode,
        policy: status.policy === undefined ? null : serializePolicy(status.policy),
        executions: status.executions.map(serializeExecution),
        activeExecution: status.activeExecution === undefined ? null : serializeExecution(status.activeExecution),
        latestExecution: status.latestExecution === undefined ? null : serializeExecution(status.latestExecution),
        actionRequired: status.actionRequired === undefined ? null : { ...status.actionRequired },
        activeCampaign: status.activeCampaign === undefined ? null : serializeCampaign(status.activeCampaign),
        latestCampaign: status.latestCampaign === undefined ? null : serializeCampaign(status.latestCampaign),
        projection: status.projection ?? null,
    };
}
function serializePolicy(policy) {
    return {
        schemaVersion: policy.schemaVersion,
        projectId: policy.projectId.value,
        selectionMode: policy.selectionMode,
        workspaceMode: policy.workspaceMode,
        providers: policy.providers.map((provider) => ({
            provider: provider.provider,
            adapter: provider.adapter,
            enabled: provider.enabled,
            priority: provider.priority,
            capabilities: [...provider.capabilities],
            permissions: [...provider.permissions],
            models: provider.models.map((model) => ({ ...model })),
        })),
        createdAt: policy.createdAt.toISOString(),
        updatedAt: policy.updatedAt.toISOString(),
    };
}
function serializeCampaign(campaign) {
    const value = campaign.props;
    return { ...value, projectId: value.projectId.value, featureId: value.featureId.value, target: { ...value.target }, scopePaths: [...value.scopePaths], missionIds: [...value.missionIds], createdAt: value.createdAt.toISOString(), updatedAt: value.updatedAt.toISOString() };
}
function serializeExecution(record) {
    return {
        id: record.id,
        target: {
            provider: record.target.provider,
            adapter: record.target.adapter,
            ...(record.target.model === undefined ? {} : { model: record.target.model }),
            source: record.target.source,
        },
        provider: record.provider,
        status: record.status,
        order: {
            id: record.order.id,
            scope: {
                projectId: record.order.scope.projectId.value,
                ...(record.order.scope.featureId === undefined ? {} : { featureId: record.order.scope.featureId.value }),
                paths: [...record.order.scope.paths],
            },
            preconditions: { ...record.order.preconditions },
            requiredCapabilities: [...record.order.requiredCapabilities],
            requiredPermissions: [...record.order.requiredPermissions],
            summary: record.order.summary,
            issuedAt: record.order.issuedAt.toISOString(),
        },
        attempts: record.attempts.map((attempt) => ({
            number: attempt.number,
            status: attempt.status,
            startedAt: attempt.startedAt.toISOString(),
            ...(attempt.endedAt === undefined ? {} : { endedAt: attempt.endedAt.toISOString() }),
            ...(attempt.providerSessionId === undefined ? {} : { providerSessionId: attempt.providerSessionId }),
        })),
        events: record.events.map((event) => ({ at: event.at.toISOString(), type: event.type, detail: event.detail })),
        truncatedEventCount: record.truncatedEventCount,
        proofReferences: [...record.proofReferences],
        ...(record.suspensionReason === undefined ? {} : { suspensionReason: { ...record.suspensionReason } }),
        ...(record.providerSessionId === undefined ? {} : { providerSessionId: record.providerSessionId }),
        createdAt: record.createdAt.toISOString(),
        updatedAt: record.updatedAt.toISOString(),
    };
}
function serializePreview(preview) {
    return {
        schemaVersion: preview.schemaVersion,
        projectId: preview.projectId,
        featureId: preview.featureId,
        featureName: preview.featureName,
        stepId: preview.stepId,
        role: preview.role,
        summary: preview.summary,
        logicalRoot: preview.logicalRoot ?? null,
        workspaceMode: preview.workspaceMode ?? "unconfigured",
        maximumMissions: preview.maximumMissions ?? 0,
        scopePaths: [...preview.scopePaths],
        requiredCapabilities: [...preview.requiredCapabilities],
        requiredPermissions: [...preview.requiredPermissions],
        candidates: preview.candidates.map((candidate) => ({
            target: {
                provider: candidate.target.provider,
                adapter: candidate.target.adapter,
                ...(candidate.target.model === undefined ? {} : { model: candidate.target.model }),
                source: candidate.target.source,
            },
            eligible: candidate.eligible,
            reasons: [...candidate.reasons],
            recommended: candidate.recommended,
            ...(candidate.runtimeVersion === undefined ? {} : { runtimeVersion: candidate.runtimeVersion }),
            ...(candidate.runtimeFingerprint === undefined ? {} : { runtimeFingerprint: candidate.runtimeFingerprint }),
        })),
        fingerprint: preview.fingerprint,
    };
}
function humanStatus(status) {
    const active = status.activeExecution ?? status.latestExecution;
    const noModel = translate("cli.orchestration.noModel");
    return [
        translate("cli.orchestration.status", { project: status.projectId, state: translate(status.orchestrationMode === "automatic" ? "cli.orchestration.enabled" : "cli.orchestration.paused") }),
        translate("cli.orchestration.assistants", { assistants: status.policy === null ? noModel : status.policy.providers.flatMap((provider) => provider.models.filter((model) => model.enabled).map((model) => `${assistantLabel(provider.provider)} ${model.id}`)).join(", ") || noModel }),
        translate("cli.orchestration.mission", { mission: active === null ? translate("cli.orchestration.none") : `${active.id} - ${active.status} - ${assistantLabel(active.target.provider)} / ${active.target.model ?? translate("cli.orchestration.legacyModel")}` }),
        translate("cli.orchestration.expectedAction", { action: status.actionRequired === null ? translate("cli.orchestration.none") : `${status.actionRequired.kind} (${status.actionRequired.reason})` }),
    ].join("\n");
}
function humanPolicy(policy) {
    const models = policy.providers.flatMap((provider) => provider.models
        .filter((model) => model.enabled)
        .map((model) => `${assistantLabel(provider.provider)} / ${model.id}`));
    return translate("cli.orchestration.policy", { models: models.join(", ") || translate("cli.orchestration.none") });
}
function humanPreview(preview) {
    const assistants = preview.candidates.map((candidate) => {
        const availability = candidate.eligible ? translate("cli.orchestration.ready") : candidate.reasons.join(", ");
        return `${assistantLabel(candidate.target.provider)} / ${candidate.target.model ?? translate("cli.orchestration.legacyModel")}: ${availability}`;
    });
    return [
        translate("cli.orchestration.feature", { feature: preview.featureName }),
        translate("cli.orchestration.work", { summary: preview.summary }),
        translate("cli.orchestration.available", { assistants: assistants.join(" - ") || translate("cli.orchestration.none") }),
        translate("cli.orchestration.fingerprint", { fingerprint: preview.fingerprint }),
    ].join("\n");
}
function assistantLabel(provider) {
    if (provider === "claude")
        return "Claude";
    if (provider === "codex")
        return "Codex";
    if (provider === "kimi")
        return "Kimi Platform";
    return "Z.AI Coding Plan";
}
//# sourceMappingURL=orchestration-cli.js.map