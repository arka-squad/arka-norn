import { FeatureNotFoundError, FeatureWorkflowImmutableError } from "../../domain/errors.js";
import { loadIndexedFeatureWithinProject } from "./_shared/verified-feature.js";
export function setFeatureWorkflowUseCaseFactory(deps) {
    return async (input) => {
        const entry = await deps.indexStore.find(input.id);
        if (entry === undefined)
            throw new FeatureNotFoundError(input.id.value);
        const feature = await loadIndexedFeatureWithinProject(deps, entry);
        const recognized = new Set(input.recognizedDocumentTypes);
        for (const name of await deps.filesystem.readDir(feature.root)) {
            if (!name.endsWith(".json"))
                continue;
            const filePath = deps.filesystem.resolve(feature.root, name);
            if (!(await deps.filesystem.stat(filePath)).isFile)
                continue;
            let type;
            try {
                const document = JSON.parse(await deps.filesystem.readFile(filePath));
                type = typeof document === "object" && document !== null && !Array.isArray(document)
                    ? document["type"]
                    : undefined;
            }
            catch {
                continue;
            }
            if (typeof type === "string" && recognized.has(type))
                throw new FeatureWorkflowImmutableError(feature.id.value, type);
        }
        const updated = feature.withPipelineId(input.pipelineId, deps.clock.now());
        await deps.featureStore.save(updated);
        await deps.indexStore.upsert({
            id: updated.id.value,
            projectId: updated.projectId.value,
            root: updated.root,
            name: updated.name,
            updatedAt: updated.updatedAt,
        });
        return updated;
    };
}
//# sourceMappingURL=set-feature-workflow.js.map