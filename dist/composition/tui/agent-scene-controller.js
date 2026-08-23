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
import { createTextInputScene } from "../../adapters/inbound/tui/components/text-input.js";
import { createAgentDetailView } from "../../adapters/inbound/tui/views/agent-detail-view.js";
import { createAgentRegistryView } from "../../adapters/inbound/tui/views/agent-registry-view.js";
import { createResultView } from "../../adapters/inbound/tui/views/result-view.js";
import { CANONICAL_PRODUCT_RESPONSIBILITIES } from "../../domain/agent/product-agent-defaults.js";
import { FeatureId } from "../../domain/feature/feature-id.js";
import { translate } from "../../application/localization/locale.js";
export function createAgentSceneController(app, agentsPort) {
    let mutationInFlight = false;
    return {
        async open(project, onChanged) {
            await pushRegistry(project, onChanged);
        },
    };
    async function pushRegistry(project, onChanged) {
        const [agents, current, sessions] = await Promise.all([agentsPort.list(project), agentsPort.current(project), agentsPort.sessions(project)]);
        onChanged(agents, current);
        app.push(createAgentRegistryView({
            project,
            agents,
            ...(current === undefined ? {} : { currentAgentId: current.id.value }),
            sessionId: agentsPort.sessionId.value,
            sessionBindings: sessions.map((binding) => ({ sessionId: binding.sessionId.value, agentId: binding.agent.id.value })),
            onBack: () => app.pop(),
            onRegister: () => registerFlow(project, onChanged),
            onOpenAgent: (agent) => openDetail(project, agent, current?.id.value === agent.id.value, onChanged),
        }));
    }
    function registerFlow(project, onChanged) {
        prompt(translate("tui.agentForm.provider.title"), translate("tui.agentForm.provider.hint"), "", true, (provider) => {
            if (agentsPort.sessionId.value === "main") {
                prompt(translate("tui.agentForm.product.title"), translate("tui.agentForm.product.hint"), translate("tui.agentForm.product.default"), true, (responsibilities) => {
                    const normalizedResponsibilities = responsibilities === translate("tui.agentForm.product.default")
                        ? CANONICAL_PRODUCT_RESPONSIBILITIES
                        : split(responsibilities, ";");
                    void runMutation(project, false, () => agentsPort.register({ project, provider, role: "product", responsibilities: normalizedResponsibilities }), translate("tui.agentForm.product.saved"), onChanged);
                });
                return;
            }
            prompt(translate("tui.agentForm.role.title"), translate("tui.agentForm.role.hint"), "dev", true, (role) => {
                prompt(translate("tui.agentForm.features.title"), translate("tui.agentForm.features.hint"), "", false, (features) => {
                    prompt(translate("tui.agentForm.paths.title"), translate("tui.agentForm.paths.hint"), "", false, (paths) => {
                        prompt(translate("tui.agentForm.responsibilities.title"), translate("tui.agentForm.responsibilities.hint"), "", false, (responsibilities) => {
                            void runMutation(project, false, () => agentsPort.register({
                                project,
                                provider,
                                role,
                                ...(features.trim() === "" ? {} : { featureIds: split(features, ",").map((value) => FeatureId.of(value)) }),
                                ...(paths.trim() === "" ? {} : { paths: split(paths, ",") }),
                                ...(responsibilities.trim() === "" ? {} : { responsibilities: split(responsibilities, ";") }),
                            }), translate("tui.agentForm.saved"), onChanged);
                        });
                    });
                });
            });
        });
    }
    function openDetail(project, agent, current, onChanged) {
        app.push(createAgentDetailView({
            agent,
            current,
            onBack: () => app.pop(),
            onSelect: () => runMutation(project, true, () => agentsPort.select(project, agent.id), translate("tui.agentForm.selected"), onChanged),
            onReplace: () => replaceFlow(project, agent, onChanged),
            onDeactivate: () => confirmDeactivate(project, agent, onChanged),
        }));
    }
    function replaceFlow(project, replaced, onChanged) {
        prompt(translate("tui.agentForm.replace.providerTitle"), translate("tui.agentForm.replace.providerHint"), "", true, (provider) => {
            prompt(translate("tui.agentForm.replace.title"), translate("tui.agentForm.replace.hint"), replaced.role, true, (role) => {
                void runMutation(project, true, () => agentsPort.replace({ project, replacedAgentId: replaced.id, provider, role }), translate("tui.agentForm.replaced"), onChanged);
            });
        });
    }
    function confirmDeactivate(project, agent, onChanged) {
        app.push(createMenuScene([
            { label: translate("tui.agentForm.deactivate.confirm", { agent: agent.id.value }), value: "confirm", description: translate("tui.agentForm.deactivate.description") },
            { label: translate("tui.agentForm.deactivate.cancel"), value: "cancel" },
        ], {
            title: translate("tui.agentForm.deactivate.title"),
            hint: translate("tui.agentForm.deactivate.hint"),
            onSelect(value) {
                app.pop();
                if (value === "confirm")
                    void runMutation(project, true, () => agentsPort.deactivate(project, agent.id), translate("tui.agentForm.deactivated"), onChanged);
            },
        }));
    }
    function prompt(title, hint, initialValue, required, next) {
        app.push(createTextInputScene({
            title,
            hint,
            initialValue,
            required,
            onCancel: () => { },
            onSubmit(value) {
                app.pop();
                next(value.trim());
            },
        }));
    }
    async function runMutation(project, fromDetail, operation, title, onChanged) {
        // Menu callbacks are asynchronous; adjacent inputs must never create
        // concurrent writes in the registry.
        if (mutationInFlight)
            return;
        mutationInFlight = true;
        try {
            const result = await operation();
            if (fromDetail)
                app.pop();
            app.pop();
            await pushRegistry(project, onChanged);
            app.push(createResultView({
                title,
                code: 0,
                output: `${result.id.value}\n${translate("tui.agentForm.result.state", { state: translate(result.active ? "tui.agent.active" : "tui.agent.inactive") })}\n${translate("tui.agentForm.result.next")}\n`,
                onBack: () => { },
            }));
        }
        catch (error) {
            app.push(createResultView({
                title: translate("tui.agentForm.result.failure", { title }),
                code: 3,
                output: `${error instanceof Error ? error.message : String(error)}\n${translate("tui.agentForm.result.noTransition")}\n`,
                onBack: () => { },
            }));
        }
        finally {
            mutationInFlight = false;
        }
    }
}
function split(value, separator) {
    return value.split(separator).map((item) => item.trim()).filter(Boolean);
}
//# sourceMappingURL=agent-scene-controller.js.map