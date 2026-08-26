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
import { existsSync } from "node:fs";
import { constants } from "node:fs";
import { accessSync } from "node:fs";
import { platform } from "node:os";
import { delimiter, join } from "node:path";
export const SUPPORTED_HOSTS = ["codex", "claude"];
export function detectHosts(envPath = process.env.PATH) {
    const pathEntries = (envPath ?? "").split(delimiter).filter((entry) => entry.length > 0);
    const detected = new Map();
    for (const host of SUPPORTED_HOSTS) {
        const found = findExecutable(host, pathEntries);
        if (found !== undefined) {
            detected.set(host, { host, command: host, path: found });
        }
    }
    const missing = SUPPORTED_HOSTS.filter((host) => !detected.has(host));
    return { detected: Array.from(detected.values()), missing };
}
export function detectHostsFiltered(hostFilter, envPath = process.env.PATH) {
    if (hostFilter === "all")
        return detectHosts(envPath);
    const full = detectHosts(envPath);
    const detected = full.detected.filter((item) => item.host === hostFilter);
    const missing = detected.length === 0 ? [hostFilter] : [];
    return { detected, missing };
}
function findExecutable(command, pathEntries) {
    const extensions = platform() === "win32" ? [".exe", ".cmd", ".bat", ""] : [""];
    for (const directory of pathEntries) {
        for (const extension of extensions) {
            const candidate = join(directory, `${command}${extension}`);
            if (isExecutable(candidate))
                return candidate;
        }
    }
    return undefined;
}
function isExecutable(filePath) {
    try {
        if (!existsSync(filePath))
            return false;
        accessSync(filePath, constants.X_OK);
        return true;
    }
    catch {
        return false;
    }
}
export function formatHosts(hosts) {
    return hosts.map((host) => `${host.command}${host.path === undefined ? "" : ` (${host.path})`}`).join(", ");
}
//# sourceMappingURL=host-detector.js.map