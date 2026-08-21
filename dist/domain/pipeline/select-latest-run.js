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
export function selectLatestRun(documents) {
    return [...documents].sort((left, right) => {
        const bySequence = (right.sequence ?? -1) - (left.sequence ?? -1);
        if (bySequence !== 0)
            return bySequence;
        const byDate = timestamp(right.createdAt) - timestamp(left.createdAt);
        if (byDate !== 0)
            return byDate;
        return (right.id ?? "").localeCompare(left.id ?? "");
    })[0];
}
function timestamp(value) {
    if (value === undefined)
        return -1;
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? -1 : parsed;
}
//# sourceMappingURL=select-latest-run.js.map