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
import { formatNumber, translate } from "../../../../application/localization/locale.js";
import { titledBox } from "../components/box.js";
import { createMenuScene } from "../components/menu.js";
import { displayCandidateReason, displayMissionAction, displayMissionEvents, displayMissionStatus, displayPermission, displayProvider, displayRole, displayScopePath, displayStep, displayTarget, isReadOnlyAnalysisAwaitingValidation, translatePreparationError, } from "./orchestration-presentation.js";
const EXECUTION_PROVIDER_CHOICES = ["claude", "codex", "kimi", "zai"];
/**
 * Human-facing control-plane view. Preparation is read-only and every start
 * explicitly confirms the Feature, target and preview fingerprint.
 */
export function createOrchestrationView(deps) {
    let project = deps.project;
    let status = deps.initialStatus;
    const features = [...(deps.initialFeatures ?? [])];
    let viewMode = "overview";
    let selectedFeature;
    let preview;
    let selectedCandidateIndex;
    let selectedProvider;
    let modelInput = "";
    let busy = false;
    let message;
    let menu = buildMenu();
    function buildMenu() {
        return createMenuScene(items(), {
            hint: translate("tui.orchestration.menu.hint"),
            maxVisible: 10,
            onSelect: (action) => void select(action),
        });
    }
    function items() {
        if (viewMode === "feature-selection") {
            return [
                ...features.map((feature) => ({
                    label: feature.name,
                    value: `feature:${feature.id.value}`,
                    description: translate("tui.orchestration.feature.description"),
                })),
                { label: `<- ${translate("tui.orchestration.back.dashboard")}`, value: "back" },
            ];
        }
        if (viewMode === "target-selection") {
            const prepared = requirePreview();
            const choices = selectableCandidates(prepared);
            return [
                ...choices.map(({ candidate, index }) => ({
                    label: displayTarget(candidate.target),
                    value: `target:${index}`,
                    description: candidate.recommended
                        ? translate("tui.orchestration.target.recommended")
                        : translate("tui.orchestration.target.compatible"),
                })),
                { label: translate("tui.orchestration.target.configure"), value: "configure-target", description: translate("tui.orchestration.target.configureDescription") },
                { label: `<- ${translate("tui.orchestration.back.preview")}`, value: "back" },
            ];
        }
        if (viewMode === "provider-selection") {
            return [
                ...EXECUTION_PROVIDER_CHOICES.map((provider) => ({
                    label: displayProvider(provider),
                    value: `provider:${provider}`,
                    description: translate("tui.orchestration.provider.description"),
                })),
                { label: `<- ${translate("tui.orchestration.back.preview")}`, value: "back" },
            ];
        }
        if (viewMode === "preview") {
            const candidate = selectedCandidate();
            return [
                ...(candidate === undefined
                    ? []
                    : [{
                            label: translate("tui.orchestration.start", { target: displayTarget(candidate.target) }),
                            value: "start",
                            description: translate("tui.orchestration.start.description"),
                        }]),
                ...(selectableCandidates(requirePreview()).length > 1
                    ? [{ label: translate("tui.orchestration.target.choose"), value: "choose-target", description: translate("tui.orchestration.target.chooseDescription") }]
                    : []),
                { label: translate("tui.orchestration.target.configure"), value: "configure-target", description: translate("tui.orchestration.target.configureDescription") },
                { label: translate("tui.orchestration.preview.refresh"), value: "refresh-preview", description: translate("tui.orchestration.preview.refreshDescription") },
                ...(features.length > 1 ? [{ label: translate("tui.orchestration.feature.chooseAnother"), value: "choose-feature" }] : []),
                { label: `<- ${translate("tui.orchestration.back.dashboard")}`, value: "back" },
            ];
        }
        const active = status.activeExecution;
        if (active !== undefined) {
            return [
                ...(active.status === "planned" || active.status === "running" || active.status === "awaiting_approval"
                    ? [{ label: translate("tui.orchestration.mission.cancel"), value: "cancel", description: translate("tui.orchestration.mission.cancelDescription") }]
                    : []),
                ...(active.status === "awaiting_approval"
                    ? [{ label: translate("tui.orchestration.mission.approve"), value: "approve", description: translate("tui.orchestration.mission.approveDescription") }]
                    : []),
                ...(active.status === "failed" || active.status === "cancelled" || active.status === "interrupted"
                    ? [{ label: translate("tui.orchestration.mission.retry"), value: "retry", description: translate("tui.orchestration.mission.retryDescription") }]
                    : []),
                ...(status.actionRequired?.kind === "inspect"
                    ? [{ label: translate("tui.orchestration.mission.inspect"), value: "inspect", description: translate("tui.orchestration.mission.inspectDescription") }]
                    : []),
                { label: translate("tui.orchestration.refresh"), value: "refresh", description: translate("tui.orchestration.refresh.description") },
                { label: `<- ${translate("tui.orchestration.back.project")}`, value: "back" },
            ];
        }
        const manualAuditValidation = isReadOnlyAnalysisAwaitingValidation(status.latestExecution);
        return [
            ...(isRetryable(status.latestExecution)
                ? [{ label: translate("tui.orchestration.mission.retry"), value: "retry", description: translate("tui.orchestration.mission.retryDescription") }]
                : []),
            ...(status.actionRequired?.kind === "inspect"
                ? [{
                        label: translate(manualAuditValidation ? "tui.orchestration.mission.auditValidation" : "tui.orchestration.mission.inspect"),
                        value: "inspect",
                        description: translate(manualAuditValidation ? "tui.orchestration.mission.auditValidationDescription" : "tui.orchestration.mission.inspectDescription"),
                    }]
                : []),
            ...(status.orchestrationMode !== "automatic" || features.length === 0 || manualAuditValidation
                ? []
                : [{
                        label: features.length === 1
                            ? translate("tui.orchestration.prepare.one", { feature: features[0].name })
                            : translate("tui.orchestration.prepare.many"),
                        value: "prepare",
                        description: translate("tui.orchestration.prepare.description"),
                    }]),
            { label: translate("tui.orchestration.refresh"), value: "refresh", description: translate("tui.orchestration.refresh.description") },
            { label: `<- ${translate("tui.orchestration.back.project")}`, value: "back", ...(status.orchestrationMode !== "automatic" ? { description: translate("tui.orchestration.enable.description") } : {}) },
        ];
    }
    async function select(action) {
        if (busy)
            return;
        if (action === "back") {
            if (viewMode === "overview")
                deps.onBack();
            else {
                viewMode = previousMode(viewMode);
                menu = buildMenu();
                deps.redraw();
            }
            return;
        }
        if (action.startsWith("feature:")) {
            const feature = features.find((candidate) => candidate.id.value === action.slice("feature:".length));
            if (feature !== undefined)
                await loadPreview(feature);
            return;
        }
        if (action.startsWith("target:")) {
            selectedCandidateIndex = Number(action.slice("target:".length));
            viewMode = "preview";
            menu = buildMenu();
            deps.redraw();
            return;
        }
        if (action.startsWith("provider:")) {
            selectedProvider = providerFromAction(action);
            modelInput = "";
            viewMode = "model-input";
            menu = buildMenu();
            deps.redraw();
            return;
        }
        if (action === "prepare") {
            if (features.length === 1)
                await loadPreview(features[0]);
            else if (features.length > 1) {
                viewMode = "feature-selection";
                menu = buildMenu();
                deps.redraw();
            }
            return;
        }
        if (action === "choose-feature") {
            viewMode = "feature-selection";
            menu = buildMenu();
            deps.redraw();
            return;
        }
        if (action === "choose-target") {
            viewMode = "target-selection";
            menu = buildMenu();
            deps.redraw();
            return;
        }
        if (action === "configure-target") {
            viewMode = "provider-selection";
            menu = buildMenu();
            deps.redraw();
            return;
        }
        if (action === "refresh-preview") {
            if (selectedFeature !== undefined)
                await loadPreview(selectedFeature);
            return;
        }
        if (action === "start") {
            await startPreparedMission();
            return;
        }
        if (action === "inspect") {
            message = displayMissionStatus(status.activeExecution ?? status.latestExecution).detail;
            deps.redraw();
            return;
        }
        if (action === "refresh") {
            await run(refreshStatusAndProject);
            return;
        }
        if (action === "cancel") {
            await updateCurrentMission((execution) => deps.orchestration.cancel({ projectId: project.id, executionId: execution.id }), translate("tui.orchestration.message.cancelled"));
            return;
        }
        if (action === "approve") {
            await updateCurrentMission((execution) => deps.orchestration.approve({ projectId: project.id, executionId: execution.id }), translate("tui.orchestration.message.approved"));
            return;
        }
        if (action === "retry") {
            await updateCurrentMission((execution) => deps.orchestration.retry({ projectId: project.id, executionId: execution.id }), translate("tui.orchestration.message.retry"));
        }
    }
    async function loadPreview(feature) {
        await run(() => preparePreview(feature));
    }
    async function preparePreview(feature, configuredTarget) {
        const prepared = await deps.orchestration.preview({ projectId: project.id, featureId: feature.id });
        selectedFeature = feature;
        preview = prepared;
        selectedCandidateIndex = configuredTarget === undefined
            ? undefined
            : selectableCandidates(prepared).find(({ candidate }) => candidate.target.provider === configuredTarget.provider && candidate.target.model === configuredTarget.model)?.index;
        viewMode = selectedCandidateIndex === undefined ? "target-selection" : "preview";
        menu = buildMenu();
    }
    async function configureSelectedTarget() {
        const provider = selectedProvider;
        const model = modelInput.trim();
        const feature = selectedFeature;
        if (provider === undefined || feature === undefined || model.length === 0) {
            message = translate("tui.orchestration.model.required");
            deps.redraw();
            return;
        }
        await run(async () => {
            await deps.orchestration.configure({ projectId: project.id, selection: { provider, model } });
            await preparePreview(feature, { provider, model });
            message = translate("tui.orchestration.model.saved", { provider: displayProvider(provider), model });
        });
    }
    async function startPreparedMission() {
        const prepared = preview;
        const feature = selectedFeature;
        const candidate = selectedCandidate();
        const model = candidate?.target.model;
        if (prepared === undefined || feature === undefined || candidate === undefined || model === undefined) {
            message = translate("tui.orchestration.target.incomplete");
            deps.redraw();
            return;
        }
        await run(async () => {
            await deps.orchestration.start({
                projectId: project.id,
                featureId: feature.id,
                selection: { provider: candidate.target.provider, model },
                previewFingerprint: prepared.fingerprint,
            });
            await refreshStatusAndProject();
            preview = undefined;
            selectedCandidateIndex = undefined;
            viewMode = "overview";
            menu = buildMenu();
            message = translate("tui.orchestration.mission.started", { target: displayTarget(candidate.target) });
        });
    }
    async function updateCurrentMission(operation, successMessage) {
        await run(async () => {
            const execution = requireCurrentExecution(status);
            await operation(execution);
            await refreshStatusAndProject();
            menu = buildMenu();
            message = successMessage;
        });
    }
    async function refreshStatusAndProject() {
        const refreshedStatus = await deps.orchestration.status({ projectId: project.id });
        if (deps.refreshProject !== undefined && refreshedStatus.orchestrationMode !== project.orchestrationMode) {
            project = await deps.refreshProject();
        }
        status = refreshedStatus;
        menu = buildMenu();
    }
    function requirePreview() {
        if (preview === undefined)
            throw new Error("No assisted mission preview is available.");
        return preview;
    }
    function selectedCandidate() {
        const prepared = preview;
        if (prepared === undefined || selectedCandidateIndex === undefined)
            return undefined;
        const candidate = prepared.candidates[selectedCandidateIndex];
        return candidate?.eligible === true && candidate.target.model !== undefined ? candidate : undefined;
    }
    async function run(task) {
        busy = true;
        message = undefined;
        deps.redraw();
        try {
            await task();
        }
        catch (error) {
            message = translatePreparationError(error);
        }
        finally {
            busy = false;
            deps.redraw();
        }
    }
    function handleModelInput(event) {
        if (busy)
            return "consumed";
        if (event.kind === "escape") {
            viewMode = "provider-selection";
        }
        else if (event.kind === "backspace") {
            modelInput = modelInput.slice(0, -1);
        }
        else if (event.kind === "char") {
            modelInput += event.value;
        }
        else if (event.kind === "enter") {
            void configureSelectedTarget();
        }
        deps.redraw();
        return "consumed";
    }
    return {
        chrome: { contextBanner: false },
        onKey(event) {
            if (viewMode === "model-input")
                return handleModelInput(event);
            if (event.kind === "escape") {
                if (viewMode === "overview")
                    deps.onBack();
                else {
                    viewMode = previousMode(viewMode);
                    menu = buildMenu();
                    deps.redraw();
                }
                return "consumed";
            }
            return busy ? "consumed" : menu.onKey(event);
        },
        render(renderer, theme) {
            renderer.redraw((line) => {
                for (const value of titledBox(translate("tui.orchestration.title"), renderSummary(), theme, { border: theme.arkaAccent }).split("\n"))
                    line(value);
                line("");
                if (busy)
                    line(`  ${theme.dim(translate("tui.orchestration.busy"))}`);
                if (message !== undefined)
                    line(`  ${theme.arkaAccent(message)}`);
                if (viewMode !== "model-input") {
                    for (const value of menu.renderLines(theme))
                        line(value);
                }
            });
        },
    };
    function renderSummary() {
        if (viewMode === "feature-selection") {
            return [
                `Project : ${project.name}`,
                translate("tui.orchestration.summary.feature.choose"),
                translate("tui.orchestration.summary.previewOnly"),
            ];
        }
        if (viewMode === "target-selection") {
            const choices = selectableCandidates(requirePreview());
            return [
                `Feature : ${requirePreview().featureName}`,
                choices.length === 0
                    ? translate("tui.orchestration.summary.target.none")
                    : translate("tui.orchestration.summary.target.choose"),
                choices.length === 0
                    ? translate("tui.orchestration.summary.target.configure")
                    : translate("tui.orchestration.summary.target.filtered"),
            ];
        }
        if (viewMode === "provider-selection") {
            return [
                `Feature : ${requirePreview().featureName}`,
                translate("tui.orchestration.summary.provider.choose"),
                translate("tui.orchestration.summary.provider.verify"),
            ];
        }
        if (viewMode === "model-input") {
            return [
                translate("tui.orchestration.summary.assistant", { provider: selectedProvider === undefined ? translate("tui.orchestration.summary.assistant.none") : displayProvider(selectedProvider) }),
                translate("tui.orchestration.summary.model.help"),
                "",
                translate("tui.orchestration.summary.model", { model: `${modelInput}_` }),
                translate("tui.orchestration.summary.model.hint"),
            ];
        }
        if (viewMode === "preview")
            return renderPreviewSummary(requirePreview(), selectedCandidateIndex);
        const execution = status.activeExecution ?? status.latestExecution;
        const displayed = displayMissionStatus(execution);
        const manualAuditValidation = isReadOnlyAnalysisAwaitingValidation(status.latestExecution);
        const missionSummary = execution === undefined
            ? []
            : renderMissionSummary(execution, status.actionRequired, status.activeExecution !== undefined);
        return [
            `Project : ${project.name}`,
            translate("tui.orchestration.summary.mode", { state: translate(status.orchestrationMode === "automatic" ? "tui.project.state.enabled" : "tui.project.state.disabled") }),
            ...missionSummary,
            translate("tui.orchestration.summary.situation", { situation: displayed.title }),
            displayed.detail,
            ...(status.activeExecution === undefined && status.orchestrationMode === "automatic"
                ? [manualAuditValidation
                        ? translate("tui.orchestration.summary.audit")
                        : features.length === 0
                            ? translate("tui.orchestration.summary.noFeature")
                            : translate("tui.orchestration.summary.confirmation")]
                : []),
            ...(status.activeExecution === undefined && status.orchestrationMode !== "automatic"
                ? [translate("tui.orchestration.summary.disabled")]
                : []),
        ];
    }
}
function renderMissionSummary(execution, actionRequired, isActive) {
    const action = displayMissionAction(execution, actionRequired);
    return [
        translate("tui.orchestration.mission.id", { label: translate(isActive ? "tui.orchestration.mission.active" : "tui.orchestration.mission.latest"), id: execution.id }),
        translate("tui.orchestration.mission.step", { step: displayStep(execution.order.preconditions.nextStepId) }),
        translate("tui.orchestration.mission.assistant", { assistant: displayTarget(execution.target) }),
        translate("tui.orchestration.mission.events"),
        ...displayMissionEvents(execution).map((event) => `  * ${event}`),
        translate("tui.orchestration.mission.expectedAction", { action: action.title }),
        translate("tui.orchestration.mission.reason", { reason: action.detail }),
    ];
}
function renderPreviewSummary(preview, selectedCandidateIndex) {
    const selected = selectedCandidateIndex === undefined ? undefined : preview.candidates[selectedCandidateIndex];
    const compatible = selectableCandidates(preview);
    const unavailable = preview.candidates.filter((candidate) => !candidate.eligible);
    return [
        translate("tui.orchestration.preview.done"),
        `Feature : ${preview.featureName}`,
        translate("tui.orchestration.preview.work", { summary: preview.summary }),
        translate("tui.orchestration.mission.step", { step: displayStep(preview.stepId) }),
        translate("tui.orchestration.preview.role", { role: displayRole(preview.role) }),
        translate("tui.orchestration.preview.scope", { scope: preview.scopePaths.map(displayScopePath).join(" - ") }),
        translate("tui.orchestration.preview.permissions", { permissions: preview.requiredPermissions.map(displayPermission).join(" - ") }),
        translate("tui.orchestration.preview.target", { target: selected?.eligible === true && selected.target.model !== undefined ? displayTarget(selected.target) : translate("tui.orchestration.preview.target.none") }),
        ...(compatible.length > 1 ? [translate("tui.orchestration.preview.other", { count: formatNumber(compatible.length - 1) })] : []),
        ...(unavailable.length === 0
            ? []
            : [translate("tui.orchestration.preview.unavailable", { choices: unavailable.map((candidate) => `${displayTarget(candidate.target)} (${candidate.reasons.map(displayCandidateReason).join(", ")})`).join(" - ") })]),
        translate("tui.orchestration.preview.recheck"),
    ];
}
function selectableCandidates(preview) {
    return preview.candidates
        .map((candidate, index) => ({ candidate, index }))
        .filter(({ candidate }) => candidate.eligible && candidate.target.model !== undefined)
        .sort((left, right) => Number(right.candidate.recommended) - Number(left.candidate.recommended));
}
function requireCurrentExecution(status) {
    const execution = status.activeExecution ?? status.latestExecution;
    if (execution === undefined)
        throw new Error("No assisted mission is available.");
    return execution;
}
function isRetryable(execution) {
    return execution?.status === "failed" || execution?.status === "cancelled" || execution?.status === "interrupted";
}
function previousMode(mode) {
    if (mode === "model-input")
        return "provider-selection";
    if (mode === "target-selection" || mode === "provider-selection")
        return "preview";
    return "overview";
}
function providerFromAction(action) {
    const value = action.slice("provider:".length);
    if (EXECUTION_PROVIDER_CHOICES.includes(value))
        return value;
    throw new Error("Unknown assistant selection.");
}
//# sourceMappingURL=orchestration-view.js.map