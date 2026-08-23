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
import { translate } from "../../../../application/localization/locale.js";
import { titledBox } from "./box.js";
export function renderGuidance(content, theme) {
    const lines = [
        content.purpose,
        "",
        ...content.steps.map((step, index) => `${index + 1}. ${step}`),
        ...(content.shortcuts === undefined ? [] : ["", translate("tui.guidance.shortcuts"), ...content.shortcuts.map((shortcut) => `* ${shortcut}`)]),
        "",
        translate("tui.guidance.close"),
    ];
    return titledBox(content.title, lines, theme, { border: theme.arkaRed }).split("\n");
}
export function nextActionLine(action, reason, theme) {
    return `  ${theme.bold(translate("tui.guidance.nextAction"))}: ${theme.arkaAccent(action)} ${theme.gray(`- ${reason}`)}`;
}
export function guidedShortcuts() {
    return [
        translate("tui.shortcut.move"),
        translate("tui.shortcut.execute"),
        translate("tui.shortcut.filter"),
        translate("tui.shortcut.back"),
        translate("tui.shortcut.help"),
    ];
}
//# sourceMappingURL=guidance.js.map