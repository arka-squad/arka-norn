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
import { createMenuScene } from "../../adapters/inbound/tui/components/menu.js";
import { createResultView } from "../../adapters/inbound/tui/views/result-view.js";
import { translate } from "../../application/localization/locale.js";
export function createResourceConfirmationController(deps) {
    return {
        forgetFeature(feature) {
            confirm({
                title: translate("tui.resource.removeTitle", { name: feature.name }),
                confirmLabel: translate("tui.resource.removeConfirm", { name: feature.name }),
                run: () => deps.features.forget(feature.id),
                onSuccess: deps.onFeatureForgotten,
            });
        },
        forgetProject(project) {
            confirm({
                title: translate("tui.resource.removeTitle", { name: project.name }),
                confirmLabel: translate("tui.resource.removeConfirm", { name: project.name }),
                run: () => deps.projects.forget(project.id),
                onSuccess: deps.onProjectForgotten,
            });
        },
    };
    function confirm(input) {
        deps.app.push(createMenuScene([
            { label: input.confirmLabel, value: "confirm" },
            { label: translate("tui.resource.cancel"), value: "cancel" },
        ], {
            title: input.title,
            hint: translate("tui.resource.removeHint"),
            onSelect: (choice) => {
                deps.app.pop();
                if (choice === "cancel")
                    return;
                void input.run().then(input.onSuccess, (error) => deps.app.push(createResultView({ title: translate("tui.resource.removeFailure"), code: 1, output: error instanceof Error ? error.message : String(error), onBack: () => { } })));
            },
            onCancel: () => { },
        }));
    }
}
//# sourceMappingURL=resource-confirmation-controller.js.map