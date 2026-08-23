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
import { pipelineExitCode, presentPipelineReport } from "../../adapters/inbound/cli/presenters/pipeline-report-presenter.js";
import { createMenuScene } from "../../adapters/inbound/tui/components/menu.js";
import { createTextInputScene } from "../../adapters/inbound/tui/components/text-input.js";
import { createResultView } from "../../adapters/inbound/tui/views/result-view.js";
import { AgentScopeViolationError } from "../../domain/errors.js";
import { relative } from "node:path";
import { formatNumber, translate } from "../../application/localization/locale.js";
export function createPipelineSceneController(app, pipeline, authorRegistryForFeature) {
    const inspect = async (feature) => pipeline.inspect({
        featureRoot: feature.root,
        featureId: feature.id.value,
        pipelineId: feature.pipelineId,
        documentContractVersion: feature.documentContractVersion,
        authorRegistry: await authorRegistryForFeature(feature),
    });
    return {
        async showStatus(feature) {
            const report = await inspect(feature);
            app.push(createResultView({
                title: translate("tui.pipeline.statusTitle"), code: pipelineExitCode(report), output: presentPipelineReport(report), onBack: () => { },
                nextStep: report.nextActions[0] === undefined ? translate("tui.pipeline.complete") : translate("tui.pipeline.next", { kind: report.nextActions[0].kind, step: report.nextActions[0].stepId, reason: report.nextActions[0].reason }),
            }));
        },
        async showGuidance(feature) {
            const report = await inspect(feature);
            const action = report.nextActions[0];
            const output = action === undefined
                ? `${translate("tui.pipeline.workflowComplete")}\n`
                : [
                    translate("tui.pipeline.phase", { phase: action.phase ?? action.stepId }),
                    translate("tui.pipeline.instructions", { instructions: (action.instructions ?? []).join(" ") }),
                    translate("tui.pipeline.reason", { reason: action.reason }),
                    translate("tui.pipeline.expectedEvidence"),
                    translate("tui.pipeline.document", { step: action.stepId }),
                    translate("tui.pipeline.command", { command: action.suggestedCommand ?? `arka-norn pipeline scaffold ${action.stepId} --feature ${feature.id.value}` }),
                ].join("\n") + "\n";
            app.push(createResultView({
                title: translate(feature.pipelineId === "arka-norn-fastdev" ? "tui.pipeline.continueRework" : "tui.pipeline.continueFeature"),
                code: pipelineExitCode(report),
                output,
                onBack: () => { },
                nextStep: action === undefined ? translate("tui.pipeline.workflowComplete") : translate("tui.pipeline.execute"),
            }));
        },
        async scaffold(feature, author, projectRoot) {
            if (!author.coversFeature(feature.id))
                throw new AgentScopeViolationError(author.id.value, `feature:${feature.id.value}`);
            const authorAgentId = author.id.value;
            const [steps, report] = await Promise.all([
                pipeline.listSteps(feature.pipelineId, feature.documentContractVersion),
                inspect(feature),
            ]);
            const recommended = report.nextActions[0]?.stepId;
            const orderedSteps = [...steps].sort((left, right) => Number(right.id === recommended) - Number(left.id === recommended));
            app.push(createMenuScene(orderedSteps.map((step) => ({
                label: `${step.id === recommended ? `* ${translate("tui.pipeline.recommended")}` : ""}${step.id}`,
                value: step.id,
                description: step.id === recommended
                    ? report.nextActions[0]?.reason ?? translate("tui.pipeline.nextCalculated")
                    : translate(step.required ? "tui.pipeline.requiredLater" : step.transversal ? "tui.pipeline.transversal" : "tui.pipeline.optional"),
            })), {
                title: translate("tui.pipeline.generateTitle", { agent: authorAgentId }),
                hint: translate("tui.pipeline.generateHint"),
                onSelect: (stepId) => {
                    app.pop();
                    app.push(createTextInputScene({
                        title: translate("tui.pipeline.scaffoldTitle", { step: stepId }),
                        hint: translate("tui.pipeline.pathHint", { agent: authorAgentId }),
                        initialValue: `${feature.root}/${stepId}.json`,
                        onSubmit: (outputPath) => {
                            app.pop();
                            const projectRelativeOutput = relative(projectRoot, outputPath);
                            if (!author.coversProjectPath(projectRelativeOutput)) {
                                app.push(errorView(translate("tui.pipeline.scaffoldTitle", { step: stepId }), new AgentScopeViolationError(author.id.value, `path:${projectRelativeOutput}`)));
                                return;
                            }
                            void pipeline.scaffold({ stepId, outputPath, allowedRoot: feature.root, authorAgentId, featureId: feature.id.value, pipelineId: feature.pipelineId, documentContractVersion: feature.documentContractVersion }).then((result) => app.push(createResultView({
                                title: translate("tui.pipeline.scaffoldTitle", { step: stepId }),
                                code: 0,
                                output: translate("tui.pipeline.scaffoldWritten", { path: result.outputPath, count: formatNumber(result.sentinelPaths.length) }),
                                onBack: () => { },
                                nextStep: translate("tui.pipeline.scaffoldNext"),
                            })), (error) => app.push(errorView(translate("tui.pipeline.scaffoldTitle", { step: stepId }), error)));
                        },
                        onCancel: () => { },
                    }));
                },
                onCancel: () => { },
            }));
        },
        validate(feature) {
            app.push(createTextInputScene({
                title: translate("tui.pipeline.validateTitle"),
                hint: translate("tui.pipeline.validateHint"),
                initialValue: `${feature.root}/`,
                onSubmit: (filePath) => {
                    app.pop();
                    void pipeline.validate({ filePath, pipelineId: feature.pipelineId }).then((result) => app.push(createResultView({
                        title: translate("tui.pipeline.validationTitle"),
                        code: result.valid ? 0 : 3,
                        output: result.valid ? translate("tui.pipeline.valid", { path: filePath }) : translate("tui.pipeline.invalid", { path: filePath, errors: result.errors.map((error) => `- ${error}`).join("\n") }),
                        onBack: () => { },
                        nextStep: translate(result.valid ? "tui.pipeline.validNext" : "tui.pipeline.invalidNext"),
                    })), (error) => app.push(errorView(translate("tui.pipeline.validationFailed"), error)));
                },
                onCancel: () => { },
            }));
        },
    };
}
function errorView(title, error) {
    const conflict = error instanceof Error && "code" in error && error.code === "EEXIST";
    return createResultView({ title, code: conflict ? 5 : 70, output: error instanceof Error ? error.message : String(error), onBack: () => { } });
}
//# sourceMappingURL=pipeline-scene-controller.js.map