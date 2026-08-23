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
export const AUDIT_MODES = ["discovery", "audit", "mixed"];
export const AUDIT_DEPTHS = ["inventory", "static", "connected", "dynamic"];
export const AUDIT_MODULE_IDS = ["M00", "M01", "M02", "M03", "M04", "M05", "M06", "M07", "M08", "M09", "M10", "M11"];
export const AUDIT_RUN_STATUSES = ["planned", "collecting", "analyzing", "completed", "partial", "blocked", "failed", "cancelled", "interrupted"];
export const MODULE_EXECUTION_STATUSES = ["complete", "partial", "blocked", "error", "skipped"];
export const ASSESSMENT_STATUSES = ["pass", "warn", "fail", "unknown", "not_applicable"];
export const FINDING_SEVERITIES = ["critical", "high", "medium", "low", "info"];
export const CONFIDENCE_LEVELS = ["high", "medium", "low"];
export const FINDING_ORIGINS = ["observed", "inferred"];
export const KB_RECORD_TYPES = ["fact", "metric", "evidence", "finding", "risk", "decision", "artifact"];
export function isAuditModuleId(value) {
    return typeof value === "string" && AUDIT_MODULE_IDS.includes(value);
}
export function isAuditDepth(value) {
    return typeof value === "string" && AUDIT_DEPTHS.includes(value);
}
export function isAuditMode(value) {
    return typeof value === "string" && AUDIT_MODES.includes(value);
}
export function isModuleExecutionStatus(value) {
    return typeof value === "string" && MODULE_EXECUTION_STATUSES.includes(value);
}
export function isAssessmentStatus(value) {
    return typeof value === "string" && ASSESSMENT_STATUSES.includes(value);
}
export function isFindingSeverity(value) {
    return typeof value === "string" && FINDING_SEVERITIES.includes(value);
}
export function isConfidenceLevel(value) {
    return typeof value === "string" && CONFIDENCE_LEVELS.includes(value);
}
export function isFindingOrigin(value) {
    return typeof value === "string" && FINDING_ORIGINS.includes(value);
}
//# sourceMappingURL=audit-types.js.map