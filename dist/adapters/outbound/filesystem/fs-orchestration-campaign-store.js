/* Copyright 2026 Arka Labs - Licensed under Apache-2.0 */
import { join } from "node:path";
import { FeatureId } from "../../../domain/feature/feature-id.js";
import { OrchestrationCampaign } from "../../../domain/orchestration/orchestration-campaign.js";
import { isOrchestrationWorkspaceMode } from "../../../domain/orchestration/execution-policy.js";
import { isExecutionTarget } from "../../../domain/orchestration/types.js";
import { ProjectId } from "../../../domain/project/project-id.js";
import { readJson, writeJsonAtomic } from "./_shared/atomic-json.js";
import { withFileLock } from "./_shared/file-lock.js";
export class FsOrchestrationCampaignStore {
    async load(project) { return loadFile(project); }
    async update(project, transform) {
        const path = campaignPath(project.root);
        return withFileLock(path, async () => {
            const next = [...transform(await loadFile(project))];
            if (next.some((campaign) => !campaign.projectId.equals(project.id)))
                throw new Error("Campaign belongs to another Project.");
            await writeJsonAtomic(path, { schemaVersion: 1, projectId: project.id.value, campaigns: next.map(serialize) }, { mode: 0o600 });
            return next;
        });
    }
}
export function campaignPath(projectRoot) { return join(projectRoot, ".arka-norn", "campaigns.json"); }
async function loadFile(project) {
    const value = await readJson(campaignPath(project.root));
    if (value === undefined)
        return [];
    if (!isRecord(value) || value["schemaVersion"] !== 1 || value["projectId"] !== project.id.value || !Array.isArray(value["campaigns"]))
        throw new Error("Invalid orchestration campaign store.");
    return value["campaigns"].map(deserialize);
}
function serialize(campaign) {
    const value = campaign.props;
    return { ...value, projectId: value.projectId.value, featureId: value.featureId.value, target: { ...value.target }, scopePaths: [...value.scopePaths], missionIds: [...value.missionIds], decisions: value.decisions.map((decision) => ({ ...decision, recordedAt: decision.recordedAt.toISOString() })), createdAt: value.createdAt.toISOString(), updatedAt: value.updatedAt.toISOString() };
}
function deserialize(value) {
    if (!isRecord(value) || typeof value["projectId"] !== "string" || typeof value["featureId"] !== "string" || typeof value["createdAt"] !== "string" || typeof value["updatedAt"] !== "string" || !isExecutionTarget(value["target"]) || !isOrchestrationWorkspaceMode(value["workspaceMode"]))
        throw new Error("Invalid orchestration campaign record.");
    const raw = value;
    const decisions = Array.isArray(value["decisions"])
        ? value["decisions"].map((decision) => ({ ...decision, recordedAt: new Date(decision.recordedAt) }))
        : [];
    return OrchestrationCampaign.create({ ...raw, retryCount: typeof value["retryCount"] === "number" ? value["retryCount"] : 0, projectId: ProjectId.of(value["projectId"]), featureId: FeatureId.of(value["featureId"]), decisions, createdAt: new Date(value["createdAt"]), updatedAt: new Date(value["updatedAt"]) });
}
function isRecord(value) { return typeof value === "object" && value !== null && !Array.isArray(value); }
//# sourceMappingURL=fs-orchestration-campaign-store.js.map