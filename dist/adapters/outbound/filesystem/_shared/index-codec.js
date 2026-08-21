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
export function isIndexFile(kind, value) {
    return kind === "projects" ? isProjectIndexFile(value) : isFeatureIndexFile(value);
}
export function isProjectIndexFile(value) {
    const entries = indexEntries(value);
    return entries !== undefined && entries.every(isProjectEntry);
}
export function isFeatureIndexFile(value) {
    const entries = indexEntries(value);
    return entries !== undefined && entries.every(isFeatureEntry);
}
function indexEntries(value) {
    if (typeof value !== "object" || value === null || Array.isArray(value))
        return undefined;
    const index = value;
    return index["schemaVersion"] === 2 && Array.isArray(index["entries"]) ? index["entries"] : undefined;
}
function isProjectEntry(value) {
    const entry = record(value);
    return entry !== undefined && string(entry, "id") && string(entry, "root") && string(entry, "name") && dateTime(entry, "updatedAt");
}
function isFeatureEntry(value) {
    const entry = record(value);
    return entry !== undefined && string(entry, "id") && string(entry, "projectId") && string(entry, "root") && string(entry, "name") && dateTime(entry, "updatedAt");
}
function record(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value) ? value : undefined;
}
function string(value, key) {
    return typeof value[key] === "string" && value[key].length > 0;
}
function dateTime(value, key) {
    return string(value, key) && !Number.isNaN(Date.parse(value[key]));
}
//# sourceMappingURL=index-codec.js.map