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
import { guidedShortcuts, renderGuidance } from "../components/guidance.js";
import { formatNumber, translate } from "../../../../application/localization/locale.js";
export function createResultView(deps) {
    const outputLines = deps.output.replace(/\n$/, "").split("\n");
    const maxVisible = Math.max(3, deps.maxVisibleLines ?? 16);
    let offset = 0;
    let helpVisible = false;
    return {
        onKey(event) {
            if (event.kind === "help") {
                helpVisible = !helpVisible;
                return "consumed";
            }
            if (helpVisible) {
                if (event.kind === "escape")
                    helpVisible = false;
                return "consumed";
            }
            if (event.kind === "enter" || event.kind === "escape" || event.kind === "quit") {
                deps.onBack();
                return "pop";
            }
            if (event.kind === "up")
                offset = Math.max(0, offset - 1);
            if (event.kind === "down")
                offset = Math.min(Math.max(0, outputLines.length - maxVisible), offset + 1);
            return "consumed";
        },
        render(renderer, theme) {
            renderer.redraw((line) => {
                if (helpVisible) {
                    for (const value of renderGuidance({
                        title: translate("tui.result.help.title", { title: deps.title }),
                        purpose: translate("tui.result.help.purpose"),
                        steps: [
                            translate("tui.result.help.step1"),
                            translate("tui.result.help.step2"),
                            translate("tui.result.help.step3"),
                        ],
                        shortcuts: guidedShortcuts(),
                    }, theme))
                        line(value);
                    return;
                }
                line(`  ${theme.bold(deps.title)}`);
                line("");
                const statusLabel = deps.code === 0 ? theme.green("OK") : theme.red(translate("tui.result.failure", { code: formatNumber(deps.code) }));
                line(`  ${translate("tui.result.status", { status: statusLabel })}`);
                line("");
                if (offset > 0)
                    line(`  ${theme.dim(`${String.fromCharCode(0x25b2)} ${translate("tui.result.above", { count: formatNumber(offset) })}`)}`);
                for (const value of outputLines.slice(offset, offset + maxVisible))
                    line(`  ${value}`);
                const remaining = outputLines.length - offset - maxVisible;
                if (remaining > 0)
                    line(`  ${theme.dim(`${String.fromCharCode(0x25bc)} ${translate("tui.result.below", { count: formatNumber(remaining) })}`)}`);
                line("");
                line(`  ${theme.bold(translate("tui.result.next"))}: ${deps.nextStep ?? translate(deps.code === 0 ? "tui.result.next.success" : "tui.result.next.failure")}`);
                line("");
                line(`  ${theme.dim(translate("tui.result.hint"))}`);
            });
        },
    };
}
//# sourceMappingURL=result-view.js.map