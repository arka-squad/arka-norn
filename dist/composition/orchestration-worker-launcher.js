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
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
export function createNodeOrchestrationWorkerLauncher(input) {
    const cliEntry = resolve(input.frameworkRoot, "bin", "arka-norn.mjs");
    const environment = input.environment ?? process.env;
    return {
        launch(request) {
            if (!existsSync(cliEntry))
                throw new Error("The local arka-norn worker entrypoint is unavailable.");
            const child = spawn(process.execPath, [cliEntry, "orchestration", "_worker", "--project", request.projectId, "--execution", request.executionId], {
                cwd: input.frameworkRoot,
                detached: true,
                stdio: "ignore",
                windowsHide: true,
                env: workerEnvironment(input.homeDir, environment),
            });
            child.unref();
            return Promise.resolve();
        },
    };
}
function workerEnvironment(homeDir, source) {
    const names = [
        "ARKA_NORN_CODEX_ACP_COMMAND",
        "ARKA_NORN_CODEX_ACP_ARGS",
        "ARKA_NORN_KIMI_ACP_COMMAND",
        "ARKA_NORN_MASTRA_CLAUDE_ENABLED",
        "ARKA_NORN_MASTRA_ZAI_ENABLED",
        "ARKA_NORN_MASTRA_CLAUDE_API_KEY",
        "ARKA_NORN_MASTRA_CODEX_API_KEY",
        "ARKA_NORN_MASTRA_KIMI_API_KEY",
        "ARKA_NORN_MASTRA_ZAI_API_KEY",
        "LANG",
        "LC_ALL",
        "LC_CTYPE",
        "TERM",
        "NO_COLOR",
        "TZ",
    ];
    const result = { ARKA_NORN_HOME: homeDir };
    for (const name of names) {
        const value = source[name];
        if (value !== undefined)
            result[name] = value;
    }
    return result;
}
//# sourceMappingURL=orchestration-worker-launcher.js.map