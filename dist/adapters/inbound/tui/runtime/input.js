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
import { emitKeypressEvents } from "node:readline";
export function mapKeypress(ch, info) {
    if (info === undefined)
        return undefined;
    if (info.ctrl === true && info.name === "c")
        return { kind: "interrupt" };
    switch (info.name) {
        case "up":
            return { kind: "up" };
        case "down":
            return { kind: "down" };
        case "left":
            return { kind: "left" };
        case "right":
            return { kind: "right" };
        case "return":
            return { kind: "enter" };
        case "escape":
            return { kind: "escape" };
        case "backspace":
            return { kind: "backspace" };
        case "tab":
            return { kind: "tab" };
        default:
            break;
    }
    if (ch === undefined || ch === "")
        return undefined;
    if (info.ctrl === true || info.meta === true)
        return undefined;
    if (ch === "q")
        return { kind: "quit" };
    if (ch === "/")
        return { kind: "filter" };
    if (ch === "?")
        return { kind: "help" };
    return { kind: "char", value: ch };
}
export function createInputSource(stdin) {
    const listeners = new Set();
    let started = false;
    const onKeypress = (ch, info) => {
        const event = mapKeypress(ch, info);
        if (event === undefined)
            return;
        for (const listener of [...listeners]) {
            try {
                listener(event);
            }
            catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                process.stderr.write(`[arka-norn-tui] input listener threw: ${message}\n`);
            }
        }
    };
    return {
        start() {
            if (started)
                return;
            if (stdin.isTTY !== true)
                return;
            emitKeypressEvents(stdin);
            stdin.setRawMode?.(true);
            stdin.resume();
            stdin.setEncoding("utf8");
            stdin.on("keypress", onKeypress);
            started = true;
        },
        stop() {
            if (!started)
                return;
            stdin.removeListener("keypress", onKeypress);
            stdin.setRawMode?.(false);
            stdin.pause();
            started = false;
        },
        on(listener) {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
    };
}
//# sourceMappingURL=input.js.map